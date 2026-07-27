import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { nodeSqliteDriver, type SqliteDriver } from './driver.js';

export interface Database extends SqliteDriver {
  /**
   * Runs `fn` inside a SAVEPOINT, committing on return and rolling back on
   * throw. Savepoints rather than BEGIN because SQLite cannot nest BEGIN: a
   * caller wrapping two repository calls would otherwise deadlock the ones
   * that already transact internally. At the top level a savepoint opens an
   * implicit transaction, so the atomicity is the same.
   *
   * `fn` MUST be synchronous. An async callback is refused at runtime, because
   * it would silently destroy the atomicity this method exists to provide: the
   * callback returns a pending promise, `RELEASE` runs immediately, and a later
   * throw becomes a rejection the synchronous `catch` never sees — so no
   * rollback ever happens and half-written state is committed. The concurrent
   * case is worse still, since two overlapping async transactions would both
   * allocate the same savepoint name.
   *
   * This matters because the Dart original is `_db.transaction(() async {…})`,
   * so the natural port of any future caller is exactly the broken shape.
   */
  transaction<T>(fn: () => T extends PromiseLike<unknown> ? never : T): T;
}

/**
 * The frozen schema, read from the committed .sql file rather than duplicated
 * into a string constant — there is exactly one source of truth (V3 spec §4.1),
 * and it was transcribed byte-faithfully from the live database.
 *
 * V3-B owns getting this into an Electron bundle; `openDatabase({ schemaSql })`
 * is the seam for supplying it another way.
 */
export function readSchemaSql(): string {
  return readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
}

export function openDatabase(opts: { file?: string; schemaSql?: string } = {}): Database {
  const driver = nodeSqliteDriver(opts.file ?? ':memory:');
  driver.exec(opts.schemaSql ?? readSchemaSql());

  let depth = 0;
  return {
    ...driver,
    transaction<T>(fn: () => T extends PromiseLike<unknown> ? never : T): T {
      const name = `sp_${String(depth)}`;
      depth += 1;
      driver.exec(`SAVEPOINT ${name}`);
      try {
        const result = fn() as T;
        // Enforced at RUNTIME, not only in the type: the V3-B IPC boundary
        // erases types, and a `Promise` reaching here means the work is still
        // in flight while we are about to RELEASE. Roll back rather than
        // commit a transaction whose body has not finished.
        if (typeof (result as { then?: unknown } | null)?.then === 'function') {
          // Neutralise the orphan before throwing. We are abandoning a promise
          // that is still running, and when it settles nothing will be
          // listening — an unhandled rejection takes the whole process down in
          // Node, turning a clear misuse error into a crash somewhere else
          // entirely. The callback's own failure is a consequence of the misuse
          // we are about to report, so swallowing it loses nothing.
          void (result as PromiseLike<unknown>).then(
            () => undefined,
            () => undefined,
          );
          throw new TypeError(
            'transaction(fn) requires a SYNCHRONOUS callback: an async one returns ' +
              'before its work is done, so RELEASE would commit half-written state ' +
              'and a later throw could never roll it back.',
          );
        }
        driver.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        // ROLLBACK TO leaves the savepoint on the stack; RELEASE pops it.
        // Without the second statement a caught inner failure would leave the
        // outer transaction holding a stale savepoint name.
        driver.exec(`ROLLBACK TO ${name}`);
        driver.exec(`RELEASE ${name}`);
        throw error;
      } finally {
        depth -= 1;
      }
    },
  };
}
