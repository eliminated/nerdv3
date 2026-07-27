import { afterEach, beforeEach, expect, test } from 'vitest';

import type { Database } from '../../src/db/connection.js';
import { ensureLocalUser } from '../../src/db/local-user.js';
import { localUserId } from '../../src/ids.js';
import { freshDb } from '../support/fixture.js';

let db: Database;

beforeEach(() => {
  db = freshDb();
});
afterEach(() => {
  db.close();
});

test('seeds exactly one row with the fixed id and the sentinel fields', () => {
  ensureLocalUser(db);
  const rows = db
    .prepare('SELECT id, email, password_hash FROM users')
    .all<{ id: string; email: string; password_hash: string }>();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(localUserId);
  // masterplan §10: data-model.md declares email/password_hash NOT NULL, so the
  // single local user is seeded with sentinels rather than the columns being
  // relaxed — a schema change the freeze would have made permanent.
  expect(rows[0]?.email).toBe('local@device.invalid');
  expect(rows[0]?.password_hash).toBe('');
});

test('is idempotent — 100 calls still leave one row, and none throw', () => {
  // V2's defect was read-then-insert with no transaction: concurrent callers
  // either duplicated the row or threw on the PK collision. INSERT OR IGNORE is
  // atomic, so the fix survives the port.
  //
  // Honest about what this proves: the driver is synchronous and
  // single-threaded, so this is idempotency, not concurrency. The regression it
  // would actually catch is someone swapping OR IGNORE for a plain INSERT.
  for (let i = 0; i < 100; i++) ensureLocalUser(db);
  expect(db.prepare('SELECT count(*) c FROM users').get<{ c: number }>()?.c).toBe(1);
});

test('does not overwrite an existing local user row', () => {
  ensureLocalUser(db);
  db.prepare('UPDATE users SET display_name = ?, timezone = ? WHERE id = ?').run(
    'Isaac',
    'Asia/Kuala_Lumpur',
    localUserId,
  );
  ensureLocalUser(db);
  const row = db
    .prepare('SELECT display_name, timezone FROM users')
    .get<{ display_name: string | null; timezone: string }>();
  expect(row?.display_name).toBe('Isaac');
  expect(row?.timezone).toBe('Asia/Kuala_Lumpur');
});

test('the seeded row satisfies every foreign key that points at users', () => {
  // Locked decision 4's whole purpose: every user_id FK is populated from day
  // one, so adding a server later needs no migration.
  ensureLocalUser(db);
  db.prepare('INSERT INTO subjects (id, user_id, name) VALUES (?,?,?)').run(
    's1',
    localUserId,
    'Physics',
  );
  db.prepare('INSERT INTO daily_summaries (id, user_id, local_date) VALUES (?,?,?)').run(
    'd1',
    localUserId,
    '2026-07-26',
  );
  expect(db.prepare('SELECT count(*) c FROM subjects').get<{ c: number }>()?.c).toBe(1);
});
