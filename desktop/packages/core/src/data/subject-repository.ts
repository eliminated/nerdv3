import type { Database } from '../db/connection.js';
import { localUserId, newId } from '../ids.js';
import { fromEpochSeconds, toEpochSeconds } from '../time.js';
import type { SubjectRepository, SubjectRow } from './ports.js';

interface RawSubject {
  id: string;
  name: string;
  color: string | null;
  source: string;
  source_name: string | null;
  archived: number;
  created_at: number;
}

function toRow(r: RawSubject): SubjectRow {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    source: r.source,
    sourceName: r.source_name,
    // Stored as INTEGER 0/1 with a CHECK; exposed as a boolean so no caller
    // has to know that.
    archived: r.archived === 1,
    createdAt: fromEpochSeconds(r.created_at),
  };
}

const SELECT_COLUMNS = `id, name, color, source, source_name, archived, created_at`;

export class SqliteSubjectRepository implements SubjectRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(a: {
    name: string;
    color?: string | null;
    source?: string;
    sourceName?: string | null;
  }): Promise<string> {
    const id = newId();
    const ts = toEpochSeconds(this.now());
    this.db
      .prepare(
        `INSERT INTO subjects
           (id, user_id, name, color, source, source_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        localUserId,
        a.name,
        a.color ?? null,
        a.source ?? 'self',
        a.sourceName ?? null,
        ts,
        ts,
      );
    return id;
  }

  async update(
    id: string,
    a: { name: string; color: string | null; source: string; sourceName: string | null },
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE subjects
            SET name = ?, color = ?, source = ?, source_name = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(a.name, a.color, a.source, a.sourceName, toEpochSeconds(this.now()), id);
    return;
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    // node:sqlite refuses to bind a JS boolean (probed 2026-07-27), and schema
    // v1 stores this as INTEGER 0/1 anyway.
    this.db
      .prepare(`UPDATE subjects SET archived = ?, updated_at = ? WHERE id = ?`)
      .run(archived ? 1 : 0, toEpochSeconds(this.now()), id);
    return;
  }

  async remove(id: string): Promise<void> {
    const ts = toEpochSeconds(this.now());
    this.db
      .prepare(`UPDATE subjects SET deleted_at = ?, updated_at = ? WHERE id = ?`)
      .run(ts, ts, id);
    return;
  }

  async list(opts: { archived?: boolean } = {}): Promise<SubjectRow[]> {
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
           FROM subjects
          WHERE deleted_at IS NULL AND archived = ?
          ORDER BY created_at DESC, id DESC`,
      )
      .all<RawSubject>(opts.archived === true ? 1 : 0);
    return rows.map(toRow);
  }
}
