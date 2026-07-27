import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  backupDatabase,
  DomainStateError,
  ensureLocalUser,
  openDatabase,
  SqliteInterruptionRepository,
  SqliteSessionRepository,
  SqliteSubjectRepository,
  SqliteSurveyRepository,
  type Database,
  type Repositories,
} from '@nerdyapp/core';
// The frozen schema, inlined into the bundle as a string. `core.readSchemaSql()`
// resolves via import.meta.url, which a bundle does not carry — `openDatabase`
// takes `schemaSql` for exactly this (plan P31A decision P11, P31B decision B3).
import schemaSql from '@nerdyapp/core/schema.sql?raw';

import { resolveDatabasePath, resolveUserDataDir } from './paths.js';

export interface SqliteBinding {
  repositories: Repositories;
  databasePath: string;
  close: () => void;
  /** Writes a consistent snapshot. Absent on the fixture binding by design. */
  backupTo: (targetPath: string) => void;
}

/**
 * `nerdyapp.exe` — the product, on the user's real study history.
 *
 * @param appDataDir `app.getPath('appData')`, passed in so this stays testable
 *                   and so the path decision lives in `paths.ts` alone.
 */
export function createSqliteBinding(appDataDir: string): SqliteBinding {
  const dir = resolveUserDataDir(appDataDir);
  mkdirSync(dir, { recursive: true });
  const databasePath = resolveDatabasePath(appDataDir);

  const db: Database = openDatabase({ file: databasePath, schemaSql });
  ensureLocalUser(db);

  const sessions = new SqliteSessionRepository(db);

  // CRASH RECOVERY RUNS HERE, ONCE, BEFORE ANY WINDOW EXISTS.
  //
  // It cannot distinguish a live session from a crashed one — "unterminated" is
  // the only signal schema v1 carries — so it must run before a session can
  // possibly be started. Moving this later, or onto a timer, would close the
  // session the user is sitting in front of.
  void sessions.recoverCrashedSessions();

  return {
    databasePath,
    repositories: {
      subjects: new SqliteSubjectRepository(db),
      sessions,
      surveys: new SqliteSurveyRepository(db),
      interruptions: new SqliteInterruptionRepository(db),
    },
    close: () => {
      db.close();
    },
    backupTo: (targetPath: string) => {
      // The save dialog lets the user navigate anywhere, including straight to
      // the live file. On POSIX that would unlink the database out from under
      // an open connection: sessions logged afterwards would go to an orphaned
      // inode and vanish on next launch.
      if (resolve(targetPath) === resolve(databasePath)) {
        throw new DomainStateError(
          'the backup target cannot be the live database — choose another file',
        );
      }
      backupDatabase(db, targetPath);
    },
  };
}
