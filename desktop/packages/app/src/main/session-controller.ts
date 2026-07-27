import { ActiveSession, newId, type ActiveSessionSnapshot, type Repositories } from '@nerdyapp/core';

/**
 * The one owner of live session state (plan P31B, decision B7).
 *
 * It lives in the MAIN process and takes only repositories and a clock — no
 * Electron — so the orderings that broke the Flutter build twice are testable
 * here without a window.
 *
 * ## The rule this class exists to obey
 *
 * **Clear `current` BEFORE the last await, never after.** Any window in which
 * this method is suspended while `current` still describes the old situation is
 * a window another handler will observe — and that is exactly how one pause got
 * logged twice in the Flutter build. Two separate agent passes found the same
 * bug class, the second in an ordering the first had not tested.
 *
 * The corollary, learned the same way: tracing async orderings by hand is not
 * proof. For every race test, write the MIRROR ordering too — the bug lived in
 * the one that had not been written.
 */
export class SessionController {
  private current: ActiveSession | null = null;

  constructor(
    private readonly repos: Repositories,
    private readonly now: () => Date = () => new Date(),
  ) {}

  snapshot(): ActiveSessionSnapshot | null {
    return this.current?.toSnapshot() ?? null;
  }

  async start(subjectId: string, mode = 'plain'): Promise<ActiveSessionSnapshot> {
    if (this.current !== null) return this.current.toSnapshot();

    const session = ActiveSession.start({
      id: newId(),
      subjectId,
      startedAt: this.now(),
      mode,
    });

    // CLAIM THE SLOT SYNCHRONOUSLY, before any await. Assigning after the
    // insert — as the Flutter original did — leaves the guard above reading
    // `null` for the whole duration of the write, so a double-tapped Start
    // inserts TWO open sessions. That was carried on the backlog as
    // "self-heals via recovery", but it does not self-heal: recovery closes the
    // orphan as `crashed`, which then appears in history as a real session the
    // user never ran.
    this.current = session;
    try {
      await this.repos.sessions.insertStarted(session);
    } catch (error) {
      // Do not wedge the controller on a session that was never persisted.
      if (this.current === session) this.current = null;
      throw error;
    }
    return session.toSnapshot();
  }

  async togglePause(): Promise<ActiveSessionSnapshot | null> {
    const s = this.current;
    if (s === null) return null;
    const now = this.now();
    const next = s.isPaused ? s.resume(now) : s.pause(now);

    // Persisted on pause AND resume. On pause the accumulated value is
    // unchanged, but `updated_at` advances — which is what makes crash
    // recovery's last-write bound exact for a session that dies while paused.
    await this.repos.sessions.updatePausedDuration(next.id, next.accumulatedPauseMs);

    // A racing end() may have closed this session while we awaited. Its guarded
    // write already no-oped in the database; do not resurrect it here.
    if (this.current !== s) return this.snapshot();
    this.current = next;

    if (s.isPaused) {
      // This transition CLOSED a pause, so the event is complete: log it once,
      // with the pause's own timestamps. An interruption row is append-only and
      // is never written until its duration is known.
      const pauseStartedAt = s.pauseStartedAt;
      if (pauseStartedAt !== null) {
        await this.repos.interruptions.logPause({
          sessionId: s.id,
          pauseStartedAt,
          resumedAt: now,
        });
      }
    }
    return next.toSnapshot();
  }

  async end(): Promise<void> {
    const s = this.current;
    if (s === null) return;
    const now = this.now();

    // CLEARED BEFORE THE FIRST AWAIT, not between the two.
    //
    // The earlier shape cleared only after `sessions.end()` resolved, which
    // left a window where the controller still held a live session while its
    // ending was already in flight. `start()` and `logSelfReport()` have no
    // post-await recheck, so an independent review traced two orderings through
    // that window: end+start returned the ENDED session's snapshot to the
    // renderer, which then showed a ticking clock for a session the controller
    // no longer held; and end+logSelfReport appended an interruption to a
    // session whose `ended_at` was already written — `logSessionEvent` is the
    // one session-scoped write with no `ended_at IS NULL` guard.
    //
    // Ending is terminal, so there is nothing to restore on failure: anything
    // arriving from here on must see no session, which is the truth.
    this.current = null;

    await this.repos.sessions.end({
      id: s.id,
      endedAt: now,
      actualDurationMs: s.elapsedMs(now),
      totalPausedMs: s.totalPausedMs(now),
    });

    // A racing resume cannot have logged this pause: its own post-await recheck
    // sees `current` no longer identical to its snapshot and returns without
    // writing. So exactly one of the two logs it, and it is this one.
    const pauseStartedAt = s.pauseStartedAt;
    if (s.isPaused && pauseStartedAt !== null) {
      await this.repos.interruptions.logPause({
        sessionId: s.id,
        pauseStartedAt,
        resumedAt: now,
      });
    }
  }

  async logSelfReport(): Promise<void> {
    const s = this.current;
    if (s === null) return;
    await this.repos.interruptions.logSelfReport({ sessionId: s.id, occurredAt: this.now() });
  }
}
