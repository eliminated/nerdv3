/**
 * The repository INTERFACES `core` exposes (V3 spec §5).
 *
 * `nerdyapp.exe` binds these to the SQLite implementations in this directory.
 * `nerdyapp-test.exe` binds them to an in-memory fixture set and opens no
 * database at all, so the whole UX can be walked and debugged without touching
 * real study history. Same `ui` package either way — the renderer never learns
 * which one it is talking to.
 *
 * Two conventions hold throughout:
 *
 *  * **Nullable columns are typed `| null`, never optional properties.** SQL has
 *    NULL, not "absent"; `note?: string` and `note: string | null` are different
 *    contracts and only the second one is true of the database.
 *  * **Methods return Promises even though the SQLite binding is synchronous**
 *    (plan P31A, decision P4). The fixture binding and the V3-B IPC boundary are
 *    not synchronous, and an async interface accommodates all three.
 */

export interface SubjectRow {
  id: string;
  name: string;
  color: string | null;
  source: string;
  sourceName: string | null;
  archived: boolean;
  createdAt: Date;
}

export interface SubjectRepository {
  create(a: {
    name: string;
    color?: string | null;
    source?: string;
    sourceName?: string | null;
  }): Promise<string>;

  /** Writes every editable field; `null` clears colour / source name. */
  update(
    id: string,
    a: { name: string; color: string | null; source: string; sourceName: string | null },
  ): Promise<void>;

  setArchived(id: string, archived: boolean): Promise<void>;

  /** Soft delete (data-model.md §2) — history joins keep the name. */
  remove(id: string): Promise<void>;

  list(opts?: { archived?: boolean }): Promise<SubjectRow[]>;
}
