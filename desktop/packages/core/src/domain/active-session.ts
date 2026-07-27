import { DomainStateError } from '../errors.js';

/**
 * The session timing state machine (architecture.md §3.4).
 *
 * Two rules make this the correctness-critical heart of the app:
 *
 *  1. **Elapsed time is always computed from timestamps, never a tick counter.**
 *     A counter drifts, cannot survive a process restart, and cannot be
 *     reconstructed from the database — which is why crash recovery works at
 *     all.
 *  2. **Every transition returns a new instance, and instances are genuinely
 *     immutable.** Instants are held as epoch milliseconds — a value type —
 *     rather than as `Date` objects, and the `Date`s handed out are fresh
 *     copies. `readonly` alone would NOT be enough: it blocks reassigning the
 *     field, not mutating the object the field points at, so a caller doing
 *     `session.startedAt.setTime(0)` could rewrite a session's history from
 *     the outside. The instance is frozen so plain-JS assignment fails too.
 *     This matters because a value captured before an await must still describe
 *     the situation it was captured in.
 *
 * Durations are milliseconds. Truncation to whole seconds happens exactly once,
 * at the database boundary — truncating per transition would lose up to a
 * second per pause and drift a long session away from wall clock.
 *
 * Pure: imports nothing but the error type. No Electron, no Vue, no SQLite.
 */
export class ActiveSession {
  private constructor(
    readonly id: string,
    readonly subjectId: string,
    /** 'plain' | 'focused' — chosen at start, immutable for the session's life. */
    readonly mode: string,
    private readonly startedAtMs: number,
    readonly accumulatedPauseMs: number,
    private readonly pauseStartedAtMs: number | null,
  ) {
    Object.freeze(this);
  }

  static start(a: {
    id: string;
    subjectId: string;
    startedAt: Date;
    mode?: string;
  }): ActiveSession {
    return new ActiveSession(a.id, a.subjectId, a.mode ?? 'plain', a.startedAt.getTime(), 0, null);
  }

  /** A fresh copy each time: handing out the internal instant would re-open the
   *  aliasing hole that storing epoch milliseconds closes. */
  get startedAt(): Date {
    return new Date(this.startedAtMs);
  }

  get pauseStartedAt(): Date | null {
    return this.pauseStartedAtMs === null ? null : new Date(this.pauseStartedAtMs);
  }

  get isPaused(): boolean {
    return this.pauseStartedAtMs !== null;
  }

  pause(now: Date): ActiveSession {
    if (this.pauseStartedAtMs !== null) throw new DomainStateError('already paused');
    return new ActiveSession(
      this.id,
      this.subjectId,
      this.mode,
      this.startedAtMs,
      this.accumulatedPauseMs,
      now.getTime(),
    );
  }

  resume(now: Date): ActiveSession {
    const pausedAt = this.pauseStartedAtMs;
    if (pausedAt === null) throw new DomainStateError('not paused');
    return new ActiveSession(
      this.id,
      this.subjectId,
      this.mode,
      this.startedAtMs,
      // Clamped. DELIBERATE DEVIATION from the Dart original, which added the
      // raw span: the wall clock is not monotonic, and an NTP correction mid
      // pause would otherwise make accumulatedPauseMs negative — which inflates
      // elapsed ABOVE the wall-clock window (25 minutes of active time inside a
      // 20-minute session) and persists a negative paused_duration_s that no
      // CHECK constraint would catch. InterruptionRepository.logPause already
      // clamps this exact span, so leaving it unclamped here made the two
      // writers disagree about one pause.
      this.accumulatedPauseMs + Math.max(0, now.getTime() - pausedAt),
      null,
    );
  }

  /** Completed pauses, plus the one in flight if there is one. */
  totalPausedMs(now: Date): number {
    const pausedAt = this.pauseStartedAtMs;
    return this.accumulatedPauseMs + (pausedAt === null ? 0 : Math.max(0, now.getTime() - pausedAt));
  }

  elapsedMs(now: Date): number {
    return now.getTime() - this.startedAtMs - this.totalPausedMs(now);
  }
}
