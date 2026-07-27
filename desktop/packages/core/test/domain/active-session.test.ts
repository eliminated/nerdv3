import { describe, expect, test } from 'vitest';

import { ActiveSession } from '../../src/domain/active-session.js';
import { DomainStateError } from '../../src/errors.js';

const MIN = 60_000;
const t0 = new Date('2026-07-26T10:00:00.000Z');
const at = (minutes: number): Date => new Date(t0.getTime() + minutes * MIN);
const started = (): ActiveSession =>
  ActiveSession.start({ id: 'id', subjectId: 'subj', startedAt: t0 });

describe('ActiveSession', () => {
  test('elapsed tracks wall clock while running', () => {
    expect(started().elapsedMs(at(5))).toBe(5 * MIN);
  });

  test('a pause/resume cycle is excluded from elapsed', () => {
    const s = started().pause(at(10)).resume(at(15));
    expect(s.elapsedMs(at(20))).toBe(15 * MIN);
    expect(s.totalPausedMs(at(20))).toBe(5 * MIN);
  });

  test('elapsed freezes during an in-flight pause', () => {
    const s = started().pause(at(10));
    expect(s.elapsedMs(at(25))).toBe(10 * MIN);
    expect(s.totalPausedMs(at(25))).toBe(15 * MIN);
  });

  test('multiple pause cycles accumulate', () => {
    const s = started().pause(at(10)).resume(at(12)).pause(at(20)).resume(at(25));
    expect(s.elapsedMs(at(30))).toBe(23 * MIN);
    expect(s.totalPausedMs(at(30))).toBe(7 * MIN);
  });

  test('pause while paused throws', () => {
    expect(() => started().pause(at(1)).pause(at(2))).toThrow(DomainStateError);
  });

  test('resume while running throws', () => {
    expect(() => started().resume(at(1))).toThrow(DomainStateError);
  });

  test('mode defaults to plain and survives every transition', () => {
    expect(started().mode).toBe('plain');
    const f = ActiveSession.start({
      id: 'i',
      subjectId: 's',
      startedAt: t0,
      mode: 'focused',
    });
    expect(f.pause(at(1)).resume(at(2)).pause(at(3)).mode).toBe('focused');
  });

  test('id and subjectId survive every transition', () => {
    const s = started().pause(at(1)).resume(at(2));
    expect([s.id, s.subjectId]).toEqual(['id', 'subj']);
  });

  test('a transition returns a NEW instance and never mutates the old one', () => {
    // Elapsed is computed from the instance's timestamps, so a session mutated
    // in place would silently rewrite history for anything still holding the
    // previous value — including a UI frame mid-render.
    const running = started();
    const paused = running.pause(at(10));
    expect(paused).not.toBe(running);
    expect(running.isPaused).toBe(false);
    expect(running.pauseStartedAt).toBeNull();
    expect(paused.isPaused).toBe(true);
    expect(running.elapsedMs(at(25))).toBe(25 * MIN);
    expect(paused.elapsedMs(at(25))).toBe(10 * MIN);
  });

  test('elapsed is computed from timestamps, so a backwards clock is visible', () => {
    // Guards the tick-counter regression (architecture.md §3.4): a counter would
    // return a monotonically growing value regardless of `now`. Several tests
    // here would catch that ('elapsed freezes during an in-flight pause' among
    // them); this is simply the sharpest, since no counter can return a
    // negative.
    expect(started().elapsedMs(new Date(t0.getTime() - 5 * MIN))).toBe(-5 * MIN);
  });

  test('elapsed keeps SUB-SECOND precision', () => {
    // The header claims truncation happens exactly once, at the database
    // boundary. Every other elapsed assertion here uses whole minutes, so
    // rounding or truncating inside elapsedMs would have gone unnoticed —
    // and elapsedMs is what becomes actual_duration_s. A 1600 ms session must
    // store 1 second, not 2.
    expect(started().elapsedMs(new Date(t0.getTime() + 1600))).toBe(1600);
    expect(started().elapsedMs(new Date(t0.getTime() + 999))).toBe(999);
  });

  test('a clock that steps BACKWARDS mid-pause cannot invent active time', () => {
    // An NTP correction during a pause. Unclamped, resume() would add a
    // negative span: elapsed becomes 25 minutes inside a 20-minute wall-clock
    // window, and a negative paused_duration_s persists with no CHECK to catch
    // it. InterruptionRepository.logPause clamps the very same span, so leaving
    // this unclamped made two writers disagree about one pause.
    const s = started().pause(at(10)).resume(at(5));
    expect(s.accumulatedPauseMs).toBe(0);
    expect(s.elapsedMs(at(20))).toBe(20 * MIN);
    expect(s.elapsedMs(at(20))).toBeLessThanOrEqual(20 * MIN);
  });

  test('a backwards clock during an IN-FLIGHT pause cannot invent active time', () => {
    const s = started().pause(at(10));
    expect(s.totalPausedMs(at(5))).toBe(0);
    expect(s.elapsedMs(at(5))).toBeLessThanOrEqual(5 * MIN);
  });

  test('mutating a Date handed in or out cannot rewrite a session', () => {
    // `readonly` blocks reassigning the field, NOT mutating the object it
    // points at. Storing epoch milliseconds and handing out copies is what
    // makes the immutability claim in this file's header actually true.
    const seed = new Date(t0);
    const s = ActiveSession.start({ id: 'i', subjectId: 'x', startedAt: seed });

    seed.setUTCFullYear(2000);
    expect(s.elapsedMs(at(5)), 'mutating the seed Date must not move the session').toBe(5 * MIN);

    s.startedAt.setTime(0);
    expect(s.elapsedMs(at(5)), 'mutating the Date we handed out must not move it either').toBe(
      5 * MIN,
    );

    const paused = s.pause(at(10));
    paused.pauseStartedAt?.setTime(0);
    expect(paused.totalPausedMs(at(15))).toBe(5 * MIN);
  });

  test('an instance is frozen, so plain-JS assignment cannot rewrite it', () => {
    // Dart's `final` is runtime-enforced; TypeScript's `readonly` is erased.
    const s = started();
    expect(Object.isFrozen(s)).toBe(true);
    expect(() => {
      (s as unknown as { accumulatedPauseMs: number }).accumulatedPauseMs = 9_999;
    }).toThrow(TypeError);
    expect(s.elapsedMs(at(5))).toBe(5 * MIN);
  });

  test('sub-second pause spans accumulate at full precision', () => {
    // The truncation to whole seconds happens once, at the database boundary.
    // Truncating per-transition instead would lose up to a second per pause and
    // silently drift a long session away from wall clock.
    const s = started()
      .pause(new Date(t0.getTime() + 1000))
      .resume(new Date(t0.getTime() + 1600))
      .pause(new Date(t0.getTime() + 2000))
      .resume(new Date(t0.getTime() + 2600));
    expect(s.totalPausedMs(at(1))).toBe(1200);
  });

  test('a zero-length pause is legal and changes nothing', () => {
    const s = started().pause(at(10)).resume(at(10));
    expect(s.totalPausedMs(at(20))).toBe(0);
    expect(s.elapsedMs(at(20))).toBe(20 * MIN);
    expect(s.isPaused).toBe(false);
  });
});
