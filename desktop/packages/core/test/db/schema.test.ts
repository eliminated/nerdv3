import { afterEach, expect, test } from 'vitest';

import { openDatabase, type Database } from '../../src/db/connection.js';

// Every expectation below is written out BY HAND from data-model.md, not read
// back from schema.sql. That independence is what makes these guards capable of
// failing: a test seeded from the artefact it validates compares the artefact
// to itself and can never go red (V2 post-mortem, defect 2).
//
// This is the schema freeze in the new stack. The Flutter guards (drift schema
// dump + the branch-vs-main snapshot diff) retire with the Flutter app; the
// live-database half of the replacement is V3-D's.

let db: Database | undefined;
const fresh = (): Database => (db = openDatabase());
afterEach(() => {
  db?.close();
  db = undefined;
});

test('exactly the seven v1 tables exist', () => {
  const rows = fresh()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all<{ name: string }>();
  // Exact set, not a superset: an accidental extra table must fail too — the
  // freeze is bidirectional.
  expect(rows.map((r) => r.name).sort()).toEqual([
    'daily_summaries',
    'interruptions',
    'session_surveys',
    'sessions',
    'subjects',
    'topics',
    'users',
  ]);
});

test('every table has exactly its frozen column set, in order', () => {
  const d = fresh();
  const expected: Record<string, string[]> = {
    users: [
      'id', 'created_at', 'updated_at', 'deleted_at', 'sync_state',
      'email', 'password_hash', 'display_name', 'timezone', 'day_start_hour',
    ],
    subjects: [
      'id', 'created_at', 'updated_at', 'deleted_at', 'sync_state',
      'user_id', 'name', 'color', 'source', 'source_name', 'archived',
    ],
    topics: [
      'id', 'created_at', 'updated_at', 'deleted_at', 'sync_state',
      'subject_id', 'parent_topic_id', 'name', 'order_index', 'status',
    ],
    sessions: [
      'id', 'created_at', 'updated_at', 'deleted_at', 'sync_state',
      'user_id', 'subject_id', 'topic_id', 'mode', 'planned_duration_s',
      'actual_duration_s', 'paused_duration_s', 'started_at', 'ended_at', 'end_reason',
    ],
    session_surveys: [
      'id', 'created_at', 'updated_at', 'deleted_at', 'sync_state',
      'session_id', 'focus_rating', 'comprehension_rating', 'difficulty_rating', 'note',
    ],
    interruptions: [
      'id', 'created_at', 'updated_at', 'deleted_at', 'sync_state',
      'session_id', 'kind', 'occurred_at', 'duration_s', 'blocked', 'detail',
    ],
    daily_summaries: [
      'id', 'created_at', 'updated_at', 'deleted_at', 'sync_state',
      'user_id', 'local_date', 'total_seconds', 'session_count',
      'avg_focus_rating', 'qualified',
    ],
  };
  for (const [table, columns] of Object.entries(expected)) {
    const actual = d
      .prepare(`PRAGMA table_info(${table})`)
      .all<{ name: string }>()
      .map((r) => r.name);
    expect(actual, `columns of ${table}`).toEqual(columns);
  }
});

test('sessions.goal_id is absent from v1', () => {
  // Deliberate (masterplan §10): goals land in Phase 6, and SQLite can add a
  // nullable FK column by ALTER TABLE then — whereas a column created now could
  // never gain its foreign key. Pinned so nobody "helpfully" adds it early.
  const columns = fresh()
    .prepare('PRAGMA table_info(sessions)')
    .all<{ name: string }>()
    .map((r) => r.name);
  expect(columns).not.toContain('goal_id');
});

test('schema v1 declares NO triggers and NO views', () => {
  // The other guards enumerate type='table' and type='index' only, so a trigger
  // or a view was invisible to all of them — verified: adding both leaves the
  // table count at 7 and the index count at 6.
  //
  // This is not hypothetical tidiness. A trigger can WRITE, from inside the
  // database, a table the source-level privacy guard confines to one file:
  //   CREATE TRIGGER … AFTER UPDATE ON sessions BEGIN
  //     INSERT INTO interruptions (…, detail) VALUES (…); END;
  // and a view is worse, because a reader selecting FROM v_app_usage never
  // contains the token the confinement scan keys on.
  const objects = fresh()
    .prepare(
      `SELECT type, name FROM sqlite_master
        WHERE type IN ('trigger', 'view') AND name NOT LIKE 'sqlite_%'`,
    )
    .all<{ type: string; name: string }>();
  expect(objects).toEqual([]);
});

test('sqlite_master holds nothing beyond tables and indexes', () => {
  // Bidirectional: catches an object kind SQLite might add that the two
  // enumerations above do not name.
  const kinds = new Set(
    fresh()
      .prepare(`SELECT DISTINCT type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'`)
      .all<{ type: string }>()
      .map((r) => r.type),
  );
  expect([...kinds].sort()).toEqual(['index', 'table']);
});

test('the six v1 indexes exist, partial exactly where data-model.md says so', () => {
  const rows = fresh()
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
    .all<{ name: string; sql: string }>();
  const bySql = new Map(rows.map((r) => [r.name, r.sql]));
  expect([...bySql.keys()].sort()).toEqual([
    'idx_interruptions_session',
    'idx_sessions_topic',
    'idx_sessions_user_time',
    'idx_subjects_user',
    'idx_topics_parent',
    'idx_topics_subject',
  ]);
  for (const partial of ['idx_subjects_user', 'idx_topics_subject', 'idx_sessions_user_time']) {
    expect(bySql.get(partial), `${partial} must be partial`).toContain('WHERE deleted_at IS NULL');
  }
  for (const full of ['idx_topics_parent', 'idx_sessions_topic', 'idx_interruptions_session']) {
    expect(bySql.get(full), `${full} must not be partial`).not.toContain('WHERE');
  }
});

test('the frozen FK set is exactly the nine declared references', () => {
  const d = fresh();
  const expected: Record<string, string[]> = {
    users: [],
    subjects: ['users.user_id->id'],
    topics: ['subjects.subject_id->id', 'topics.parent_topic_id->id'],
    sessions: ['subjects.subject_id->id', 'topics.topic_id->id', 'users.user_id->id'],
    session_surveys: ['sessions.session_id->id'],
    interruptions: ['sessions.session_id->id'],
    daily_summaries: ['users.user_id->id'],
  };
  let total = 0;
  for (const [table, fks] of Object.entries(expected)) {
    const actual = d
      .prepare(`PRAGMA foreign_key_list(${table})`)
      .all<{ table: string; from: string; to: string }>()
      .map((r) => `${r.table}.${r.from}->${r.to}`)
      .sort();
    expect(actual, `FKs of ${table}`).toEqual(fks);
    total += actual.length;
  }
  expect(total, 'nine foreign keys, per data-model.md §6').toBe(9);
});

test('foreign keys are ENFORCED, not merely declared', () => {
  // Pins the behaviour rather than the mechanism: node:sqlite defaults the
  // pragma on AND schema.sql sets it, so if a future connection option or a
  // different driver turns it off, this goes red.
  const d = fresh();
  expect(d.prepare('PRAGMA foreign_keys').get<{ foreign_keys: number }>()?.foreign_keys).toBe(1);
  expect(() =>
    d
      .prepare('INSERT INTO subjects (id, user_id, name) VALUES (?,?,?)')
      .run('s1', 'no-such-user', 'Physics'),
  ).toThrow(/FOREIGN KEY constraint failed/);
});

test('session_surveys enforces the rating CHECKs in both directions', () => {
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u1', 'a@b.c', '');
  d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s1', 'u1', 'Maths');
  d.prepare('INSERT INTO sessions (id,user_id,subject_id,mode,started_at) VALUES (?,?,?,?,?)').run(
    'sess1', 'u1', 's1', 'plain', 1000,
  );
  // SQLite cannot add a CHECK after the freeze, so its omission is permanent.
  for (const bad of [0, 6, -1]) {
    expect(() =>
      d
        .prepare('INSERT INTO session_surveys (id,session_id,focus_rating) VALUES (?,?,?)')
        .run(`sv-bad-${String(bad)}`, 'sess1', bad),
    ).toThrow(/CHECK constraint failed/);
  }
  // The in-range branch is pinned too: a constraint rejecting everything would
  // also satisfy the loop above.
  d.prepare('INSERT INTO session_surveys (id,session_id,focus_rating) VALUES (?,?,?)').run(
    'sv-ok', 'sess1', 4,
  );
  expect(d.prepare('SELECT count(*) c FROM session_surveys').get<{ c: number }>()?.c).toBe(1);
});

test('session_surveys.session_id is UNIQUE, so a session can be rated once', () => {
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u1', 'a@b.c', '');
  d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s1', 'u1', 'Maths');
  d.prepare('INSERT INTO sessions (id,user_id,subject_id,mode,started_at) VALUES (?,?,?,?,?)').run(
    'sess1', 'u1', 's1', 'plain', 1000,
  );
  d.prepare('INSERT INTO session_surveys (id,session_id,focus_rating) VALUES (?,?,?)').run(
    'sv1', 'sess1', 4,
  );
  expect(() =>
    d
      .prepare('INSERT INTO session_surveys (id,session_id,focus_rating) VALUES (?,?,?)')
      .run('sv2', 'sess1', 5),
  ).toThrow(/UNIQUE constraint failed/);
});

test('daily_summaries rejects a duplicate (user_id, local_date)', () => {
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u1', 'a@b.c', '');
  d.prepare('INSERT INTO daily_summaries (id,user_id,local_date) VALUES (?,?,?)').run(
    'd1', 'u1', '2026-07-26',
  );
  expect(() =>
    d
      .prepare('INSERT INTO daily_summaries (id,user_id,local_date) VALUES (?,?,?)')
      .run('d2', 'u1', '2026-07-26'),
  ).toThrow(/UNIQUE constraint failed/);
});

test('an instant round-trips as the same second', () => {
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)').run(
    'u1', 'a@b.c', '', 1785073512,
  );
  expect(d.prepare('SELECT created_at FROM users').get<{ created_at: number }>()?.created_at).toBe(
    1785073512,
  );
});

test('the sync columns default on every table', () => {
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u1', 'a@b.c', '');
  const row = d
    .prepare('SELECT created_at, updated_at, deleted_at, sync_state FROM users')
    .get<{ created_at: number; updated_at: number; deleted_at: number | null; sync_state: string }>();
  expect(row?.sync_state).toBe('local');
  expect(row?.deleted_at).toBeNull();
  expect(row?.created_at).toBeGreaterThan(0);
  expect(row?.updated_at).toBeGreaterThan(0);
});

test('a throwing transaction rolls back, and transactions nest', () => {
  // SQLite cannot nest BEGIN. SAVEPOINT can, which is why the connection uses
  // it — a future caller wrapping two repository calls must not deadlock the
  // ones that already transact internally.
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u1', 'a@b.c', '');
  expect(() =>
    d.transaction(() => {
      d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s1', 'u1', 'A');
      d.transaction(() => {
        d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s2', 'u1', 'B');
      });
      throw new Error('boom');
    }),
  ).toThrow('boom');
  expect(d.prepare('SELECT count(*) c FROM subjects').get<{ c: number }>()?.c).toBe(0);
});

test('a committed nested transaction keeps its rows', () => {
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u1', 'a@b.c', '');
  d.transaction(() => {
    d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s1', 'u1', 'A');
    d.transaction(() => {
      d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s2', 'u1', 'B');
    });
  });
  expect(d.prepare('SELECT count(*) c FROM subjects').get<{ c: number }>()?.c).toBe(2);
});

test('an ASYNC transaction callback is refused, not silently committed', () => {
  // The signature is generic, so an async callback type-checks: T infers to
  // Promise<void>, the SAVEPOINT prefix runs, the callback returns a PENDING
  // promise, and RELEASE fires before the body has finished. A later throw
  // becomes a rejection the synchronous catch never sees, so nothing rolls
  // back and half-written state is committed. Two concurrent async
  // transactions would also both allocate sp_0.
  //
  // This is not theoretical: the Dart original is `_db.transaction(() async
  // {…})`, so the natural port of any future caller is exactly this shape.
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u1', 'a@b.c', '');
  const asyncFn = async (): Promise<void> => {
    d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s1', 'u1', 'A');
    await Promise.resolve();
    throw new Error('async boom');
  };
  expect(() =>
    d.transaction(asyncFn as unknown as () => void),
  ).toThrow(/requires a SYNCHRONOUS callback/);
  // And the partial work is rolled back rather than committed.
  expect(d.prepare('SELECT count(*) c FROM subjects').get<{ c: number }>()?.c).toBe(0);
});

test('an inner rollback does not discard the outer transaction', () => {
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u1', 'a@b.c', '');
  d.transaction(() => {
    d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s1', 'u1', 'A');
    try {
      d.transaction(() => {
        d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s2', 'u1', 'B');
        throw new Error('inner');
      });
    } catch {
      /* handled: the outer work must survive */
    }
  });
  const names = d.prepare('SELECT name FROM subjects').all<{ name: string }>().map((r) => r.name);
  expect(names).toEqual(['A']);
});
