/**
 * The database stores every instant as INTEGER epoch SECONDS (schema.sql).
 * These are the only places that boundary is crossed, and all of them truncate
 * toward zero — matching Dart's `Duration.inSeconds`, which the shipped rows
 * were written with.
 *
 * Sub-second precision does not exist in storage. Compare instants at second
 * granularity; never assert on a millisecond component of a round-tripped value.
 */

export function toEpochSeconds(d: Date): number {
  return Math.trunc(d.getTime() / 1000);
}

export function fromEpochSeconds(s: number): Date {
  return new Date(s * 1000);
}

/** Milliseconds → whole seconds, truncating toward zero. */
export function msToSeconds(ms: number): number {
  return Math.trunc(ms / 1000);
}
