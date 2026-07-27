import { existsSync, renameSync, rmSync } from 'node:fs';

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
  // Vacuum to a temporary sibling, THEN replace. The previous shape deleted the
  // target first and vacuumed straight onto it, which inverted the guarantee
  // this function exists for: a failure part-way — a full disk is the obvious
  // one — left the user with no backup at all, having destroyed the last good
  // one to get there.
  //
  // A sibling rather than the OS temp directory, so the rename stays on one
  // filesystem and is therefore atomic.
  const temporary = `${targetPath}.incomplete`;
  if (existsSync(temporary)) rmSync(temporary, { force: true });

  try {
    db.prepare('VACUUM INTO ?').run(temporary);
  } catch (error) {
    // Leave no half-written file wearing a plausible name.
    if (existsSync(temporary)) rmSync(temporary, { force: true });
    throw error;
  }

  // Overwrites on both Windows and POSIX, so the previous backup survives right
  // up until a complete replacement exists.
  renameSync(temporary, targetPath);
}
