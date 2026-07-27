import { localUserId } from '../ids.js';
import type { Database } from './connection.js';

/**
 * Seeds the single local user row (masterplan locked decision 4).
 *
 * INSERT OR IGNORE on the primary key makes this atomic and idempotent — no
 * read-then-insert race, which was V2 post-mortem defect 4.
 *
 * `email` and `password_hash` are NOT NULL in data-model.md, so the local user
 * carries sentinels rather than the columns being relaxed: the schema freeze
 * would have made that relaxation permanent (masterplan §10).
 */
export function ensureLocalUser(db: Database): void {
  db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(
    localUserId,
    'local@device.invalid',
    '',
  );
}
