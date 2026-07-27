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
    await this.repos.sessions.end({
      id: s.id,
      endedAt: now,
      actualDurationMs: s.elapsedMs(now),
      totalPausedMs: s.totalPausedMs(now),
    });

    // Whether an open pause still needs logging is decided from LIVE state,
    // never from the snapshot captured before the await: a resume that won the
    // race has already logged this pause while `s.isPaused` still reads true,
    // which would append a duplicate row for one pause.
    const live = this.current;
    if (live === null || live.id !== s.id) return;

    // CLEARED BEFORE THE AWAIT BELOW. While this method is suspended inside the
    // insert, any other handler reaching its own post-await continuation would
    // still see a paused session and log the same pause again — End-then-Resume,
    // or a second End. Clearing first also means a throwing insert cannot leave
    // the controller wedged on an already-ended session.
    this.current = null;

    const pauseStartedAt = live.pauseStartedAt;
    if (live.isPaused && pauseStartedAt !== null) {
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
