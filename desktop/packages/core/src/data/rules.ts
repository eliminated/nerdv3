import { ValidationError } from '../errors.js';

/**
 * The invariants that hold no matter WHERE the data is stored.
 *
 * Both bindings share this file rather than each carrying a copy. That is not
 * tidiness — it is the whole reason the two-executable design is safe:
 * `nerdyapp.exe` binds SQLite and `nerdyapp-test.exe` binds in-memory fixtures
 * (V3 spec §5), and a second copy of the privacy vocabulary is precisely the
 * thing that would drift. The 2026-07-27 review found a live bypass in exactly
 * this vocabulary; there must only ever be one of it.
 *
 * Storage logic stays in the individual repositories. Only rules live here.
 */

/**
 * Wire values for the kind column of the interruption log. That column has no
 * CHECK in schema v1, so these strings ARE the contract — renaming one silently
 * orphans history.
 *
 * (Written without backticks around the table name on purpose: the
 * write-confinement guard scans raw source, so a markdown-quoted table name in
 * a comment reads to it as a template literal. That guard fires on false
 * positives by design — a reworded comment is a cheap price for never
 * under-firing on a real leak.)
 */
export const KIND_MANUAL_PAUSE = 'manual_pause';
export const KIND_SELF_REPORTED = 'self_reported';

/**
 * The CLOSED vocabulary of focus-enforcement.md §7 — a set, not a shape check,
 * because a shape check is not a privacy control. `/^[a-z_]+$/` accepts
 * `app_switch_chrome`, `discord`, `whatsapp`: nearly every application name
 * slugs into it. The realistic accident is not malice, it is Phase 3's window
 * watcher writing `` kind: `app_switch_${slug(appName)}` `` with every
 * identity-shaped guard staying green.
 *
 * Adding a kind is a deliberate edit to this list, in front of a reviewer.
 */
export const KINDS: ReadonlySet<string> = new Set([
  KIND_MANUAL_PAUSE,
  KIND_SELF_REPORTED,
  'app_switch',
  'exit_attempt',
  'notification',
  'idle_timeout',
  'device_locked',
]);

/**
 * A belt alongside the closed set: it states the SHAPE the vocabulary must
 * keep, so a future entry cannot smuggle punctuation or capitals in.
 */
const BARE_TOKEN = /^[a-z_]+$/;

/** Longest interruption worth recording. An integer is 63 bits of anything. */
const MAX_DURATION_S = 86_400;

export function assertKind(kind: string): void {
  if (!BARE_TOKEN.test(kind) || !KINDS.has(kind)) {
    throw new ValidationError(
      `kind "${kind}" is not one of the documented kinds — the log records the ` +
        `kind, never the identity. Adding one is a deliberate edit to KINDS.`,
    );
  }
}

export function assertDurationS(durationS: number | null | undefined): void {
  if (durationS === undefined || durationS === null) return;
  if (!Number.isInteger(durationS) || durationS < 0 || durationS > MAX_DURATION_S) {
    throw new ValidationError(
      `durationS must be a whole number of seconds in 0..${String(MAX_DURATION_S)}, ` +
        `got ${String(durationS)}`,
    );
  }
}

/**
 * Both normal endings. Only `'crashed'` is refused: a crashed session's
 * duration is a lower-bound estimate, so letting one carry a rating would drag
 * a legitimately good day below Phase 5's 3.0 threshold (data-model.md §5.1).
 */
export const SURVEYABLE_END_REASONS: ReadonlySet<string> = new Set(['completed', 'user_ended']);

/**
 * `Number.isInteger` is the load-bearing half: SQLite has no strict typing
 * without STRICT tables, so it would happily store 2.5 in an INTEGER column
 * with `BETWEEN 1 AND 5` passing.
 */
export function assertRating(name: string, value: number | null): void {
  if (value === null) return;
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new ValidationError(`${name} must be an integer 1..5, got ${String(value)}`);
  }
}

/** `focusRating` is mandatory, so it is checked before the nullable path. */
export function assertFocusRating(value: number | null | undefined): void {
  if (value === null || value === undefined) {
    throw new ValidationError('focusRating is required and must be an integer 1..5');
  }
  assertRating('focusRating', value);
}

/**
 * A pause span in whole seconds, clamped. The wall clock is not monotonic: an
 * NTP correction mid-pause would otherwise store a negative duration.
 */
export function pauseSpanSeconds(pauseStartedAt: Date, resumedAt: Date): number {
  return Math.max(0, Math.trunc((resumedAt.getTime() - pauseStartedAt.getTime()) / 1000));
}
