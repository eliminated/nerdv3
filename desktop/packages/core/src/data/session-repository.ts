import type { Database } from '../db/connection.js';
import type { ActiveSession } from '../domain/active-session.js';
import { localUserId } from '../ids.js';
import { fromEpochSeconds, msToSeconds, toEpochSeconds } from '../time.js';
import type { HistoryEntry, SessionDetailView, SessionRepository } from './ports.js';

interface RawSurvey {
  focus_rating: number;
  comprehension_rating: number | null;
  difficulty_rating: number | null;
  note: string | null;
}

interface RawInterruption {
  kind: string;
  occurred_at: number;
  duration_s: number | null;
}

interface RawHistory {
  id: string;
  subject_name: string;
  started_at: number;
  actual_duration_s: number | null;
  end_reason: string | null;
}

interface RawOpenSession {
  id: string;
  started_at: number;
  updated_at: number;
  paused_duration_s: number;
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async insertStarted(s: ActiveSession): Promise<void> {
    const ts = toEpochSeconds(this.now());
    this.db
      .prepare(
        `INSERT INTO sessions
           (id, user_id, subject_id, mode, started_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(s.id, localUserId, s.subjectId, s.mode, toEpochSeconds(s.startedAt), ts, ts);
    return;
  }

  /**
   * Written on pause AND resume: every state change is persisted
   * (architecture.md §3.4). On pause the accumulated value is unchanged, but
   * `updated_at` advances — and that watermark is what makes crash recovery's
   * last-write bound exact for a session that dies while paused.
   *
   * `AND ended_at IS NULL` is the guard: an ended session is immutable at the
   * DATA layer, not merely by caller discipline (V3 spec §4.3).
   */
  async updatePausedDuration(id: string, totalPausedMs: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE sessions
            SET paused_duration_s = ?, updated_at = ?
          WHERE id = ? AND ended_at IS NULL`,
      )
      .run(msToSeconds(totalPausedMs), toEpochSeconds(this.now()), id);
    return;
  }

  /** The one-shot closing write, guarded the same way. */
  async end(a: {
    id: string;
    endedAt: Date;
    actualDurationMs: number;
    totalPausedMs: number;
  }): Promise<void> {
    this.db
      .prepare(
        `UPDATE sessions
            SET ended_at = ?, actual_duration_s = ?, paused_duration_s = ?,
                end_reason = 'user_ended', updated_at = ?
          WHERE id = ? AND ended_at IS NULL`,
      )
      .run(
        toEpochSeconds(a.endedAt),
        msToSeconds(a.actualDurationMs),
        msToSeconds(a.totalPausedMs),
        toEpochSeconds(this.now()),
        a.id,
      );
    return;
  }

  /**
   * Closes out sessions left open by a crash (architecture.md §3.4).
   *
   * `ended_at` is the row's last persisted write — an honest lower bound, not a
   * guess — and `end_reason = 'crashed'` is the key streak inputs exclude on,
   * because a crashed session's duration cannot be trusted to weight a
   * qualified day (data-model.md §5.1).
   *
   * LAUNCH-TIME ONLY. "Unterminated" is the only signal schema v1 carries, so a
   * *running* session is indistinguishable from a crashed one and would be
   * closed too. Call this once, before any session can start — never on a timer.
   */
  async recoverCrashedSessions(): Promise<number> {
    const count = this.db.transaction(() => {
      const open = this.db
        .prepare(
          `SELECT id, started_at, updated_at, paused_duration_s
             FROM sessions
            WHERE ended_at IS NULL`,
        )
        .all<RawOpenSession>();
      const nowS = toEpochSeconds(this.now());
      for (const r of open) {
        const activeS = r.updated_at - r.started_at - r.paused_duration_s;
        // The ended_at guard is redundant inside this transaction; it keeps the
        // write safe if this loop is ever run outside one.
        this.db
          .prepare(
            `UPDATE sessions
                SET ended_at = ?, actual_duration_s = ?, end_reason = 'crashed', updated_at = ?
              WHERE id = ? AND ended_at IS NULL`,
          )
          .run(r.updated_at, Math.max(0, activeS), nowS, r.id);
      }
      return open.length;
    });
    return count;
  }

  /**
   * Note the join does NOT filter subjects on `deleted_at`: a soft-deleted or
   * archived subject must still name its sessions, which is the entire reason
   * subject deletion is soft.
   */
  async listHistory(): Promise<HistoryEntry[]> {
    const rows = this.db
      .prepare(
        `SELECT s.id, sub.name AS subject_name, s.started_at,
                s.actual_duration_s, s.end_reason
           FROM sessions s
           JOIN subjects sub ON sub.id = s.subject_id
          WHERE s.deleted_at IS NULL AND s.ended_at IS NOT NULL
          ORDER BY s.started_at DESC, s.id DESC`,
      )
      .all<RawHistory>();
    return rows.map((r) => ({
      sessionId: r.id,
      subjectName: r.subject_name,
      startedAt: fromEpochSeconds(r.started_at),
      actualDurationS: r.actual_duration_s ?? 0,
      endReason: r.end_reason,
    }));
  }

  /**
   * The survey (if the session was rated) plus its event log.
   *
   * This is the ONE legal reader of the event log outside its own repository,
   * and `test/db/write-confinement.test.ts` names this file explicitly — a
   * second reader has to be added there deliberately, in front of a reviewer.
   */
  async loadSessionDetail(sessionId: string): Promise<SessionDetailView> {
    const survey = this.db
      .prepare(
        `SELECT focus_rating, comprehension_rating, difficulty_rating, note
           FROM session_surveys
          WHERE session_id = ? AND deleted_at IS NULL`,
      )
      .get<RawSurvey>(sessionId);

    // Ordered by id as well as time: occurred_at is epoch SECONDS, so two
    // events in the same second would otherwise sort arbitrarily between runs.
    // newId() is UUIDv7, which is lexicographically time-ordered.
    const rows = this.db
      .prepare(
        `SELECT kind, occurred_at, duration_s
           FROM interruptions
          WHERE session_id = ? AND deleted_at IS NULL
          ORDER BY occurred_at ASC, id ASC`,
      )
      .all<RawInterruption>(sessionId);

    return {
      interruptions: rows.map((r) => ({
        kind: r.kind,
        occurredAt: fromEpochSeconds(r.occurred_at),
        durationS: r.duration_s,
      })),
      focusRating: survey?.focus_rating ?? null,
      comprehensionRating: survey?.comprehension_rating ?? null,
      difficultyRating: survey?.difficulty_rating ?? null,
      note: survey?.note ?? null,
      hasSurvey: survey !== undefined,
    };
  }
}
