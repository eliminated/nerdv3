import { afterEach, beforeEach, expect, test } from 'vitest';

import { SqliteInterruptionRepository } from '../../src/data/interruption-repository.js';
import { SqliteSessionRepository } from '../../src/data/session-repository.js';
import { SqliteSubjectRepository } from '../../src/data/subject-repository.js';
import type { Database } from '../../src/db/connection.js';
import { ensureLocalUser } from '../../src/db/local-user.js';
import { ActiveSession } from '../../src/domain/active-session.js';
import { ValidationError } from '../../src/errors.js';
import { toEpochSeconds } from '../../src/time.js';
import { fixedClock, freshDb } from '../support/fixture.js';

const MIN = 60_000;
const t0 = new Date('2026-07-26T09:00:00.000Z');
const at = (minutes: number): Date => new Date(t0.getTime() + minutes * MIN);

let db: Database;
let repo: SqliteInterruptionRepository;
let clock: ReturnType<typeof fixedClock>;
const sessionId = 'sess-1';

beforeEach(async () => {
  db = freshDb();
  ensureLocalUser(db);
  clock = fixedClock(t0);
  const subjectId = await new SqliteSubjectRepository(db, clock.now).create({ name: 'Physics' });
  await new SqliteSessionRepository(db, clock.now).insertStarted(
    ActiveSession.start({ id: sessionId, subjectId, startedAt: t0 }),
  );
  repo = new SqliteInterruptionRepository(db, clock.now);
});
afterEach(() => {
  db.close();
});

const rows = (): Record<string, unknown>[] =>
  db.prepare('SELECT * FROM interruptions ORDER BY id').all();

test('logPause writes one manual_pause at the pause moment, blocked false', async () => {
  await repo.logPause({
    sessionId,
    pauseStartedAt: at(10),
    resumedAt: at(12),
  });
  const all = rows();
  // Exact count, not "not empty": a duplicate row is the exact bug two agent
  // passes found in the Flutter build, and isNotEmpty would not have caught it.
  expect(all).toHaveLength(1);
  const r = all[0];
  // Exact wire value: the column has no CHECK in schema v1, so this string IS
  // the contract — renaming it silently orphans history.
  expect(r?.['kind']).toBe('manual_pause');
  expect(r?.['blocked']).toBe(0);
  expect(r?.['detail']).toBeNull();
  expect(r?.['duration_s']).toBe(120);
  expect(r?.['occurred_at'], 'occurred_at is when the pause STARTED, not when it ended').toBe(
    toEpochSeconds(at(10)),
  );
});

test('logPause clamps a negative span to zero', async () => {
  // The wall clock is not monotonic: an NTP correction mid-pause would
  // otherwise store a negative duration (same convention as crash recovery).
  await repo.logPause({
    sessionId,
    pauseStartedAt: at(12),
    resumedAt: at(10),
  });
  expect(rows()[0]?.['duration_s']).toBe(0);
});

test('logPause truncates a sub-second span toward zero', async () => {
  await repo.logPause({
    sessionId,
    pauseStartedAt: t0,
    resumedAt: new Date(t0.getTime() + 1900),
  });
  expect(rows()[0]?.['duration_s']).toBe(1);
});

test('logSelfReport writes one self_reported row with no duration', async () => {
  await repo.logSelfReport({ sessionId, occurredAt: t0 });
  const r = rows()[0];
  expect(r?.['kind']).toBe('self_reported');
  expect(r?.['duration_s']).toBeNull();
  expect(r?.['blocked']).toBe(0);
  expect(r?.['detail']).toBeNull();
  expect(r?.['occurred_at']).toBe(toEpochSeconds(t0));
});

test('blocked is carried by production code, not by the column default', async () => {
  // Phase 2 exit criterion 2 requires the CORRECT blocked value. Asserting only
  // `false` passes even if the writer never mentions the column at all (it
  // defaults to 0 in schema v1), so the true branch has to be pinned as well.
  await repo.logSessionEvent({
    sessionId,
    kind: 'exit_attempt',
    occurredAt: t0,
    blocked: true,
  });
  expect(rows()[0]?.['blocked']).toBe(1);
});

test('kind cannot carry app identity, only a bare token', async () => {
  // The privacy line names `detail`, but `kind` is the OTHER free-text column
  // on this write path: 'app_switch:chrome.exe' would be surveillance that no
  // detail-shaped guard could ever see.
  for (const smuggled of [
    'app_switch:chrome.exe',
    'Discord',
    'app switch',
    'app-switch',
    'notification(Slack)',
    'app_switch chrome',
    'app_switch\nchrome.exe',
    'APP_SWITCH',
    'app_switch2',
    '',
    '  ',
  ]) {
    await expect(
      repo.logSessionEvent({ sessionId, kind: smuggled, occurredAt: t0 }),
      `"${smuggled}" must be refused`,
    ).rejects.toThrow(ValidationError);
  }
  expect(rows()).toEqual([]);
  // Every documented kind still passes — a validator that refused everything
  // would satisfy the loop above and prove nothing.
  const documented = [
    'manual_pause',
    'self_reported',
    'app_switch',
    'exit_attempt',
    'notification',
    'idle_timeout',
    'device_locked',
  ];
  for (const kind of documented) {
    await repo.logSessionEvent({ sessionId, kind, occurredAt: t0 });
  }
  expect(rows()).toHaveLength(documented.length);
});

test("countSelfReports counts only this session's self reports", async () => {
  expect(await repo.countSelfReports(sessionId)).toBe(0);
  await repo.logSelfReport({ sessionId, occurredAt: t0 });
  await repo.logPause({ sessionId, pauseStartedAt: t0, resumedAt: t0 });
  expect(await repo.countSelfReports(sessionId), 'a pause is not a self report').toBe(1);
});

test('countSelfReports ignores other sessions', async () => {
  const other = 'sess-2';
  const subjectId =
    db.prepare('SELECT id FROM subjects').get<{ id: string }>()?.id ?? '';
  await new SqliteSessionRepository(db, clock.now).insertStarted(
    ActiveSession.start({ id: other, subjectId, startedAt: t0 }),
  );
  await repo.logSelfReport({ sessionId: other, occurredAt: t0 });
  await repo.logSelfReport({ sessionId: other, occurredAt: t0 });
  await repo.logSelfReport({ sessionId, occurredAt: t0 });
  expect(await repo.countSelfReports(sessionId)).toBe(1);
  expect(await repo.countSelfReports(other)).toBe(2);
});

test('countSelfReports ignores soft-deleted rows', async () => {
  await repo.logSelfReport({ sessionId, occurredAt: t0 });
  db.prepare('UPDATE interruptions SET deleted_at = ?').run(toEpochSeconds(at(1)));
  expect(await repo.countSelfReports(sessionId)).toBe(0);
});

test('the writer refuses an unknown session id', async () => {
  // The foreign key is the last line of defence; this proves it is live on
  // this write path and not just declared in the schema.
  await expect(
    repo.logSelfReport({ sessionId: 'no-such-session', occurredAt: t0 }),
  ).rejects.toThrow(/FOREIGN KEY constraint failed/);
});

test('a refusal REJECTS rather than throwing synchronously', async () => {
  // A Promise-returning method that throws synchronously is a landmine: the
  // exception escapes Promise.all() and a bare .catch() entirely, so a caller
  // that never awaits gets an uncaught error instead of a handled rejection.
  // Removing `async` from logSessionEvent turns both halves of this red.
  let synchronousThrow = false;
  let settled: PromiseSettledResult<void>[] = [];
  try {
    settled = await Promise.allSettled([
      repo.logSessionEvent({ sessionId, kind: 'app_switch:chrome.exe', occurredAt: t0 }),
      repo.logSelfReport({ sessionId: 'no-such-session', occurredAt: t0 }),
    ]);
  } catch {
    synchronousThrow = true;
  }
  expect(synchronousThrow, 'must not throw before returning a promise').toBe(false);
  expect(settled.map((s) => s.status)).toEqual(['rejected', 'rejected']);
});

test('each row gets a distinct time-ordered id', async () => {
  // loadSessionDetail breaks same-second ties on id, so two events logged in
  // the same second must still order by insertion.
  for (let i = 0; i < 5; i++) await repo.logSelfReport({ sessionId, occurredAt: t0 });
  const ids = rows().map((r) => r['id'] as string);
  expect(new Set(ids).size).toBe(5);
  expect([...ids].sort()).toEqual(ids);
});
