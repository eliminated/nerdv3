import { beforeEach, expect, test } from 'vitest';

import { createFixtureRepositories, type Repositories } from '@nerdyapp/core';

import { SessionController } from '../src/main/session-controller.js';

/**
 * The orderings that broke the Flutter build twice.
 *
 * Every race here is written as a MIRROR PAIR — A-then-B and B-then-A — because
 * the bug that survived the first agent pass lived in the ordering that had not
 * been written. Tracing async orderings by hand is not proof.
 *
 * The controller takes repositories and a clock only, so this runs with no
 * Electron and no database: the fixture binding is the double.
 */

const MIN = 60_000;
let clockMs = Date.UTC(2026, 6, 26, 10, 0, 0);
const now = (): Date => new Date(clockMs);
const advance = (minutes: number): void => {
  clockMs += minutes * MIN;
};

let repos: Repositories;
let ctl: SessionController;
let subjectId: string;

beforeEach(async () => {
  clockMs = Date.UTC(2026, 6, 26, 10, 0, 0);
  repos = createFixtureRepositories(now);
  ctl = new SessionController(repos, now);
  subjectId = await repos.subjects.create({ name: 'Physics' });
});

const pauseRows = async (sessionId: string): Promise<number> =>
  (await repos.sessions.loadSessionDetail(sessionId)).interruptions.filter(
    (i) => i.kind === 'manual_pause',
  ).length;

test('a completed pause logs exactly ONE row', async () => {
  const s = await ctl.start(subjectId);
  advance(10);
  await ctl.togglePause();
  advance(2);
  await ctl.togglePause();
  expect(await pauseRows(s.id)).toBe(1);
});

test('an in-flight pause logs NOTHING until it closes', async () => {
  // Append-only: a row is never written until its duration is known.
  const s = await ctl.start(subjectId);
  advance(10);
  await ctl.togglePause();
  expect(await pauseRows(s.id)).toBe(0);
});

test('ending while paused closes that pause with exactly one row', async () => {
  const s = await ctl.start(subjectId);
  advance(10);
  await ctl.togglePause();
  advance(3);
  await ctl.end();
  expect(await pauseRows(s.id)).toBe(1);
});

// --- the mirror pairs -------------------------------------------------------

test('RACE: end() then togglePause() logs one pause, not two', async () => {
  const s = await ctl.start(subjectId);
  advance(10);
  await ctl.togglePause(); // now paused
  advance(2);
  // Both handlers start before either finishes. If end() cleared its state
  // AFTER awaiting the log, the resume would still observe a paused session and
  // append a second row for the same pause.
  await Promise.all([ctl.end(), ctl.togglePause()]);
  expect(await pauseRows(s.id), 'one pause happened, so one row').toBe(1);
});

test('RACE: togglePause() then end() logs one pause, not two (the mirror)', async () => {
  const s = await ctl.start(subjectId);
  advance(10);
  await ctl.togglePause(); // now paused
  advance(2);
  await Promise.all([ctl.togglePause(), ctl.end()]);
  expect(await pauseRows(s.id), 'the ordering the first pass did not write').toBe(1);
});

test('RACE: two end() calls log one pause and end the session once', async () => {
  const s = await ctl.start(subjectId);
  advance(10);
  await ctl.togglePause();
  advance(2);
  await Promise.all([ctl.end(), ctl.end()]);
  expect(await pauseRows(s.id)).toBe(1);
  const history = await repos.sessions.listHistory();
  expect(history).toHaveLength(1);
  expect(history[0]?.sessionId).toBe(s.id);
});

test('RACE: two start() calls do not open two sessions', async () => {
  await Promise.all([ctl.start(subjectId), ctl.start(subjectId)]);
  await ctl.end();

  // Recovery is what makes this assertion able to FAIL. An orphaned second
  // session stays OPEN, and listHistory shows only ended sessions — so
  // asserting on history alone passes whether or not the guard exists. That
  // was the first version of this test, and probing it red is what exposed
  // both the unfailable assertion and a real double-start defect underneath.
  await repos.sessions.recoverCrashedSessions();
  const history = await repos.sessions.listHistory();
  expect(history, 'an orphan would surface here as a spurious "crashed" session').toHaveLength(1);
  expect(history[0]?.endReason).toBe('user_ended');
});

test('a racing pause cannot resurrect an ended session', async () => {
  await ctl.start(subjectId);
  advance(10);
  await Promise.all([ctl.end(), ctl.togglePause()]);
  expect(ctl.snapshot(), 'the controller must not hold an ended session').toBeNull();
  const history = await repos.sessions.listHistory();
  expect(history[0]?.endReason).toBe('user_ended');
});

test('RACE: end() then start() does not hand back the ENDED session', async () => {
  // start() has no post-await recheck, so while end() was suspended inside
  // sessions.end() the controller still held the finished session and start()
  // returned its snapshot. The renderer assigns that to `session`, showing a
  // ticking clock for a session the controller no longer owns; the next
  // togglePause returns null and logSelfReport records nothing.
  const first = await ctl.start(subjectId);
  advance(10);
  const [, second] = await Promise.all([ctl.end(), ctl.start(subjectId)]);
  expect(second.id, 'a new session, not the one just ended').not.toBe(first.id);
  expect(ctl.snapshot()?.id).toBe(second.id);
});

test('RACE: start() then end() leaves a usable controller (the mirror)', async () => {
  const first = await ctl.start(subjectId);
  advance(10);
  const [second] = await Promise.all([ctl.start(subjectId), ctl.end()]);
  // Either the second start won the empty slot or it returned the live session;
  // what must NOT happen is the controller holding a session that has ended.
  const held = ctl.snapshot();
  if (held !== null) expect(held.id).not.toBe(first.id);
  expect(second).toBeDefined();
});

test('RACE: end() then logSelfReport() does not log against an ended session', async () => {
  // logSessionEvent is the only session-scoped write with no ended_at guard, so
  // a report landing after the closing write would attach to a finished session.
  const s = await ctl.start(subjectId);
  advance(10);
  await Promise.all([ctl.end(), ctl.logSelfReport()]);
  expect(await repos.interruptions.countSelfReports(s.id)).toBe(0);
});

test('RACE: logSelfReport() then end() also logs nothing after the close (mirror)', async () => {
  const s = await ctl.start(subjectId);
  advance(10);
  await Promise.all([ctl.logSelfReport(), ctl.end()]);
  // The report either lands before the close or not at all — never after.
  const count = await repos.interruptions.countSelfReports(s.id);
  expect(count).toBeLessThanOrEqual(1);
  const history = await repos.sessions.listHistory();
  expect(history[0]?.endReason).toBe('user_ended');
});

// --- state and timing -------------------------------------------------------

test('the snapshot round-trips through the IPC-shaped value', async () => {
  const s = await ctl.start(subjectId);
  expect(s.pauseStartedAtMs).toBeNull();
  advance(10);
  const paused = await ctl.togglePause();
  expect(paused?.pauseStartedAtMs).not.toBeNull();
  expect(paused?.accumulatedPauseMs).toBe(0);
  advance(5);
  const resumed = await ctl.togglePause();
  expect(resumed?.accumulatedPauseMs, 'five minutes of pause accumulated').toBe(5 * MIN);
});

test('ending clears controller state and records the elapsed time', async () => {
  await ctl.start(subjectId);
  advance(10);
  await ctl.togglePause();
  advance(5);
  await ctl.togglePause();
  advance(15);
  await ctl.end();
  expect(ctl.snapshot()).toBeNull();
  const h = (await repos.sessions.listHistory())[0];
  expect(h?.actualDurationS, '30 minutes wall clock minus 5 paused').toBe(25 * 60);
});

test('togglePause and end are no-ops with no session', async () => {
  expect(await ctl.togglePause()).toBeNull();
  await ctl.end();
  await ctl.logSelfReport();
  expect(await repos.sessions.listHistory()).toEqual([]);
});

test('a self report is attached to the running session', async () => {
  const s = await ctl.start(subjectId);
  await ctl.logSelfReport();
  await ctl.logSelfReport();
  expect(await repos.interruptions.countSelfReports(s.id)).toBe(2);
});
