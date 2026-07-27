import type { Database } from '../db/connection.js';
import { ValidationError } from '../errors.js';
import { newId } from '../ids.js';
import { toEpochSeconds } from '../time.js';
import type { InterruptionRepository } from './ports.js';

/**
 * Wire values for the `kind` column. It has no CHECK in schema v1, so these
 * strings ARE the contract — renaming one silently orphans history.
 */
export const KIND_MANUAL_PAUSE = 'manual_pause';
export const KIND_SELF_REPORTED = 'self_reported';

/**
 * The CLOSED vocabulary of focus-enforcement.md §7. A closed set, not a shape
 * check, because a shape check is not a privacy control:
 * `/^[a-z_]+$/` accepts `app_switch_chrome`, `discord`, `whatsapp` — nearly
 * every application name slugs into it. The realistic accident is not malice,
 * it is Phase 3's window watcher writing
 * `kind: \`app_switch_${slug(appName)}\`` and every identity-shaped guard
 * staying green.
 *
 * Adding a kind is now a deliberate edit to this list, in front of a reviewer —
 * the same property the single-writer rule buys for the table itself.
 */
const KINDS = new Set([
  'manual_pause',
  'self_reported',
  'app_switch',
  'exit_attempt',
  'notification',
  'idle_timeout',
  'device_locked',
]);

/**
 * Kept as a belt alongside the closed set: it states the SHAPE the vocabulary
 * must keep, so a future entry cannot smuggle punctuation or capitals in.
 */
const BARE_TOKEN = /^[a-z_]+$/;

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
    // Without this, the discriminator itself could smuggle identity
    // ('app_switch:chrome.exe', or the subtler 'app_switch_chrome') — the one
    // free-text column left on this path. A thrown error rather than an
    // assertion: assertions get stripped from release builds.
    if (!BARE_TOKEN.test(a.kind) || !KINDS.has(a.kind)) {
      throw new ValidationError(
        `kind "${a.kind}" is not one of the documented kinds — the log records ` +
          `the kind, never the identity. Adding one is a deliberate edit to KINDS.`,
      );
    }
    // An integer is 63 bits of anything, so the one numeric field a caller
    // controls gets a sanity bound too. This does not make identity
    // unrepresentable — see the note on the class — but it closes the
    // easiest numeric channel.
    if (
      a.durationS !== undefined &&
      a.durationS !== null &&
      (!Number.isInteger(a.durationS) || a.durationS < 0 || a.durationS > 86_400)
    ) {
      throw new ValidationError(
        `durationS must be a whole number of seconds in 0..86400, got ${String(a.durationS)}`,
      );
    }
    const ts = toEpochSeconds(this.now());
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
    const spanS = Math.trunc((a.resumedAt.getTime() - a.pauseStartedAt.getTime()) / 1000);
    return this.logSessionEvent({
      sessionId: a.sessionId,
      kind: KIND_MANUAL_PAUSE,
      occurredAt: a.pauseStartedAt,
      durationS: Math.max(0, spanS),
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
