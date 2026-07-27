import type { Database } from '../db/connection.js';
import type { ActiveSession } from '../domain/active-session.js';
import { localUserId } from '../ids.js';
import { fromEpochSeconds, msToSeconds, toEpochSeconds } from '../time.js';
import type { HistoryEntry, SessionRepository } from './ports.js';

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

  insertStarted(s: ActiveSession): Promise<void> {
    const ts = toEpochSeconds(this.now());
    this.db
      .prepare(
        `INSERT INTO sessions
           (id, user_id, subject_id, mode, started_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(s.id, localUserId, s.subjectId, s.mode, toEpochSeconds(s.startedAt), ts, ts);
    return Promise.resolve();
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
  updatePausedDuration(id: string, totalPausedMs: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE sessions
            SET paused_duration_s = ?, updated_at = ?
          WHERE id = ? AND ended_at IS NULL`,
      )
      .run(msToSeconds(totalPausedMs), toEpochSeconds(this.now()), id);
    return Promise.resolve();
  }

  /** The one-shot closing write, guarded the same way. */
  end(a: {
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
    return Promise.resolve();
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
  recoverCrashedSessions(): Promise<number> {
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
    return Promise.resolve(count);
  }

  /**
   * Note the join does NOT filter subjects on `deleted_at`: a soft-deleted or
   * archived subject must still name its sessions, which is the entire reason
   * subject deletion is soft.
   */
  listHistory(): Promise<HistoryEntry[]> {
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
    return Promise.resolve(
      rows.map((r) => ({
        sessionId: r.id,
        subjectName: r.subject_name,
        startedAt: fromEpochSeconds(r.started_at),
        actualDurationS: r.actual_duration_s ?? 0,
        endReason: r.end_reason,
      })),
    );
  }
}
