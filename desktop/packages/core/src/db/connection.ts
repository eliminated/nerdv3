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
   */
  transaction<T>(fn: () => T): T;
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
    transaction<T>(fn: () => T): T {
      const name = `sp_${String(depth)}`;
      depth += 1;
      driver.exec(`SAVEPOINT ${name}`);
      try {
        const result = fn();
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
