import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';

import { SqliteSubjectRepository } from '../../src/data/subject-repository.js';
import { backupDatabase } from '../../src/db/backup.js';
import { openDatabase, type Database } from '../../src/db/connection.js';
import { ensureLocalUser } from '../../src/db/local-user.js';

let dir: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nerdy-backup-'));
  db = openDatabase({ file: join(dir, 'live.db') });
  ensureLocalUser(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('a backup opens as a valid database with the same rows', async () => {
  await new SqliteSubjectRepository(db).create({ name: 'Physics' });
  await new SqliteSubjectRepository(db).create({ name: 'Maths' });

  const target = join(dir, 'backup.db');
  backupDatabase(db, target);
  expect(existsSync(target)).toBe(true);

  // The claim that matters is not "a file appeared" — it is that the file is a
  // usable database. Opening it with the schema NOT applied proves the contents
  // came from the backup rather than from openDatabase creating tables.
  const restored = openDatabase({ file: target, schemaSql: '' });
  try {
    const names = restored
      .prepare('SELECT name FROM subjects ORDER BY name')
      .all<{ name: string }>()
      .map((r) => r.name);
    expect(names).toEqual(['Maths', 'Physics']);
    expect(restored.prepare('SELECT count(*) c FROM users').get<{ c: number }>()?.c).toBe(1);
  } finally {
    restored.close();
  }
});

test('a backup carries the full frozen schema, not just data', () => {
  const target = join(dir, 'backup.db');
  backupDatabase(db, target);
  const restored = openDatabase({ file: target, schemaSql: '' });
  try {
    const tables = restored
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all<{ name: string }>()
      .map((r) => r.name);
    expect(tables.sort()).toEqual([
      'daily_summaries',
      'interruptions',
      'session_surveys',
      'sessions',
      'subjects',
      'topics',
      'users',
    ]);
  } finally {
    restored.close();
  }
});

test('an existing target is replaced rather than refused', () => {
  // VACUUM INTO itself refuses to overwrite, so the helper removes first. If it
  // did not, a second backup to the same filename would fail and the user would
  // be left believing they had a current copy.
  const target = join(dir, 'backup.db');
  writeFileSync(target, 'not a database');
  backupDatabase(db, target);
  const restored = openDatabase({ file: target, schemaSql: '' });
  try {
    expect(restored.prepare('SELECT count(*) c FROM users').get<{ c: number }>()?.c).toBe(1);
  } finally {
    restored.close();
  }
});

test('the live database is untouched and still writable afterwards', async () => {
  await new SqliteSubjectRepository(db).create({ name: 'Physics' });
  backupDatabase(db, join(dir, 'backup.db'));
  await new SqliteSubjectRepository(db).create({ name: 'Added after backup' });
  const names = (await new SqliteSubjectRepository(db).list()).map((s) => s.name);
  expect(names).toContain('Added after backup');
  expect(names).toContain('Physics');
});

test('a backup taken later does not contain rows added after it', async () => {
  const subjects = new SqliteSubjectRepository(db);
  await subjects.create({ name: 'Before' });
  const target = join(dir, 'backup.db');
  backupDatabase(db, target);
  await subjects.create({ name: 'After' });

  const restored = openDatabase({ file: target, schemaSql: '' });
  try {
    const names = restored
      .prepare('SELECT name FROM subjects')
      .all<{ name: string }>()
      .map((r) => r.name);
    expect(names, 'a snapshot is a snapshot, not a live mirror').toEqual(['Before']);
  } finally {
    restored.close();
  }
});
