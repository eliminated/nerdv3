import { existsSync, rmSync } from 'node:fs';

import type { Database } from './connection.js';

/**
 * Writes a consistent snapshot of the open database to `targetPath`.
 *
 * `VACUUM INTO` rather than a file copy: it is safe while connections are open
 * and WAL is active, whereas a raw copy can miss un-checkpointed writes and
 * produce a backup that is silently short of the most recent sessions — the
 * worst possible failure for a feature whose entire job is not losing data.
 *
 * SQLite refuses to overwrite, so an existing target is removed first. That is
 * a deliberate destructive step and the caller is expected to have obtained
 * confirmation (the save dialog does).
 *
 * Cheap insurance given V1's primary failure was losing the database
 * repeatedly to schema churn (masterplan §1).
 */
export function backupDatabase(db: Database, targetPath: string): void {
  if (existsSync(targetPath)) rmSync(targetPath);
  db.prepare('VACUUM INTO ?').run(targetPath);
}
