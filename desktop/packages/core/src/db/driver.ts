import { DatabaseSync } from 'node:sqlite';

/**
 * What SQLite will accept as a bound parameter.
 *
 * Note the absence of `boolean`: node:sqlite refuses to bind one ("Provided
 * value cannot be bound to SQLite parameter N", probed 2026-07-27). Schema v1
 * stores booleans as INTEGER 0/1 with CHECK constraints, so callers convert
 * explicitly — and this type makes forgetting a compile error rather than a
 * runtime one.
 */
export type BindValue = string | number | bigint | null | Uint8Array;

export interface SqliteStatement {
  run(...params: BindValue[]): { changes: number };
  get<T>(...params: BindValue[]): T | undefined;
  all<T>(...params: BindValue[]): T[];
}

/**
 * The entire persistence surface `core` depends on.
 *
 * `node:sqlite` is one implementation. Whether *Electron's* bundled Node
 * exposes it is unverified (handoff, 2026-07-27) and `better-sqlite3` is the
 * recorded fallback — both expose exec/prepare/run/get/all with these shapes,
 * so keeping the interface this narrow makes that swap a one-file change
 * instead of a rewrite of four repositories.
 */
export interface SqliteDriver {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

export function nodeSqliteDriver(file: string): SqliteDriver {
  const db = new DatabaseSync(file);
  return {
    exec: (sql) => {
      db.exec(sql);
    },
    prepare: (sql) => db.prepare(sql) as unknown as SqliteStatement,
    close: () => {
      db.close();
    },
  };
}
