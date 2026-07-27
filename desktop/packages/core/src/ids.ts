import { v7 as uuidv7 } from 'uuid';

/**
 * Fixed UUIDv7 for the single local user row (masterplan locked decision 4).
 * Constant so a future server sync can rely on it; never regenerate.
 */
export const localUserId = '01920000-0000-7000-8000-000000000001';

/**
 * UUIDv7 — lexicographically time-ordered. That ordering is load-bearing:
 * `occurred_at` is stored with only second precision, so queries break ties on
 * `id` to stay deterministic between runs.
 */
export function newId(): string {
  return uuidv7();
}
