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

// This file is a rollup ENTRY, so it is never hoisted into a chunk and its
// own import.meta.url is always out/main/<entry>.js — the one stable anchor
// for finding the built renderer and preload.
start({
  label: 'NerdyApp',
  usesDatabase: true,
  outRoot: fileURLToPath(new URL('..', import.meta.url)),
  open: () => createSqliteBinding(app.getPath('appData')),
});
