import type { Database } from '../db/connection.js';
import { DomainStateError, ValidationError } from '../errors.js';
import { newId } from '../ids.js';
import { toEpochSeconds } from '../time.js';
import type { SurveyRepository } from './ports.js';

/**
 * Both normal endings. Only `'crashed'` is refused: a crashed session's
 * duration is a lower-bound estimate, so letting one carry a rating would drag
 * a legitimately good day below Phase 5's 3.0 qualification threshold
 * (data-model.md §5.1).
 */
const SURVEYABLE_END_REASONS = new Set(['completed', 'user_ended']);

/**
 * Writes the post-session survey — the app's core signal (data-model.md §3.5)
 * and the input strict streaks depend on.
 *
 * INSERT-ONLY, and two one-way doors under the frozen schema are why there is
 * no upsert and no soft delete:
 *
 *  * `session_id` is UNIQUE at column level, so SQLite's implicit unique index
 *    counts tombstones: a soft-deleted survey would permanently block re-rating
 *    that session, and the freeze forbids dropping the constraint. Surveys must
 *    therefore never be soft-deleted.
 *  * Any future backfill (deferred decision D5) must pass an explicit
 *    `ON CONFLICT (session_id)` target, decided deliberately rather than
 *    inherited from a default.
 */
export class SqliteSurveyRepository implements SurveyRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async save(a: {
    sessionId: string;
    focusRating: number;
    comprehensionRating?: number | null;
    difficultyRating?: number | null;
    note?: string | null;
  }): Promise<void> {
    // focusRating is MANDATORY, so it is checked before the nullable path:
    // checkRange returns early on null, and the V3-B IPC boundary erases the
    // `number` type — a missing field deserialises to null, which would
    // otherwise sail through to a raw NOT NULL constraint error instead of the
    // typed ValidationError this class promises.
    if (a.focusRating === null || a.focusRating === undefined) {
      throw new ValidationError('focusRating is required and must be an integer 1..5');
    }
    checkRange('focusRating', a.focusRating);
    checkRange('comprehensionRating', a.comprehensionRating ?? null);
    checkRange('difficultyRating', a.difficultyRating ?? null);
    const trimmed = a.note?.trim() ?? '';

    this.db.transaction(() => {
      // Read INSIDE the transaction so this cannot race recoverCrashedSessions:
      // a session that is normally ended when checked must still be normally
      // ended when written.
      const session = this.db
        .prepare(`SELECT deleted_at, ended_at, end_reason FROM sessions WHERE id = ?`)
        .get<{
          deleted_at: number | null;
          ended_at: number | null;
          end_reason: string | null;
        }>(a.sessionId);

      if (
        session === undefined ||
        session.deleted_at !== null ||
        session.ended_at === null ||
        session.end_reason === null ||
        !SURVEYABLE_END_REASONS.has(session.end_reason)
      ) {
        // Distinguish the three refusals: `end_reason` is null for a session
        // that is merely still running, so `?? 'no such session'` would report
        // a live session as unknown and send a debugger down the wrong path.
        const why =
          session === undefined
            ? 'no such session'
            : session.deleted_at !== null
              ? 'session is deleted'
              : session.ended_at === null
                ? 'session has not ended yet'
                : `end_reason: ${session.end_reason ?? 'null'}`;
        throw new DomainStateError(
          `only a normally-ended session can be surveyed (${why}). A crashed session ` +
            `cannot be trusted and must never weight a qualified day (data-model.md §5.1).`,
        );
      }

      const ts = toEpochSeconds(this.now());
      this.db
        .prepare(
          `INSERT INTO session_surveys
             (id, session_id, focus_rating, comprehension_rating, difficulty_rating,
              note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          newId(),
          a.sessionId,
          a.focusRating,
          a.comprehensionRating ?? null,
          a.difficultyRating ?? null,
          trimmed === '' ? null : trimmed,
          ts,
          ts,
        );
    });
  }
}

/**
 * Validated here rather than left to the CHECK constraints, so a bad rating
 * fails as a typed ValidationError at the boundary instead of as a raw SQLite
 * error whose shape differs between bindings.
 *
 * `Number.isInteger` is the load-bearing half: SQLite would happily store 2.5
 * in an INTEGER column (it has no strict typing without STRICT tables), and the
 * BETWEEN 1 AND 5 check would pass it.
 */
function checkRange(name: string, value: number | null): void {
  if (value === null) return;
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new ValidationError(`${name} must be an integer 1..5, got ${String(value)}`);
  }
}
