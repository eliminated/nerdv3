import { join } from 'node:path';

/**
 * Where the product build keeps its database.
 *
 * **The V3 Electron build starts on a FRESH database** (V3 spec §5, decided by
 * Isaac 2026-07-27). The Flutter-era file holds one subject and two sessions
 * from testing — nothing worth migrating — so this build creates its own rather
 * than opening that one. Consequences: there is no import path to write, no
 * risk to the old file, and `schema.sql` is still ported byte-faithfully
 * because the *schema* remains frozen even though the *data* does not carry
 * over.
 *
 * The old file must stay on disk untouched as a fallback, which is the entire
 * reason this is a named constant with a test rather than a string typed once
 * into a call to `app.getPath`.
 */
export const FLUTTER_ERA_DIRS = ['com.nerdyapp', 'nerdyapp'] as const;

/** Deliberately a sibling of the Flutter directory, not the same one. */
export const V3_DIRS = ['com.nerdyapp', 'nerdyapp-v3'] as const;

export const DATABASE_FILENAME = 'nerdyapp.db';

/**
 * Pure so it can be tested without an Electron runtime — `app.getPath` is the
 * only Electron-shaped part and it is supplied by the caller.
 *
 * @param appDataDir the OS roaming-app-data directory (`app.getPath('appData')`)
 */
export function resolveUserDataDir(appDataDir: string): string {
  return join(appDataDir, ...V3_DIRS);
}

export function resolveDatabasePath(appDataDir: string): string {
  return join(resolveUserDataDir(appDataDir), DATABASE_FILENAME);
}

/** The path the retired Flutter app used. Referenced ONLY so a test can prove
 *  the two never coincide — nothing in the app may read or write it. */
export function flutterEraDatabasePath(appDataDir: string): string {
  return join(appDataDir, ...FLUTTER_ERA_DIRS, DATABASE_FILENAME);
}
