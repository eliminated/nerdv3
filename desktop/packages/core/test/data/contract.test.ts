import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createFixtureRepositories, type Repositories } from '../../src/data/fixtures/index.js';
import { SqliteInterruptionRepository } from '../../src/data/interruption-repository.js';
import { SqliteSessionRepository } from '../../src/data/session-repository.js';
import { SqliteSubjectRepository } from '../../src/data/subject-repository.js';
import { SqliteSurveyRepository } from '../../src/data/survey-repository.js';
import type { Database } from '../../src/db/connection.js';
import { ensureLocalUser } from '../../src/db/local-user.js';
import { ActiveSession } from '../../src/domain/active-session.js';
import { DomainStateError, ValidationError } from '../../src/errors.js';
import { fixedClock, freshDb } from '../support/fixture.js';

/**
 * ONE suite, run against BOTH bindings.
 *
 * `nerdyapp.exe` binds these interfaces to SQLite; `nerdyapp-test.exe` binds
 * them to in-memory fixtures and opens no database at all (V3 spec §5). Two
 * implementations of one contract is a design that invites drift — and drift
 * here is not cosmetic: the test build is what the UX is walked and debugged
 * on, so a fixture that is more permissive than the product silently teaches
 * the wrong behaviour, and one that is less permissive sends someone hunting a
 * bug that does not exist.
 *
 * Every assertion below is therefore written once and executed twice. A test
 * that can only pass for one binding does not belong in this file.
 */

const MIN = 60_000;
const t0 = new Date('2026-07-26T10:00:00.000Z');
const at = (m: number): Date => new Date(t0.getTime() + m * MIN);

type Harness = Repositories & { dispose: () => void };

const clock = fixedClock(t0);

function sqliteHarness(): Harness {
  const db: Database = freshDb();
  ensureLocalUser(db);
  return {
    subjects: new SqliteSubjectRepository(db, clock.now),
    sessions: new SqliteSessionRepository(db, clock.now),
    surveys: new SqliteSurveyRepository(db, clock.now),
    interruptions: new SqliteInterruptionRepository(db, clock.now),
    dispose: () => {
      db.close();
    },
  };
}

function fixtureHarness(): Harness {
  const repos = createFixtureRepositories(clock.now);
  return { ...repos, dispose: () => undefined };
}

describe.each([
  ['sqlite', sqliteHarness],
  ['fixture', fixtureHarness],
])('%s binding', (_name, make) => {
  let r: Harness;
  let subjectId: string;

  beforeEach(async () => {
    clock.set(t0);
    r = make();
    subjectId = await r.subjects.create({ name: 'Physics' });
  });
  afterEach(() => {
    r.dispose();
  });

  const startSession = async (id = 'sess-1', startedAt = t0): Promise<ActiveSession> => {
    const s = ActiveSession.start({ id, subjectId, startedAt });
    await r.sessions.insertStarted(s);
    return s;
  };

  const endNormally = async (s: ActiveSession, endedAt = at(30)): Promise<void> =>
    r.sessions.end({
      id: s.id,
      endedAt,
      actualDurationMs: s.elapsedMs(endedAt),
      totalPausedMs: s.totalPausedMs(endedAt),
    });

  // --- subjects ---------------------------------------------------------

  test('a created subject is listed, with its optional fields', async () => {
    const id = await r.subjects.create({
      name: 'Flutter',
      color: '#42A5F5',
      source: 'course',
      sourceName: 'Udemy',
    });
    const rich = (await r.subjects.list()).find((s) => s.id === id);
    expect([rich?.name, rich?.color, rich?.source, rich?.sourceName]).toEqual([
      'Flutter',
      '#42A5F5',
      'course',
      'Udemy',
    ]);
    expect(rich?.archived).toBe(false);
  });

  test('archiving moves a subject between the two lists, both ways', async () => {
    await r.subjects.setArchived(subjectId, true);
    expect(await r.subjects.list()).toEqual([]);
    expect((await r.subjects.list({ archived: true }))[0]?.name).toBe('Physics');
    await r.subjects.setArchived(subjectId, false);
    expect((await r.subjects.list())[0]?.name).toBe('Physics');
  });

  test('removal is soft: gone from both lists', async () => {
    await r.subjects.remove(subjectId);
    expect(await r.subjects.list()).toEqual([]);
    expect(await r.subjects.list({ archived: true })).toEqual([]);
  });

  test('subject list is newest-first', async () => {
    clock.set(at(60));
    const later = await r.subjects.create({ name: 'Later' });
    expect((await r.subjects.list())[0]?.id).toBe(later);
  });

  // --- sessions ---------------------------------------------------------

  test('a started session is absent from history until it ends', async () => {
    const s = await startSession();
    expect(await r.sessions.listHistory()).toEqual([]);
    await endNormally(s);
    expect((await r.sessions.listHistory()).map((h) => h.sessionId)).toEqual([s.id]);
  });

  test('ending records duration, pause and end_reason', async () => {
    const s = await startSession();
    const paused = s.pause(at(10)).resume(at(12));
    await r.sessions.end({
      id: s.id,
      endedAt: at(30),
      actualDurationMs: paused.elapsedMs(at(30)),
      totalPausedMs: paused.totalPausedMs(at(30)),
    });
    const h = (await r.sessions.listHistory())[0];
    expect(h?.actualDurationS).toBe(28 * 60);
    expect(h?.endReason).toBe('user_ended');
  });

  test('an ended session is IMMUTABLE through every write path', async () => {
    const s = await startSession();
    await endNormally(s);
    const before = (await r.sessions.listHistory())[0];

    clock.set(at(90));
    await r.sessions.updatePausedDuration(s.id, 9 * 3600_000);
    await r.sessions.end({
      id: s.id,
      endedAt: at(90),
      actualDurationMs: 9 * 3600_000,
      totalPausedMs: 9 * 3600_000,
    });
    await r.sessions.recoverCrashedSessions();

    expect((await r.sessions.listHistory())[0]).toEqual(before);
  });

  test('end() clamps a negative duration rather than persisting it', async () => {
    const s = await startSession();
    await r.sessions.end({
      id: s.id,
      endedAt: at(-5),
      actualDurationMs: -5 * MIN,
      totalPausedMs: -60_000,
    });
    expect((await r.sessions.listHistory())[0]?.actualDurationS).toBe(0);
  });

  test('history keeps the subject name after archive and after removal', async () => {
    const s = await startSession();
    await endNormally(s);
    await r.subjects.setArchived(subjectId, true);
    expect((await r.sessions.listHistory())[0]?.subjectName).toBe('Physics');
    await r.subjects.remove(subjectId);
    expect((await r.sessions.listHistory())[0]?.subjectName).toBe('Physics');
  });

  test('history is newest-first', async () => {
    const a = await startSession('a', t0);
    await endNormally(a, at(20));
    const b = await startSession('b', at(60));
    await endNormally(b, at(80));
    expect((await r.sessions.listHistory()).map((h) => h.sessionId)).toEqual(['b', 'a']);
  });

  // --- crash recovery ---------------------------------------------------

  test('recovery closes an open session as crashed at its last write', async () => {
    const s = await startSession();
    clock.set(at(30));
    await r.sessions.updatePausedDuration(s.id, 5 * MIN);

    clock.set(at(120));
    expect(await r.sessions.recoverCrashedSessions()).toBe(1);
    const h = (await r.sessions.listHistory())[0];
    expect(h?.endReason).toBe('crashed');
    expect(h?.actualDurationS, 'last write minus pause, not now()').toBe(25 * 60);
    expect(await r.sessions.recoverCrashedSessions(), 'idempotent').toBe(0);
  });

  test('recovery clamps a negative computed duration to zero', async () => {
    const s = await startSession();
    clock.set(at(10));
    await r.sessions.updatePausedDuration(s.id, 60 * MIN);
    await r.sessions.recoverCrashedSessions();
    expect((await r.sessions.listHistory())[0]?.actualDurationS).toBe(0);
  });

  test('recovery closes EVERY open session in one pass', async () => {
    await startSession('a');
    await startSession('b');
    await startSession('c');
    clock.set(at(10));
    expect(await r.sessions.recoverCrashedSessions()).toBe(3);
    const h = await r.sessions.listHistory();
    expect(h.every((x) => x.endReason === 'crashed')).toBe(true);
  });

  // --- surveys ----------------------------------------------------------

  test('a survey round-trips through session detail', async () => {
    const s = await startSession();
    await endNormally(s);
    await r.surveys.save({
      sessionId: s.id,
      focusRating: 4,
      comprehensionRating: 2,
      note: '  kept  inside  ',
    });
    const d = await r.sessions.loadSessionDetail(s.id);
    expect(d.hasSurvey).toBe(true);
    expect([d.focusRating, d.comprehensionRating, d.difficultyRating]).toEqual([4, 2, null]);
    expect(d.note, 'trimmed at the edges, interior preserved').toBe('kept  inside');
  });

  test('a blank note is stored as null, not as an empty string', async () => {
    const s = await startSession();
    await endNormally(s);
    await r.surveys.save({ sessionId: s.id, focusRating: 3, note: '   ' });
    expect((await r.sessions.loadSessionDetail(s.id)).note).toBeNull();
  });

  test('a survey is REFUSED for a crashed session', async () => {
    const s = await startSession();
    clock.set(at(10));
    await r.sessions.recoverCrashedSessions();
    await expect(r.surveys.save({ sessionId: s.id, focusRating: 5 })).rejects.toThrow(
      DomainStateError,
    );
    expect((await r.sessions.loadSessionDetail(s.id)).hasSurvey).toBe(false);
  });

  test('a survey is refused for a running session and for an unknown one', async () => {
    const s = await startSession();
    await expect(r.surveys.save({ sessionId: s.id, focusRating: 5 })).rejects.toThrow(
      DomainStateError,
    );
    await expect(r.surveys.save({ sessionId: 'nope', focusRating: 5 })).rejects.toThrow(
      DomainStateError,
    );
  });

  test('a survey is insert-only', async () => {
    const s = await startSession();
    await endNormally(s);
    await r.surveys.save({ sessionId: s.id, focusRating: 4 });
    await expect(r.surveys.save({ sessionId: s.id, focusRating: 5 })).rejects.toThrow();
    expect((await r.sessions.loadSessionDetail(s.id)).focusRating, 'the first stands').toBe(4);
  });

  test('ratings outside 1..5, and non-integers, are refused', async () => {
    const s = await startSession();
    await endNormally(s);
    for (const bad of [0, 6, -1, 2.5, Number.NaN]) {
      await expect(
        r.surveys.save({ sessionId: s.id, focusRating: bad }),
        `focusRating ${String(bad)}`,
      ).rejects.toThrow(ValidationError);
    }
    for (const good of [1, 5]) {
      const g = await startSession(`ok-${String(good)}`);
      await endNormally(g);
      await r.surveys.save({ sessionId: g.id, focusRating: good });
    }
  });

  // --- interruptions / the privacy line ---------------------------------

  test('kind cannot carry app identity — the CLOSED vocabulary, both bindings', async () => {
    const s = await startSession();
    for (const smuggled of [
      'app_switch:chrome.exe',
      'Discord',
      'app-switch',
      'app_switch_chrome',
      'discord',
      'whatsapp',
      '',
    ]) {
      await expect(
        r.interruptions.logSessionEvent({ sessionId: s.id, kind: smuggled, occurredAt: t0 }),
        `"${smuggled}" must be refused by BOTH bindings`,
      ).rejects.toThrow(ValidationError);
    }
    expect((await r.sessions.loadSessionDetail(s.id)).interruptions).toEqual([]);
    for (const kind of ['manual_pause', 'self_reported', 'app_switch', 'exit_attempt']) {
      await r.interruptions.logSessionEvent({ sessionId: s.id, kind, occurredAt: t0 });
    }
    expect((await r.sessions.loadSessionDetail(s.id)).interruptions).toHaveLength(4);
  });

  test('durationS is bounded in both bindings', async () => {
    const s = await startSession();
    for (const bad of [0x63_68_72_6f_6d_65, -1, 2.5, 86_401]) {
      await expect(
        r.interruptions.logSessionEvent({
          sessionId: s.id,
          kind: 'app_switch',
          occurredAt: t0,
          durationS: bad,
        }),
      ).rejects.toThrow(ValidationError);
    }
  });

  test('logPause writes ONE row per completed pause, at the pause moment', async () => {
    const s = await startSession();
    await r.interruptions.logPause({
      sessionId: s.id,
      pauseStartedAt: at(10),
      resumedAt: at(12),
    });
    const log = (await r.sessions.loadSessionDetail(s.id)).interruptions;
    expect(log, 'exact count — a duplicate is the bug two agent passes found').toHaveLength(1);
    expect(log[0]?.kind).toBe('manual_pause');
    expect(log[0]?.durationS).toBe(120);
    expect(log[0]?.occurredAt.getTime(), 'when the pause STARTED').toBe(at(10).getTime());
  });

  test('logPause clamps a negative span to zero', async () => {
    const s = await startSession();
    await r.interruptions.logPause({
      sessionId: s.id,
      pauseStartedAt: at(12),
      resumedAt: at(10),
    });
    expect((await r.sessions.loadSessionDetail(s.id)).interruptions[0]?.durationS).toBe(0);
  });

  test('self reports are counted per session, and a pause is not one', async () => {
    const s = await startSession();
    expect(await r.interruptions.countSelfReports(s.id)).toBe(0);
    await r.interruptions.logSelfReport({ sessionId: s.id, occurredAt: t0 });
    await r.interruptions.logPause({ sessionId: s.id, pauseStartedAt: t0, resumedAt: t0 });
    expect(await r.interruptions.countSelfReports(s.id)).toBe(1);
  });

  test('an unknown session id is refused', async () => {
    await expect(
      r.interruptions.logSelfReport({ sessionId: 'no-such-session', occurredAt: t0 }),
    ).rejects.toThrow();
  });

  test('the event log is ordered by time, then deterministically by id', async () => {
    const s = await startSession();
    await r.interruptions.logSelfReport({ sessionId: s.id, occurredAt: at(5) });
    await r.interruptions.logSelfReport({ sessionId: s.id, occurredAt: at(5) });
    await r.interruptions.logPause({ sessionId: s.id, pauseStartedAt: at(1), resumedAt: at(3) });
    expect((await r.sessions.loadSessionDetail(s.id)).interruptions.map((i) => i.kind)).toEqual([
      'manual_pause',
      'self_reported',
      'self_reported',
    ]);
  });

  test('session detail shows only this session', async () => {
    const mine = await startSession('mine');
    const other = await startSession('other');
    await r.interruptions.logSelfReport({ sessionId: mine.id, occurredAt: at(5) });
    await r.interruptions.logSelfReport({ sessionId: other.id, occurredAt: at(5) });
    await r.interruptions.logSelfReport({ sessionId: other.id, occurredAt: at(6) });
    expect((await r.sessions.loadSessionDetail(mine.id)).interruptions).toHaveLength(1);
    expect((await r.sessions.loadSessionDetail(other.id)).interruptions).toHaveLength(2);
  });

  test('an unrated session reports no survey and an empty log', async () => {
    const s = await startSession();
    await endNormally(s);
    const d = await r.sessions.loadSessionDetail(s.id);
    expect(d.hasSurvey).toBe(false);
    expect(d.focusRating).toBeNull();
    expect(d.interruptions).toEqual([]);
  });
});
