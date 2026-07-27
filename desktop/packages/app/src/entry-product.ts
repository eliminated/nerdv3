/**
 * `nerdyapp.exe` — the product. Database-backed, the user's real study history.
 *
 * This file must NEVER import anything from `main/bindings-fixture`, directly
 * or transitively: that is what stops example data shipping as real history,
 * and a test asserts it (plan P31B, decision B4).
 */
import { fileURLToPath, URL } from 'node:url';

import { app } from 'electron';

import { createSqliteBinding } from './main/bindings-sqlite.js';
import { start } from './main/index.js';

/**
 * Where the database lives, overridable ONLY by an explicit flag.
 *
 * This exists because the smoke flow drives a REAL session — create a subject,
 * start, pause, end — and without an override it did that against the user's
 * actual study history. Eleven junk subjects and twenty-two interruptions were
 * written to a real database before this was caught, and there is no UI to
 * delete them.
 *
 * Every other isolation guard in this slice inspects CODE. None of them asked
 * which database the product binary was pointed at, which is exactly the kind
 * of gap that only shows up when someone looks at the artefact instead of the
 * source.
 *
 * The flag is not a feature: it is developer-only, it must be passed
 * explicitly, and the default is always the user's real directory.
 *
 * Named --nerdy-data-dir, NOT --user-data-dir: the latter is a reserved
 * Electron switch that moves `userData`, and re-purposing it to mean the
 * `appData` ROOT would give one flag two different meanings.
 */
function appDataDir(): string {
  const flag = process.argv.find((a) => a.startsWith('--nerdy-data-dir='));
  if (flag !== undefined) {
    const dir = flag.slice('--nerdy-data-dir='.length);
    console.log(`[nerdyapp] --nerdy-data-dir override in effect: ${dir}`);
    return dir;
  }
  return app.getPath('appData');
}

// This file is a rollup ENTRY, so it is never hoisted into a chunk and its
// own import.meta.url is always out/main/<entry>.js — the one stable anchor
// for finding the built renderer and preload.
start({
  label: 'NerdyApp',
  usesDatabase: true,
  outRoot: fileURLToPath(new URL('..', import.meta.url)),
  open: () => createSqliteBinding(appDataDir()),
});
