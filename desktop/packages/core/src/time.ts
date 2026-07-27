/**
 * The database stores every instant as INTEGER epoch SECONDS (schema.sql).
 * These are the only places that boundary is crossed, and all of them truncate
 * toward zero — matching Dart's `Duration.inSeconds`, which the shipped rows
 * were written with.
 *
 * Sub-second precision does not exist in storage. Compare instants at second
 * granularity; never assert on a millisecond component of a round-tripped value.
 */

/**
 * `Math.trunc` yields NEGATIVE zero for any value in (-1000, 0), and `-0` is
 * not `0` under `Object.is` — so it compares unequal in tests and in any
 * strict-equality branch, while printing indistinguishably as "0". Normalised
 * here once rather than left as a trap at every call site.
 */
function truncToZero(x: number): number {
  const n = Math.trunc(x);
  return n === 0 ? 0 : n;
}

export function toEpochSeconds(d: Date): number {
  return truncToZero(d.getTime() / 1000);
}

export function fromEpochSeconds(s: number): Date {
  return new Date(s * 1000);
}

/** Milliseconds → whole seconds, truncating toward zero. */
export function msToSeconds(ms: number): number {
  return truncToZero(ms / 1000);
}
