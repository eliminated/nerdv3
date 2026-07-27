import { expect, test } from 'vitest';

import { dirname, sep } from 'node:path';

import {
  DATABASE_FILENAME,
  flutterEraDatabasePath,
  resolveDatabasePath,
  resolveUserDataDir,
} from '../src/main/paths.js';

const APPDATA = 'C:\\Users\\Isaac\\AppData\\Roaming';

test('the V3 database is NOT the Flutter-era file', () => {
  // The single most consequential line in this slice. V3 spec §5: the Electron
  // build starts on a fresh database and the old file stays on disk untouched.
  // If these ever resolve to the same path, the rewrite would silently adopt —
  // and then rewrite — study history it was never meant to open.
  expect(resolveDatabasePath(APPDATA)).not.toBe(flutterEraDatabasePath(APPDATA));
});

test('the V3 directory is not a parent or child of the Flutter one either', () => {
  // Not the same string is too weak: nesting one inside the other would still
  // put the two apps' files in each other's way, and a delete-all in either
  // would take both.
  // `dirname` and `sep`, not a hard-coded backslash. The previous version
  // stripped a literal "\nerdyapp.db", so on a POSIX runner it matched nothing,
  // the filename stayed on the end, and BOTH assertions became trivially true.
  // It was real only because CI happens to pin windows-latest.
  const v3 = resolveUserDataDir(APPDATA);
  const flutter = dirname(flutterEraDatabasePath(APPDATA));
  expect(v3.startsWith(flutter + sep), 'V3 must not sit inside the Flutter dir').toBe(false);
  expect(flutter.startsWith(v3 + sep), 'Flutter must not sit inside the V3 dir').toBe(false);
});

test('the database sits under the app-data directory it was given', () => {
  expect(resolveDatabasePath(APPDATA).startsWith(APPDATA)).toBe(true);
  expect(resolveDatabasePath(APPDATA).endsWith(DATABASE_FILENAME)).toBe(true);
});

test('resolution is pure — same input, same output, no Electron needed', () => {
  // The point of the seam: this module is testable without a window, which is
  // why the path decision is checkable at all.
  expect(resolveDatabasePath(APPDATA)).toBe(resolveDatabasePath(APPDATA));
});
