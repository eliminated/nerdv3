import { join } from 'node:path';

import type { Repositories } from '@nerdyapp/core';
import { app, BrowserWindow, ipcMain } from 'electron';

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
  readonly open: () => { repositories: Repositories; close: () => void };
}

const isSmoke = process.argv.includes('--smoke');

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

  if (process.env['ELECTRON_RENDERER_URL'] !== undefined) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(outRoot, 'renderer', 'index.html'));
  }
  return win;
}

export function start(bindings: AppBindings): void {
  outRoot = bindings.outRoot;
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
      const text = (await win.webContents.executeJavaScript(
        'document.body.innerText',
      )) as string;
      console.log('=== RENDERER DOM ===');
      console.log(text.trim());
      const ok = text.includes('NerdyApp');
      if (!ok) {
        const html = (await win.webContents.executeJavaScript(
          'document.documentElement.outerHTML',
        )) as string;
        console.log('=== OUTER HTML ===');
        console.log(html.slice(0, 1500));
      }
      console.log(ok ? '=== SMOKE PASS ===' : '=== SMOKE FAIL: renderer did not mount ===');
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
