import { openDatabase, type Database } from '../../src/db/connection.js';

/** A fresh in-memory database with the frozen schema v1 applied. */
export function freshDb(): Database {
  return openDatabase();
}

/**
 * A clock the test drives by hand. Every repository takes one (plan P31A,
 * decision P5) so `updated_at` — the liveness watermark crash recovery bounds a
 * session by — is assertable instead of being whatever `new Date()` returned.
 */
export function fixedClock(start: Date): { now: () => Date; set: (d: Date) => void } {
  let current = start;
  return {
    now: () => current,
    set: (d: Date) => {
      current = d;
    },
  };
}
