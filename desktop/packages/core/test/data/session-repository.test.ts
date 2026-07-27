import { afterEach, beforeEach, expect, test } from 'vitest';

import { SqliteInterruptionRepository } from '../../src/data/interruption-repository.js';
import { SqliteSessionRepository } from '../../src/data/session-repository.js';
import { SqliteSubjectRepository } from '../../src/data/subject-repository.js';
import { SqliteSurveyRepository } from '../../src/data/survey-repository.js';
import type { Database } from '../../src/db/connection.js';
import { ensureLocalUser } from '../../src/db/local-user.js';
import { ActiveSession } from '../../src/domain/active-session.js';
import { localUserId } from '../../src/ids.js';
import { toEpochSeconds } from '../../src/time.js';
import { fixedClock, freshDb } from '../support/fixture.js';

const MIN = 60_000;
const t0 = new Date('2026-07-26T10:00:00.000Z');
const at = (minutes: number): Date => new Date(t0.getTime() + minutes * MIN);

let db: Database;
let repo: SqliteSessionRepository;
let subjects: SqliteSubjectRepository;
let subjectId: string;
let clock: ReturnType<typeof fixedClock>;

beforeEach(async () => {
  db = freshDb();
  ensureLocalUser(db);
  clock = fixedClock(t0);
  subjects = new SqliteSubjectRepository(db, clock.now);
  subjectId = await subjects.create({ name: 'Physics' });
  repo = new SqliteSessionRepository(db, clock.now);
});
afterEach(() => {
  db.close();
});

const start = (id = 'sess-1', startedAt = t0): ActiveSession =>
  ActiveSession.start({ id, subjectId, startedAt });

const row = (id = 'sess-1'): Record<string, unknown> | undefined =>
  db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);

/** Seeds a session left open by a crash, at a chosen last-write watermark. */
function seedOpenSession(id: string, a: { pausedS?: number; updatedAt: Date }): void {
  db.prepare(
    `INSERT INTO sessions
       (id, user_id, subject_id, mode, started_at, paused_duration_s, created_at, updated_at)
     VALUES (?, ?, ?, 'plain', ?, ?, ?, ?)`,
  ).run(
    id,
    localUserId,
    subjectId,
    toEpochSeconds(t0),
    a.pausedS ?? 0,
    toEpochSeconds(t0),
    toEpochSeconds(a.updatedAt),
  );
}

test('a started session is persisted in progress and absent from history', async () => {
  await repo.insertStarted(start());
  const r = row();
  expect(r?.['ended_at']).toBeNull();
  expect(r?.['mode']).toBe('plain');
  expect(r?.['started_at']).toBe(toEpochSeconds(t0));
  expect(r?.['paused_duration_s']).toBe(0);
  expect(await repo.listHistory()).toEqual([]);
});

test('insertStarted records the session mode', async () => {
  await repo.insertStarted(
    ActiveSession.start({ id: 'sess-f', subjectId, startedAt: t0, mode: 'focused' }),
  );
  expect(row('sess-f')?.['mode']).toBe('focused');
});

test('insertStarted attaches the session to the local user', async () => {
  await repo.insertStarted(start());
  expect(row()?.['user_id']).toBe(localUserId);
});

test('ending writes duration fields and end_reason user_ended', async () => {
  const s = start().pause(at(10)).resume(at(12));
  await repo.insertStarted(s);
  const endAt = at(30);
  await repo.end({
    id: s.id,
    endedAt: endAt,
    actualDurationMs: s.elapsedMs(endAt),
    totalPausedMs: s.totalPausedMs(endAt),
  });
  const r = row();
  expect(r?.['actual_duration_s']).toBe(28 * 60);
  expect(r?.['paused_duration_s']).toBe(2 * 60);
  expect(r?.['end_reason']).toBe('user_ended');
  expect(r?.['ended_at']).toBe(toEpochSeconds(endAt));
});

test('an ended session is immutable through every repository write path', async () => {
  const s = start().pause(at(10)).resume(at(12));
  await repo.insertStarted(s);
  const endAt = at(30);
  await repo.end({
    id: s.id,
    endedAt: endAt,
    actualDurationMs: s.elapsedMs(endAt),
    totalPausedMs: s.totalPausedMs(endAt),
  });
  const before = row();

  // Every write path replayed against the ended row. The AND ended_at IS NULL
  // guards must make all three no-ops — deleting any one of them turns this red.
  // Immutability is enforced at the data layer, not merely avoided by callers
  // (V3 spec §4.3).
  clock.set(at(90));
  await repo.updatePausedDuration(s.id, 9 * 3600_000);
  await repo.end({
    id: s.id,
    endedAt: at(90),
    actualDurationMs: 9 * 3600_000,
    totalPausedMs: 9 * 3600_000,
  });
  await repo.recoverCrashedSessions();

  expect(row(), 'column-identical: every column compared').toEqual(before);
});

test('updatePausedDuration advances the updated_at watermark on a live session', async () => {
  // architecture.md §3.4: state is persisted on EVERY change. On pause the
  // accumulated value is unchanged, so updated_at is the only observable
  // effect — and it is exactly what makes crash recovery exact for a session
  // that dies while paused.
  await repo.insertStarted(start());
  expect(row()?.['updated_at']).toBe(toEpochSeconds(t0));
  clock.set(at(10));
  await repo.updatePausedDuration('sess-1', 0);
  expect(row()?.['updated_at']).toBe(toEpochSeconds(at(10)));
});

test('updatePausedDuration writes the accumulated pause in whole seconds', async () => {
  await repo.insertStarted(start());
  await repo.updatePausedDuration('sess-1', 125_900);
  expect(row()?.['paused_duration_s'], 'truncates toward zero, never rounds').toBe(125);
});

test('history lists ended sessions newest first with the subject name', async () => {
  for (const [id, offset] of [
    ['a', 0],
    ['b', 60],
  ] as const) {
    const s = ActiveSession.start({ id, subjectId, startedAt: at(offset) });
    await repo.insertStarted(s);
    const endAt = new Date(s.startedAt.getTime() + 25 * MIN);
    await repo.end({
      id,
      endedAt: endAt,
      actualDurationMs: s.elapsedMs(endAt),
      totalPausedMs: 0,
    });
  }
  const history = await repo.listHistory();
  expect(history.map((h) => h.sessionId)).toEqual(['b', 'a']);
  expect(history[0]?.subjectName).toBe('Physics');
  expect(history[0]?.actualDurationS).toBe(25 * 60);
  expect(history[0]?.startedAt.getTime()).toBe(at(60).getTime());
  expect(history[0]?.endReason).toBe('user_ended');
});

test('history keeps the subject name after the subject is archived, then deleted', async () => {
  // The join must NOT filter subjects on deleted_at: a soft-deleted subject
  // still has to name its sessions, which is the whole reason delete is soft.
  const s = start();
  await repo.insertStarted(s);
  await repo.end({ id: s.id, endedAt: at(30), actualDurationMs: 30 * MIN, totalPausedMs: 0 });

  await subjects.setArchived(subjectId, true);
  expect((await repo.listHistory())[0]?.subjectName).toBe('Physics');

  await subjects.remove(subjectId);
  expect((await repo.listHistory())[0]?.subjectName).toBe('Physics');
});

test('history excludes soft-deleted sessions', async () => {
  const s = start();
  await repo.insertStarted(s);
  await repo.end({ id: s.id, endedAt: at(30), actualDurationMs: 30 * MIN, totalPausedMs: 0 });
  db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run(toEpochSeconds(at(40)), s.id);
  expect(await repo.listHistory()).toEqual([]);
});

test('history breaks same-second ties deterministically', async () => {
  // started_at has second precision. Without the id tiebreak two sessions
  // started in the same second would order arbitrarily between runs.
  for (const id of ['aaa', 'bbb']) {
    const s = ActiveSession.start({ id, subjectId, startedAt: t0 });
    await repo.insertStarted(s);
    await repo.end({ id, endedAt: at(30), actualDurationMs: 30 * MIN, totalPausedMs: 0 });
  }
  expect((await repo.listHistory()).map((h) => h.sessionId)).toEqual(['bbb', 'aaa']);
});

test('recovery closes open sessions as crashed at their last write', async () => {
  // Started at t0, last persisted write (a pause) at t0+30min, with 5 minutes
  // of completed pause before that.
  seedOpenSession('open-1', { pausedS: 5 * 60, updatedAt: at(30) });
  expect(await repo.recoverCrashedSessions()).toBe(1);
  const r = row('open-1');
  expect(r?.['end_reason']).toBe('crashed');
  expect(r?.['ended_at'], 'the last persisted write — an honest lower bound').toBe(
    toEpochSeconds(at(30)),
  );
  expect(r?.['actual_duration_s']).toBe(25 * 60);
  // Literal idempotency: a second run finds nothing left to recover.
  expect(await repo.recoverCrashedSessions()).toBe(0);
});

test('recovery clamps a negative computed duration to zero', async () => {
  // Paused longer than the elapsed window — possible when the dangling pause
  // was never persisted. Duration must clamp, not go negative.
  seedOpenSession('open-2', { pausedS: 60 * 60, updatedAt: at(10) });
  await repo.recoverCrashedSessions();
  expect(row('open-2')?.['actual_duration_s']).toBe(0);
});

test('recovery ignores ended sessions and leaves them byte-identical', async () => {
  const s = start();
  await repo.insertStarted(s);
  await repo.end({ id: s.id, endedAt: at(20), actualDurationMs: 20 * MIN, totalPausedMs: 0 });
  const before = row();
  expect(await repo.recoverCrashedSessions()).toBe(0);
  expect(row()).toEqual(before);
});

test('recovered sessions appear in history marked crashed', async () => {
  seedOpenSession('open-3', { updatedAt: at(15) });
  await repo.recoverCrashedSessions();
  const history = await repo.listHistory();
  expect(history).toHaveLength(1);
  expect(history[0]?.endReason).toBe('crashed');
  expect(history[0]?.actualDurationS).toBe(15 * 60);
});

test('recovery closes EVERY open session in one pass', async () => {
  // The Dart original only ever seeded one open session, so a loop that
  // returned after the first row would have passed there. It fails here.
  seedOpenSession('open-a', { updatedAt: at(10) });
  seedOpenSession('open-b', { updatedAt: at(20) });
  seedOpenSession('open-c', { pausedS: 120, updatedAt: at(30) });
  expect(await repo.recoverCrashedSessions()).toBe(3);
  expect(
    db
      .prepare("SELECT count(*) c FROM sessions WHERE end_reason = 'crashed'")
      .get<{ c: number }>()?.c,
  ).toBe(3);
  expect(row('open-c')?.['actual_duration_s']).toBe(28 * 60);
});

test('recovery cannot tell a live session from a crashed one — launch-time only', async () => {
  // Pinning a CONSTRAINT, not a nicety: "unterminated" is the only signal in
  // the schema, so a running session is indistinguishable from a crashed one
  // and would be closed too. That is why recovery runs once at launch, before
  // any session can start. If a future caller is tempted to run it on a timer
  // or after a save, this test is the reason not to.
  await repo.insertStarted(start('live-1'));
  expect(await repo.recoverCrashedSessions()).toBe(1);
  expect(row('live-1')?.['end_reason']).toBe('crashed');
});

test('loadSessionDetail returns the survey and the interruption log in order', async () => {
  const s = start();
  await repo.insertStarted(s);
  await repo.end({ id: s.id, endedAt: at(30), actualDurationMs: 30 * MIN, totalPausedMs: 0 });

  const log = new SqliteInterruptionRepository(db, clock.now);
  // Two self-reports in the SAME second on purpose: occurred_at has only
  // second precision, so the id tiebreak (UUIDv7, time-ordered) is the only
  // thing making this deterministic between runs.
  await log.logSelfReport({ sessionId: s.id, occurredAt: at(5) });
  await log.logSelfReport({ sessionId: s.id, occurredAt: at(5) });
  await log.logPause({ sessionId: s.id, pauseStartedAt: at(1), resumedAt: at(3) });
  await new SqliteSurveyRepository(db, clock.now).save({
    sessionId: s.id,
    focusRating: 4,
    comprehensionRating: 2,
    note: 'ok',
  });

  const detail = await repo.loadSessionDetail(s.id);
  expect(detail.hasSurvey).toBe(true);
  expect([detail.focusRating, detail.comprehensionRating, detail.difficultyRating]).toEqual([
    4, 2, null,
  ]);
  expect(detail.note).toBe('ok');
  // Ordered by occurred_at, so the pause at +1min precedes the reports at +5.
  expect(detail.interruptions.map((i) => i.kind)).toEqual([
    'manual_pause',
    'self_reported',
    'self_reported',
  ]);
  expect(detail.interruptions[0]?.durationS).toBe(120);
  expect(detail.interruptions[0]?.occurredAt.getTime()).toBe(at(1).getTime());
  expect(detail.interruptions[1]?.durationS).toBeNull();
});

test('loadSessionDetail on an unrated session reports no survey', async () => {
  const s = start();
  await repo.insertStarted(s);
  await repo.end({ id: s.id, endedAt: at(30), actualDurationMs: 30 * MIN, totalPausedMs: 0 });
  const detail = await repo.loadSessionDetail(s.id);
  expect(detail.hasSurvey).toBe(false);
  expect(detail.focusRating).toBeNull();
  expect(detail.note).toBeNull();
  expect(detail.interruptions).toEqual([]);
});

test('loadSessionDetail excludes soft-deleted surveys and interruptions', async () => {
  const s = start();
  await repo.insertStarted(s);
  await repo.end({ id: s.id, endedAt: at(30), actualDurationMs: 30 * MIN, totalPausedMs: 0 });
  await new SqliteInterruptionRepository(db, clock.now).logSelfReport({
    sessionId: s.id,
    occurredAt: at(5),
  });
  await new SqliteSurveyRepository(db, clock.now).save({ sessionId: s.id, focusRating: 4 });

  db.prepare('UPDATE interruptions SET deleted_at = ?').run(toEpochSeconds(at(40)));
  db.prepare('UPDATE session_surveys SET deleted_at = ?').run(toEpochSeconds(at(40)));

  const detail = await repo.loadSessionDetail(s.id);
  expect(detail.interruptions).toEqual([]);
  expect(detail.hasSurvey).toBe(false);
});

test('loadSessionDetail shows only this session', async () => {
  const mine = start('mine');
  const other = start('other');
  await repo.insertStarted(mine);
  await repo.insertStarted(other);
  const log = new SqliteInterruptionRepository(db, clock.now);
  await log.logSelfReport({ sessionId: mine.id, occurredAt: at(5) });
  await log.logSelfReport({ sessionId: other.id, occurredAt: at(5) });
  await log.logSelfReport({ sessionId: other.id, occurredAt: at(6) });

  expect((await repo.loadSessionDetail(mine.id)).interruptions).toHaveLength(1);
  expect((await repo.loadSessionDetail(other.id)).interruptions).toHaveLength(2);
});

test('end() clamps negative durations rather than persisting them', async () => {
  // A clock stepped backwards makes ActiveSession.elapsedMs negative by design.
  // Unclamped, that reached actual_duration_s and flowed straight into the
  // qualified-day inputs of data-model.md §5.1. The two sibling duration
  // writers (crash recovery, logPause) already clamp; this one did not.
  const s = start();
  await repo.insertStarted(s);
  await repo.end({
    id: s.id,
    endedAt: at(-5),
    actualDurationMs: -5 * MIN,
    totalPausedMs: -60_000,
  });
  expect(row()?.['actual_duration_s']).toBe(0);
  expect(row()?.['paused_duration_s']).toBe(0);
  expect((await repo.listHistory())[0]?.actualDurationS).toBe(0);
});
