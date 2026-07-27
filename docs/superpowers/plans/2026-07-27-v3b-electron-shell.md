# V3-B — Electron shell, IPC, and the two builds: Implementation Plan

**Plan:** `P31B` · **Build iteration:** V3 · **Release version:** v0.1.0 (pre-alpha)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Hybrid execution —
> inline by default, dedicated independent review on the IPC boundary and the two-build seam.

**Goal:** `nerdyapp.exe` launches on Windows, creates a subject, runs a real session, and the data
survives a restart — with `nerdyapp-test.exe` doing the same against in-memory fixtures and opening
no database at all. Unstyled: the Modernist theme and the remaining six views are V3-C.

**Architecture:** `core` runs in the **main** process (it needs `fs`; the renderer must never reach
the database). The renderer talks to it over a **explicitly enumerated** `contextBridge` surface —
no generic dispatcher. The two executables differ only in which implementation of the `core`
repository interfaces gets bound at startup (V3 spec §5).

**Tech stack:** Electron 43.2.0 (Node 24.18.0) · electron-vite · Vue 3 · TypeScript strict · vitest.

---

## Settled by the spike (do not re-open)

**`node:sqlite` works in Electron 43.2.0** — verified 2026-07-27, ten capability checks, no
`--experimental-sqlite` flag (`npm run verify:sqlite`, probed red twice). `better-sqlite3` is not
needed and `packages/core/src/db/driver.ts` does not change. SQLite is 3.53.1 under Electron vs
3.51.2 under local Node 25.7 — both satisfy every check.

## Global constraints

Inherited from P31A and the governing documents; every task's requirements include these.

- **`core` imports neither Electron nor Vue.** The dependency arrow points inward only.
- **The renderer never reaches SQLite.** `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`. The preload surface is a hand-written allowlist of methods.
- **Schema v1 is FROZEN and additive-only.** `schema.sql` is ground truth; no task edits it.
- **The product starts on a FRESH database** (V3 spec §5). The V3-era Flutter `nerdyapp.db` is not
  opened, imported, or written. It stays on disk untouched.
- **Crash recovery runs once at launch, before any session can start** — it cannot distinguish a
  live session from a crashed one, which `SqliteSessionRepository` documents and a test pins.
- **The privacy line holds across the new boundary**: the write-confinement guard already scans
  every package under `desktop/packages/*`, so `app/` is covered the moment it exists. No IPC
  channel may accept or forward app identity.
- **Every mandated test names the change that would make it fail**, and guards are seen red.
- **Never pipe a test run through `grep` to decide whether it passed** — capture the exit code.
- Conventional Commits. Never `git add -A`.

## Port decisions (made here so no task re-litigates them)

| # | Decision | Why |
|---|---|---|
| **B1** | **electron-vite** as the bundler. | Handles main/preload/renderer in one config, gives Vue SFC support V3-C needs, and solves `schema.sql`-into-the-bundle. Plain vite would need three hand-rolled configs. |
| **B2** | **The preload surface is an explicit allowlist**, one method per repository operation — never `invoke(name, args)`. | A generic dispatcher lets a compromised renderer call anything reachable, and it makes the privacy surface unreviewable. Enumerating costs ~40 lines and makes every capability visible in one file. |
| **B3** | **`schema.sql` is imported as a string via vite's `?raw`**, and `openDatabase({ schemaSql })` receives it. | `readSchemaSql()` uses `import.meta.url`, which a bundle does not carry — the seam already exists in `core` for exactly this (P31A, decision P11). |
| **B4** | **The two builds are two entry points over one renderer**, selected by which binding module the main process imports. Not an env var read at runtime. | An env var means the product binary *contains* the fixture code and one wrong variable ships example data as real history. Separate entry points make it a build-time fact. |
| **B5** | **`nerdyapp-test.exe` opens no database at all** — the fixture repositories are pure in-memory objects implementing the same interfaces. | V3 spec §5, verbatim. It also makes the fixtures the natural test double for `ui` component tests in V3-C. |
| **B6** | **IPC errors cross the boundary as `{ ok: false, kind, message }`**, never as a thrown structured clone. | Electron's IPC does not preserve error subclasses, so `DomainStateError` vs `ValidationError` would collapse to `Error` and the renderer could not tell "rating out of range" from "session already ended". |
| **B7** | **The renderer holds no timer state.** It renders `ActiveSession` values pushed from main and sends intents back. | Invariant 4's ordering rule ("clear state BEFORE the last await") is a controller property; keeping one owner of that state in main means there is exactly one place it can be got wrong. The controller port itself is V3-C. |

## Out of scope, with owners

| Deferred | Owner |
|---|---|
| Modernist theme; the six remaining views | V3-C |
| `SessionController` port + the two mirror-ordering race tests | V3-C |
| Reactivity design (decision **V3-1**) beyond naive re-query on mutation | V3-C |
| `schema.sql`-vs-**live**-database test; the one-hour and kill-test gates | V3-D |
| `backup.dart` port (`VACUUM INTO` + save dialog) | this slice, Task 8 |
| Installer, code signing, auto-update | Phase 9 |

---

## File structure

```
desktop/
  electron.vite.config.ts          main / preload / renderer build
  packages/
    app/
      package.json                 @nerdyapp/app
      tsconfig.json
      src/
        main/
          index.ts                 app lifecycle, window, crash recovery at launch
          bindings-sqlite.ts       nerdyapp.exe    — binds core to SQLite
          bindings-fixture.ts      nerdyapp-test.exe — binds core to in-memory fixtures
          ipc.ts                   registers one handler per allowlisted operation
          paths.ts                 %APPDATA%/com.nerdyapp/nerdyapp-v3/nerdyapp.db
        preload/
          index.ts                 contextBridge allowlist (the reviewable surface)
        renderer/
          index.html
          main.ts                  Vue app mount
          App.vue                  unstyled: subjects + session + history
        entry-product.ts           imports bindings-sqlite
        entry-test.ts              imports bindings-fixture
      test/
        ipc-surface.test.ts        the allowlist is exactly what it claims
        fixtures.test.ts           fixture repositories satisfy the same contract
    core/                          unchanged except the fixture implementations
      src/data/fixtures/           in-memory implementations of the four ports
```

---

### Task 1 — `packages/app` skeleton and electron-vite

**Files:** create `desktop/electron.vite.config.ts`, `desktop/packages/app/{package.json,tsconfig.json}`,
`src/main/index.ts`, `src/preload/index.ts`, `src/renderer/{index.html,main.ts,App.vue}`.

- [ ] **Step 1:** add `electron-vite`, `vite`, `vue`, `@vitejs/plugin-vue` to the workspace root.
- [ ] **Step 2:** `electron.vite.config.ts` with three builds; `assetsInclude: ['**/*.sql']` so B3 works.
- [ ] **Step 3:** a window that loads the renderer and prints `process.versions.electron` into the DOM.
- [ ] **Step 4:** run it — `npm run dev` — and SEE the window. Record the observation.
- [ ] **Step 5:** commit.

**Exit:** a window opens. Nothing else is claimed.

---

### Task 2 — Fixture repositories in `core`

**Files:** create `desktop/packages/core/src/data/fixtures/*.ts`; test
`desktop/packages/core/test/data/fixtures.test.ts`.

The four interfaces get a second implementation backed by arrays. This is what makes B5 possible
and doubles as the V3-C test double.

- [ ] **Step 1:** write a **contract test** that runs the SAME assertions against both the SQLite and
      the fixture implementations, parameterised over the two. This is the test that matters: it is
      what stops the two bindings drifting apart.

```ts
describe.each([
  ['sqlite', makeSqliteRepos],
  ['fixture', makeFixtureRepos],
])('%s binding', (_name, make) => {
  test('a started session is absent from history until it ends', async () => { /* … */ });
  test('an ended session is immutable', async () => { /* … */ });
  test('a survey is refused for a crashed session', async () => { /* … */ });
});
```

- [ ] **Step 2:** run it — the fixture rows fail. Implement until both bindings pass identically.
- [ ] **Step 3:** probe RED: make the fixture accept a survey for a crashed session; the shared
      contract test must fail for `fixture` and pass for `sqlite`.
- [ ] **Step 4:** commit.

**Exit:** both bindings pass one shared contract suite.

---

### Task 3 — Main-process wiring and the fresh database

**Files:** `src/main/{paths.ts,bindings-sqlite.ts,bindings-fixture.ts,index.ts}`.

- [ ] **Step 1:** `paths.ts` resolves `app.getPath('userData')` to a **`nerdyapp-v3`** directory —
      deliberately NOT the Flutter-era `com.nerdyapp/nerdyapp/nerdyapp.db`, so the old file cannot
      be opened, migrated or written (V3 spec §5).
- [ ] **Step 2:** a test asserting the resolved path does not equal the V3 Flutter path. Probe red.
- [ ] **Step 3:** `bindings-sqlite.ts` opens the database with `schemaSql` from `?raw`, calls
      `ensureLocalUser`, then `recoverCrashedSessions()` **once**, before any window exists.
- [ ] **Step 4:** commit.

---

### Task 4 — The preload allowlist and IPC

**Files:** `src/main/ipc.ts`, `src/preload/index.ts`, test `test/ipc-surface.test.ts`.

- [ ] **Step 1:** write the surface test FIRST — it asserts the exposed method names are exactly a
      hand-written list, so a new capability cannot appear without editing the test.

```ts
test('the preload surface is exactly the allowlisted operations', () => {
  expect(Object.keys(api).sort()).toEqual([
    'createSubject', 'endSession', 'listHistory', 'listSubjects',
    'loadSessionDetail', 'logSelfReport', 'saveSurvey', 'startSession',
    'togglePause', 'updateSubject',
  ]);
});

test('no IPC channel accepts a free-text field that could carry app identity', () => {
  // The privacy line crosses the process boundary here for the first time.
});
```

- [ ] **Step 2:** implement `ipc.ts` with one `ipcMain.handle` per name, each returning the B6
      result envelope.
- [ ] **Step 3:** probe RED: add an eleventh method; the surface test fails.
- [ ] **Step 4:** commit.

---

### Task 5 — The renderer: subjects, session, history (unstyled)

- [ ] Create a subject, list subjects, start/pause/end a session, see it in history. No CSS beyond
      what makes it legible. **This is what satisfies L3** — a merge that ends in infrastructure and
      nothing to use is not a slice.
- [ ] Commit.

---

### Task 6 — The two executables

- [ ] **Step 1:** `entry-product.ts` / `entry-test.ts`; two electron-vite build targets.
- [ ] **Step 2:** a test asserting `entry-product` does not transitively import
      `bindings-fixture` — B4's whole point is that example data cannot ship as real history.
      Probe red by importing it.
- [ ] **Step 3:** build both; launch both; record what was seen.
- [ ] **Step 4:** commit.

---

### Task 7 — CI

- [ ] Add build steps for `app`; run `npm run verify:sqlite` in CI so an Electron bump that drops
      `node:sqlite` fails the build rather than shipping.
- [ ] Commit.

---

### Task 8 — Backup port

- [ ] `VACUUM INTO` through an Electron save dialog. `VACUUM INTO` needs the target absent — delete
      first; a raw file copy can miss un-checkpointed WAL writes.
- [ ] Commit.

---

### Task 9 — Review, PR, handoff

- [ ] Dedicated independent review on **the IPC boundary and the two-build seam** — ask "what could
      the renderer reach that it should not?" and "how could fixture data reach the product build?".
- [ ] Verify every finding before acting. PR into `feat/v4-electron-rewrite`. Squash. Update handoff.

---

## Manual verification (Isaac — cannot be delegated)

1. Launch `nerdyapp.exe`, create a subject, run a short session, **close and relaunch** — the
   subject and the session are still there.
2. Launch `nerdyapp-test.exe` — example data is present, and `%APPDATA%` gains **no** database file.
3. Kill `nerdyapp.exe` mid-session (pause first), relaunch — history shows `· crashed`.

The one-hour wall-clock accuracy check remains V3-D's.
