import type { Database } from '../db/connection.js';
import { newId } from '../ids.js';
import { withTranslatedErrors } from '../db/sqlite-errors.js';
import { toEpochSeconds } from '../time.js';
import type { InterruptionRepository } from './ports.js';
import {
  assertDurationS,
  assertKind,
  KIND_MANUAL_PAUSE,
  KIND_SELF_REPORTED,
  pauseSpanSeconds,
} from './rules.js';

// The kind vocabulary and the duration bound live in ./rules.js so the fixture
// binding enforces the SAME copy. Two copies of a privacy vocabulary is exactly
// how one of them ends up accepting `app_switch_chrome`.
export { KIND_MANUAL_PAUSE, KIND_SELF_REPORTED } from './rules.js';

/**
 * The ONLY writer of the event log — enforced by
 * `test/db/write-confinement.test.ts`.
 *
 * PRIVACY (data-model.md §3.6, focus-enforcement.md §7): log the *kind*, never
 * the *identity*. Record that an app switch happened, not which app was opened.
 * Recording which apps a student opens is surveillance.
 *
 * No method here accepts free-form context, so app identity is not
 * REPRESENTABLE through this API — the guarantee is structural, not a matter of
 * callers behaving. Phase 3's first legitimate such write has to widen a
 * signature in this file deliberately, in front of a reviewer, and the
 * confinement test names this file so that edit cannot be quiet.
 *
 * (This file deliberately never spells the free-text column's name — the
 * confinement test asserts that, so the word appearing here at all would mean
 * someone had started to make identity representable.)
 */
export class SqliteInterruptionRepository implements InterruptionRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * The single write path. `blocked` is explicit rather than left to the column
   * default, so production code — not the schema — decides it.
   */
  async logSessionEvent(a: {
    sessionId: string;
    kind: string;
    occurredAt: Date;
    durationS?: number | null;
    blocked?: boolean;
  }): Promise<void> {
    // Without these, the discriminator itself could smuggle identity
    // ('app_switch:chrome.exe', or the subtler 'app_switch_chrome') — the one
    // free-text field left on this path — and the numeric field is 63 bits of
    // anything. Thrown errors rather than assertions: assertions get stripped.
    assertKind(a.kind);
    assertDurationS(a.durationS);
    const ts = toEpochSeconds(this.now());
    // Translated so an unknown session id fails as the SAME typed error the
    // fixture binding throws. `kind` crosses IPC into the renderer, and a
    // branch written while debugging on the test build must behave identically
    // against the product.
    withTranslatedErrors(() =>
      this.db
        .prepare(
          `INSERT INTO interruptions
           (id, session_id, kind, occurred_at, duration_s, blocked, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          newId(),
          a.sessionId,
          a.kind,
          toEpochSeconds(a.occurredAt),
          a.durationS ?? null,
          a.blocked === true ? 1 : 0,
          ts,
          ts,
        ),
    );
    return;
  }

  /**
   * One append-only row per COMPLETED pause: `occurred_at` is when the pause
   * began, `duration_s` how long it lasted.
   *
   * Never insert-then-update. A row is not written until its duration is known,
   * because an append-only log is what the union-dedup sync strategy relies on
   * (V3 spec §4.4). The span is clamped because the wall clock is not
   * monotonic — an NTP correction mid-pause would otherwise store a negative.
   */
  async logPause(a: { sessionId: string; pauseStartedAt: Date; resumedAt: Date }): Promise<void> {
    return this.logSessionEvent({
      sessionId: a.sessionId,
      kind: KIND_MANUAL_PAUSE,
      occurredAt: a.pauseStartedAt,
      durationS: pauseSpanSeconds(a.pauseStartedAt, a.resumedAt),
    });
  }

  /**
   * The one-tap distraction button (masterplan §7 Phase 2, risk R3 — a
   * Windows-only app cannot suppress the phone). Records only THAT the user was
   * distracted, never by what.
   */
  async logSelfReport(a: { sessionId: string; occurredAt: Date }): Promise<void> {
    return this.logSessionEvent({
      sessionId: a.sessionId,
      kind: KIND_SELF_REPORTED,
      occurredAt: a.occurredAt,
    });
  }

  /** Live count for in-session feedback. */
  async countSelfReports(sessionId: string): Promise<number> {
    const r = this.db
      .prepare(
        `SELECT count(*) AS c
           FROM interruptions
          WHERE session_id = ? AND kind = ? AND deleted_at IS NULL`,
      )
      .get<{ c: number }>(sessionId, KIND_SELF_REPORTED);
    return r?.c ?? 0;
  }
}
