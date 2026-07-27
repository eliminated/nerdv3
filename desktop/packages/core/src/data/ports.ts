/**
 * The repository INTERFACES `core` exposes (V3 spec §5).
 *
 * `nerdyapp.exe` binds these to the SQLite implementations in this directory.
 * `nerdyapp-test.exe` binds them to an in-memory fixture set and opens no
 * database at all, so the whole UX can be walked and debugged without touching
 * real study history. Same `ui` package either way — the renderer never learns
 * which one it is talking to.
 *
 * Two conventions hold throughout:
 *
 *  * **Nullable columns are typed `| null`, never optional properties.** SQL has
 *    NULL, not "absent"; `note?: string` and `note: string | null` are different
 *    contracts and only the second one is true of the database.
 *  * **Methods return Promises even though the SQLite binding is synchronous**
 *    (plan P31A, decision P4). The fixture binding and the V3-B IPC boundary are
 *    not synchronous, and an async interface accommodates all three.
 */

import type { ActiveSession } from '../domain/active-session.js';

export interface SubjectRow {
  id: string;
  name: string;
  color: string | null;
  source: string;
  sourceName: string | null;
  archived: boolean;
  createdAt: Date;
}

export interface SubjectRepository {
  create(a: {
    name: string;
    color?: string | null;
    source?: string;
    sourceName?: string | null;
  }): Promise<string>;

  /** Writes every editable field; `null` clears colour / source name. */
  update(
    id: string,
    a: { name: string; color: string | null; source: string; sourceName: string | null },
  ): Promise<void>;

  setArchived(id: string, archived: boolean): Promise<void>;

  /** Soft delete (data-model.md §2) — history joins keep the name. */
  remove(id: string): Promise<void>;

  list(opts?: { archived?: boolean }): Promise<SubjectRow[]>;
}

export interface HistoryEntry {
  sessionId: string;
  subjectName: string;
  startedAt: Date;
  actualDurationS: number;
  /** 'user_ended' | 'completed' | 'crashed' — null only for a row still open. */
  endReason: string | null;
}

export interface SessionRepository {
  insertStarted(s: ActiveSession): Promise<void>;

  /**
   * Persists the accumulated pause and advances the `updated_at` watermark.
   * Refused for an ended session at the data layer (V3 spec §4.3).
   */
  updatePausedDuration(id: string, totalPausedMs: number): Promise<void>;

  /** The one-shot closing write. Refused for an ended session. */
  end(a: {
    id: string;
    endedAt: Date;
    actualDurationMs: number;
    totalPausedMs: number;
  }): Promise<void>;

  /**
   * Closes sessions left unterminated by a crash, at their last persisted
   * write, clamped at zero, with `end_reason = 'crashed'`. Returns how many
   * were recovered. Launch-time only — see the repository's own note.
   */
  recoverCrashedSessions(): Promise<number>;

  listHistory(): Promise<HistoryEntry[]>;

  /** Everything the Stats inline expansion shows for one session. */
  loadSessionDetail(sessionId: string): Promise<SessionDetailView>;
}

export interface SessionDetailView {
  interruptions: InterruptionEntry[];
  focusRating: number | null;
  comprehensionRating: number | null;
  difficultyRating: number | null;
  note: string | null;
  hasSurvey: boolean;
}

/** Read projection for the Stats inline expansion. */
export interface InterruptionEntry {
  kind: string;
  occurredAt: Date;
  durationS: number | null;
}

/**
 * The single writer of the event log. Note what is NOT here: no parameter can
 * carry an application name, a window title, or any other identifier. App
 * identity is unrepresentable by construction (V3 spec §4.6), and `kind` is
 * validated as a bare token by the implementation.
 */
export interface InterruptionRepository {
  logSessionEvent(a: {
    sessionId: string;
    kind: string;
    occurredAt: Date;
    durationS?: number | null;
    blocked?: boolean;
  }): Promise<void>;

  /** One append-only row per completed pause. Never insert-then-update. */
  logPause(a: { sessionId: string; pauseStartedAt: Date; resumedAt: Date }): Promise<void>;

  logSelfReport(a: { sessionId: string; occurredAt: Date }): Promise<void>;

  countSelfReports(sessionId: string): Promise<number>;
}

export interface SurveyRepository {
  /**
   * Insert-only. `focusRating` is mandatory 1–5; the optional ratings are 1–5
   * or null. Refused for any session that did not end normally.
   */
  save(a: {
    sessionId: string;
    focusRating: number;
    comprehensionRating?: number | null;
    difficultyRating?: number | null;
    note?: string | null;
  }): Promise<void>;
}
