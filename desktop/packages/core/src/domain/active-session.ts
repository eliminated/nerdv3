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
 *  2. **Every transition returns a new instance.** Nothing here mutates, so a
 *     value captured before an await still describes the situation it was
 *     captured in. Mutating in place is how a UI frame mid-render, or a racing
 *     handler, would silently observe rewritten history.
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
    readonly startedAt: Date,
    readonly accumulatedPauseMs: number,
    readonly pauseStartedAt: Date | null,
  ) {}

  static start(a: {
    id: string;
    subjectId: string;
    startedAt: Date;
    mode?: string;
  }): ActiveSession {
    return new ActiveSession(a.id, a.subjectId, a.mode ?? 'plain', a.startedAt, 0, null);
  }

  get isPaused(): boolean {
    return this.pauseStartedAt !== null;
  }

  pause(now: Date): ActiveSession {
    if (this.pauseStartedAt !== null) throw new DomainStateError('already paused');
    return new ActiveSession(
      this.id,
      this.subjectId,
      this.mode,
      this.startedAt,
      this.accumulatedPauseMs,
      now,
    );
  }

  resume(now: Date): ActiveSession {
    const pausedAt = this.pauseStartedAt;
    if (pausedAt === null) throw new DomainStateError('not paused');
    return new ActiveSession(
      this.id,
      this.subjectId,
      this.mode,
      this.startedAt,
      this.accumulatedPauseMs + (now.getTime() - pausedAt.getTime()),
      null,
    );
  }

  /** Completed pauses, plus the one in flight if there is one. */
  totalPausedMs(now: Date): number {
    const pausedAt = this.pauseStartedAt;
    return this.accumulatedPauseMs + (pausedAt === null ? 0 : now.getTime() - pausedAt.getTime());
  }

  elapsedMs(now: Date): number {
    return now.getTime() - this.startedAt.getTime() - this.totalPausedMs(now);
  }
}
