import { afterEach, beforeEach, expect, test } from 'vitest';

import { SqliteSessionRepository } from '../../src/data/session-repository.js';
import { SqliteSubjectRepository } from '../../src/data/subject-repository.js';
import { SqliteSurveyRepository } from '../../src/data/survey-repository.js';
import type { Database } from '../../src/db/connection.js';
import { ensureLocalUser } from '../../src/db/local-user.js';
import { ActiveSession } from '../../src/domain/active-session.js';
import { DomainStateError, ValidationError } from '../../src/errors.js';
import { localUserId } from '../../src/ids.js';
import { toEpochSeconds } from '../../src/time.js';
import { fixedClock, freshDb } from '../support/fixture.js';

const MIN = 60_000;
const t0 = new Date('2026-07-26T09:00:00.000Z');
const at = (minutes: number): Date => new Date(t0.getTime() + minutes * MIN);

const endedId = 'ended-1';
const runningId = 'running-1';

let db: Database;
let repo: SqliteSurveyRepository;
let sessions: SqliteSessionRepository;
let subjectId: string;
let clock: ReturnType<typeof fixedClock>;

const surveys = (): Record<string, unknown>[] =>
  db.prepare('SELECT * FROM session_surveys').all();

beforeEach(async () => {
  db = freshDb();
  ensureLocalUser(db);
  clock = fixedClock(t0);
  subjectId = await new SqliteSubjectRepository(db, clock.now).create({ name: 'Physics' });
  sessions = new SqliteSessionRepository(db, clock.now);

  await sessions.insertStarted(ActiveSession.start({ id: endedId, subjectId, startedAt: t0 }));
  await sessions.end({
    id: endedId,
    endedAt: at(30),
    actualDurationMs: 30 * MIN,
    totalPausedMs: 0,
  });
  await sessions.insertStarted(ActiveSession.start({ id: runningId, subjectId, startedAt: t0 }));

  repo = new SqliteSurveyRepository(db, clock.now);
});
afterEach(() => {
  db.close();
});

test('a saved survey round-trips every field and leaves the session identical', async () => {
  const before = db.prepare('SELECT * FROM sessions WHERE id = ?').get(endedId);

  await repo.save({
    sessionId: endedId,
    focusRating: 4,
    comprehensionRating: 2,
    difficultyRating: 5,
    note: 'derivations were slow',
  });

  const s = surveys()[0];
  // Asymmetric on purpose: 3/3/3 could not catch two swapped columns.
  expect([s?.['focus_rating'], s?.['comprehension_rating'], s?.['difficulty_rating']]).toEqual([
    4, 2, 5,
  ]);
  expect(s?.['note']).toBe('derivations were slow');
  expect(s?.['session_id']).toBe(endedId);
  expect(s?.['deleted_at']).toBeNull();
  expect(s?.['created_at']).toBe(toEpochSeconds(t0));
  // A survey must not touch the session: updated_at is the crash-recovery
  // watermark, and an ended session is immutable.
  expect(db.prepare('SELECT * FROM sessions WHERE id = ?').get(endedId)).toEqual(before);
});

test('optional ratings and a blank note are stored as null', async () => {
  await repo.save({ sessionId: endedId, focusRating: 3, note: '   ' });
  const s = surveys()[0];
  expect(s?.['note'], 'an untouched field yields "", which must not become a note').toBeNull();
  expect(s?.['comprehension_rating']).toBeNull();
  expect(s?.['difficulty_rating']).toBeNull();
});

test('a note is trimmed but its interior is preserved', async () => {
  await repo.save({ sessionId: endedId, focusRating: 3, note: '  kept  inside  ' });
  expect(surveys()[0]?.['note']).toBe('kept  inside');
});

test('refuses a survey for a recovered crashed session, writing nothing', async () => {
  db.prepare(
    `INSERT INTO sessions (id, user_id, subject_id, mode, started_at, created_at, updated_at)
     VALUES ('open-1', ?, ?, 'plain', ?, ?, ?)`,
  ).run(localUserId, subjectId, toEpochSeconds(t0), toEpochSeconds(t0), toEpochSeconds(at(5)));
  await sessions.recoverCrashedSessions();

  await expect(repo.save({ sessionId: 'open-1', focusRating: 5 })).rejects.toThrow(
    DomainStateError,
  );
  expect(surveys(), 'a crashed session must never weight a qualified day').toEqual([]);
});

test('refuses a survey for a session that has not ended', async () => {
  await expect(repo.save({ sessionId: runningId, focusRating: 5 })).rejects.toThrow(
    DomainStateError,
  );
  expect(surveys()).toEqual([]);
});

test('refuses a survey for an unknown session', async () => {
  await expect(repo.save({ sessionId: 'nope', focusRating: 5 })).rejects.toThrow(DomainStateError);
  expect(surveys()).toEqual([]);
});

test('refuses a survey for a soft-deleted session', async () => {
  db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run(toEpochSeconds(at(40)), endedId);
  await expect(repo.save({ sessionId: endedId, focusRating: 5 })).rejects.toThrow(DomainStateError);
  expect(surveys()).toEqual([]);
});

test("accepts end_reason 'completed' as well as 'user_ended'", async () => {
  // Both are normal endings. Only 'crashed' is refused — pinning this stops a
  // future timer-completion path being locked out by accident.
  db.prepare("UPDATE sessions SET end_reason = 'completed' WHERE id = ?").run(endedId);
  await repo.save({ sessionId: endedId, focusRating: 5 });
  expect(surveys()).toHaveLength(1);
});

test('refuses out-of-range and non-integer ratings before touching the database', async () => {
  for (const bad of [0, 6, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await expect(
      repo.save({ sessionId: endedId, focusRating: bad }),
      `focusRating ${String(bad)} must be refused`,
    ).rejects.toThrow(ValidationError);
  }
  await expect(
    repo.save({ sessionId: endedId, focusRating: 3, comprehensionRating: 9 }),
  ).rejects.toThrow(ValidationError);
  await expect(
    repo.save({ sessionId: endedId, focusRating: 3, difficultyRating: 0 }),
  ).rejects.toThrow(ValidationError);
  expect(surveys()).toEqual([]);
});

test('accepts every in-range rating', async () => {
  // A validator that refused everything would satisfy the loop above.
  for (const good of [1, 2, 3, 4, 5]) {
    db.prepare('DELETE FROM session_surveys').run();
    await repo.save({
      sessionId: endedId,
      focusRating: good,
      comprehensionRating: good,
      difficultyRating: good,
    });
    expect(surveys()[0]?.['focus_rating']).toBe(good);
  }
});

test('is insert-only: a second survey for the same session is refused', async () => {
  // session_id is UNIQUE at column level, and SQLite's implicit unique index
  // counts tombstones — so a survey must never be soft-deleted or upserted, or
  // that session could never be rated again and the freeze forbids dropping
  // the constraint.
  await repo.save({ sessionId: endedId, focusRating: 4 });
  await expect(repo.save({ sessionId: endedId, focusRating: 5 })).rejects.toThrow(
    /UNIQUE constraint failed/,
  );
  expect(surveys()).toHaveLength(1);
  expect(surveys()[0]?.['focus_rating'], 'the first rating stands').toBe(4);
});

test('a refusal REJECTS rather than throwing synchronously', async () => {
  let synchronousThrow = false;
  let settled: PromiseSettledResult<void>[] = [];
  try {
    settled = await Promise.allSettled([
      repo.save({ sessionId: endedId, focusRating: 99 }),
      repo.save({ sessionId: 'nope', focusRating: 3 }),
    ]);
  } catch {
    synchronousThrow = true;
  }
  expect(synchronousThrow, 'must not throw before returning a promise').toBe(false);
  expect(settled.map((s) => s.status)).toEqual(['rejected', 'rejected']);
});

test('a null or undefined focusRating is a ValidationError, not a raw SQL error', async () => {
  // focusRating is mandatory, but checkRange returns early on null, so a null
  // sailed through to "NOT NULL constraint failed" — the raw-SQLite-error class
  // this repository exists to prevent escaping. It matters because the V3-B IPC
  // boundary erases the `number` type and a missing field deserialises to null.
  for (const bad of [null, undefined]) {
    await expect(
      repo.save({ sessionId: endedId, focusRating: bad as unknown as number }),
    ).rejects.toThrow(ValidationError);
  }
  expect(surveys()).toEqual([]);
});

test('the refusal message distinguishes running, deleted and unknown sessions', async () => {
  // `end_reason` is null for a session that is merely still running, so
  // `?? 'no such session'` reported a live session as unknown and would send a
  // debugger down the wrong path.
  await expect(repo.save({ sessionId: runningId, focusRating: 5 })).rejects.toThrow(
    /has not ended yet/,
  );
  await expect(repo.save({ sessionId: 'nope', focusRating: 5 })).rejects.toThrow(
    /no such session/,
  );
  db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run(toEpochSeconds(at(40)), endedId);
  await expect(repo.save({ sessionId: endedId, focusRating: 5 })).rejects.toThrow(/deleted/);
});
