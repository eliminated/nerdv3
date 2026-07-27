/**
 * `nerdyapp-test.exe` — the demo/debug build.
 *
 * Opens NO database at all. It runs on an in-memory fixture set so the whole
 * UX can be walked and debugged without touching real study history, and with
 * no file to corrupt (V3 spec §5).
 */
import { fileURLToPath, URL } from 'node:url';

import { start } from './main/index.js';

// This file is a rollup ENTRY, so it is never hoisted into a chunk and its
// own import.meta.url is always out/main/<entry>.js — the one stable anchor
// for finding the built renderer and preload.
start({
  label: 'NerdyApp (test build — example data, no database)',
  usesDatabase: false,
  outRoot: fileURLToPath(new URL('..', import.meta.url)),
});
