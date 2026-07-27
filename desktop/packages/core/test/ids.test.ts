import { describe, expect, test } from 'vitest';

import { localUserId, newId } from '../src/ids.js';
import { fromEpochSeconds, msToSeconds, toEpochSeconds } from '../src/time.js';

describe('ids', () => {
  test('localUserId is the frozen UUIDv7 from masterplan decision 4', () => {
    // A constant, not a generated value: a future server sync relies on it and
    // every user_id foreign key in the shipped database already points at it.
    expect(localUserId).toBe('01920000-0000-7000-8000-000000000001');
  });

  test('newId returns distinct v7 UUIDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  test('newId is lexicographically time-ordered', () => {
    // Load-bearing: SessionRepository.loadSessionDetail breaks ties on `id`
    // because occurred_at only has second precision. A v4 UUID here would make
    // two same-second interruptions sort arbitrarily between runs.
    const ids = Array.from({ length: 500 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('time', () => {
  test('an instant round-trips through epoch seconds', () => {
    const d = new Date('2026-07-26T13:45:12.000Z');
    expect(toEpochSeconds(d)).toBe(1785073512);
    expect(fromEpochSeconds(toEpochSeconds(d)).toISOString()).toBe(d.toISOString());
  });

  test('sub-second precision truncates toward zero, never rounds', () => {
    // Storage is INTEGER epoch seconds. Rounding up would let a 30-minute
    // session record 1801 s and fail the one-hour wall-clock exit criterion
    // from the wrong side.
    expect(toEpochSeconds(new Date('2026-07-26T13:45:12.999Z'))).toBe(1785073512);
    expect(msToSeconds(1999)).toBe(1);
    expect(msToSeconds(-1999)).toBe(-1);
    expect(msToSeconds(0)).toBe(0);
    // Pinned on the NEGATIVE side too: floor and trunc agree for every positive
    // epoch, so a floor regression in toEpochSeconds would otherwise be
    // invisible. Dart's ~/ truncates toward zero, which is the behaviour the
    // shipped rows were written with.
    expect(toEpochSeconds(new Date('1969-12-31T23:59:59.500Z'))).toBe(0);
    expect(toEpochSeconds(new Date('1969-12-31T23:59:58.500Z'))).toBe(-1);
  });
});
