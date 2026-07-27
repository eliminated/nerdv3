# V3-A — `core` in TypeScript: Implementation Plan

**Plan:** `P31A` · **Build iteration:** V3 · **Release version:** v0.1.0 (pre-alpha)

> **Three numbers, deliberately distinct** (Isaac, 2026-07-27 — extends `CLAUDE.md`'s two):
> **build iteration `V3`** = which attempt at building the app this codebase is, incrementing only
> on a from-scratch restart · **release version `v0.*.*`** = SemVer of shipped software ·
> **plan id `P<iteration><plan><slice>`** = which revision of a plan document is in force, so
> **P31A** reads *plan · V3 · revision 1 · slice A*. A revision made during execution increments
> the middle digit (P32A) and says why. Never conflate the three.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this slice runs
> **hybrid/inline** per the handoff) with a dedicated independent review pass on the timer state
> machine, the repositories, and the privacy guard. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up the `desktop/` npm workspace (TypeScript strict, vitest) and port the
correctness-critical core — the `ActiveSession` timing state machine and the four repositories —
to `desktop/packages/core`, proven by a vitest suite that mirrors `app-flutter/test/`. No UI.

**Architecture:** `core` is pure TypeScript: it imports neither Electron nor Vue (V3 spec §3,
restating architecture.md §3.1). Persistence goes through a two-line `SqliteDriver` interface so
the `node:sqlite` binding can be swapped for `better-sqlite3` without touching a repository.
Repositories are declared as *interfaces* in `src/data/ports.ts` and implemented once against
SQLite — this is the seam V3 spec §5 needs so `nerdyapp-test.exe` can bind in-memory fixtures
later. `schema.sql` stays the single frozen source of the schema and is applied verbatim on open.

**Tech Stack:** Node 25.7.0 · TypeScript 5 (strict, `NodeNext`) · vitest · ESLint +
typescript-eslint (type-checked) · `node:sqlite` (`DatabaseSync`, SQLite 3.51.2) · `uuid` (v7).

---

## Global Constraints

Copied verbatim from the governing documents. Every task's requirements implicitly include these.

- **`core` imports neither Electron nor Vue** (V3 spec §3).
- **Schema v1 is FROZEN and additive-only** (masterplan §5; V3 spec §4.1). `schema.sql` is ground
  truth, transcribed from the live database — no task may edit it.
- **Elapsed time is always computed from stored timestamps, never a tick counter**
  (architecture.md §3.4; V3 spec §4.2).
- **State is persisted on every state change**; crash recovery closes unterminated sessions as
  `end_reason='crashed'` at the last persisted write, **clamped at zero** (V3 spec §4.2).
- **Post-end immutability is enforced at the data layer** — every write carries
  `AND ended_at IS NULL`, not merely avoided by callers (V3 spec §4.3).
- **One append-only `manual_pause` row per completed pause** (V3 spec §4.4). *The ordering rule
  ("state cleared before the write await") lives in the controller and is V3-C's; this slice ships
  the repository half — `logPause` is called once per completed pause and never insert-then-update.*
- **Survey rules**: `focus_rating` mandatory 1–5, insert-only, refused for any session that is not
  normally ended (V3 spec §4.5).
- **The privacy line**: one writer for `interruptions`; no parameter capable of carrying app
  identity; `kind` validated as a bare token (V3 spec §4.6, data-model.md §3.6,
  focus-enforcement.md §7).
- **Timestamps are INTEGER epoch SECONDS.** Sub-second precision does not exist in storage;
  compare instants at second granularity.
- **Every mandated test must name the change that would make it fail.** Guards are *seen red*
  before being trusted (masterplan §1a; the V2 post-mortem's most expensive lesson).
- Conventional Commits. Never `git add -A`.

---

## Port decisions (made here, so no task re-litigates them)

| # | Decision | Why |
|---|---|---|
| **P1** | **Durations are `number` milliseconds with an `Ms` suffix on every name** (`elapsedMs`, `accumulatedPauseMs`, `totalPausedMs`). Truncated to seconds **only at the DB boundary** with `Math.trunc(ms / 1000)`. | Mirrors Dart exactly: `Duration` kept sub-second precision and `.inSeconds` truncated toward zero at the write. A bare `number` with no unit in the name is how unit bugs happen. |
| **P2** | **Instants are `Date`**; converted at the boundary by `toEpochSeconds` / `fromEpochSeconds` only. | Storage is epoch seconds. One conversion pair means one place to be wrong. |
| **P3** | **Nullable DB fields are typed `\| null`, never optional properties.** | SQL has NULL, not "absent". `comprehensionRating?: number` and `comprehensionRating: number \| null` are different contracts and the second is the true one. |
| **P4** | **Repository methods return `Promise`, implementations execute synchronously.** | The V3 spec §5 seam binds these interfaces to SQLite *or* to fixtures *or* (V3-B) across IPC. An async interface accommodates all three; a sync one does not. Because `node:sqlite` is synchronous there is no real suspension inside a method, so no interleaving window is introduced. |
| **P5** | **A `Clock` (`() => Date`) is injected into every repository**, defaulting to `() => new Date()`. | Deliberate improvement on the Dart original, which called `DateTime.now()` inline. It makes the `updated_at` liveness watermark assertable (invariant 2) and is the same discipline masterplan Phase 8 already mandates for the purge cutoff. Behaviour is unchanged. |
| **P6** | **Persistence goes through a `SqliteDriver` interface**; `node:sqlite` is one implementation. | The handoff records "whether *Electron's* bundled Node exposes `node:sqlite` is **unverified**". This makes the `better-sqlite3` fallback a one-file change instead of a repository rewrite. |
| **P7** | **Transactions use `SAVEPOINT`, not `BEGIN`.** | SQLite cannot nest `BEGIN`. Savepoints nest, and start an implicit transaction when used at the top level, so a future caller wrapping two repository calls cannot deadlock the ones that already transact. |
| **P8** | **drift's `watch*` streams become plain `list*` / `count*` queries.** Reactivity is **deferred to V3-C** as open decision **V3-1**. | Every Flutter test consumed these with `.first` — they test the *query*, not the stream. Designing a change-notification bus with no UI to serve would be guesswork; V3-C is where the requirement becomes concrete. Recorded rather than silently dropped. |
| **P9** | **`moduleResolution: "NodeNext"` with explicit `.js` extensions on relative imports.** | Works unchanged under plain `node`, `tsx`, vitest and any bundler. `"bundler"` resolution would silently commit V3-B to a bundler for the Electron main process. |
| **P10** | **Errors are two named classes** — `DomainStateError` and `ValidationError` — in `src/errors.ts`. | Preserves the Dart suite's distinction between `throwsStateError` (survey refused) and `throwsRangeError`/`throwsArgumentError` (bad input), so a test cannot pass on the wrong failure. |
| **P11** | **No build output in this slice** (`noEmit`). `schema.sql` is read via `import.meta.url`. | Nothing consumes a build yet. V3-B introduces the bundler and owns copying `schema.sql` into the bundle (or supplying it via `openDatabase({ schemaSql })`, which exists for exactly that). |

---

## Scope

**In:** workspace scaffold · `ids` · `SqliteDriver` + `openDatabase` (applies `schema.sql`) ·
`ensureLocalUser` · `ActiveSession` · `SubjectRepository` · `SessionRepository` ·
`SurveyRepository` · `InterruptionRepository` · repository port interfaces · the privacy
write-confinement guard · the schema freeze guard · CI for `desktop/`.

**Out, with owners** (recorded so nothing is silently dropped):

| Deferred | Owner | Why |
|---|---|---|
| `SessionController` port + the two mirror-ordering race tests | **V3-C** | Presentation layer. Invariant 4's *ordering* rule lives there. |
| Reactivity to replace drift streams (decision **V3-1**) | **V3-C** | See P8. |
| In-memory fixture repository implementations (`nerdyapp-test.exe`) | **V3-B** | Needs the app shell to bind them. |
| `backup.dart` port (`VACUUM INTO`) | **V3-B** | Needs Electron's save dialog. |
| `schema.sql`-vs-**live**-database test | **V3-D** | There is no live V3 database until V3-B opens one. |
| Modernist theme, the seven views, `mock_data` → fixtures | **V3-C** | — |
| Deleting/renaming the vestigial `desktop/packages/lab` | this slice | Cheap; folded into Task 1. |

---

## File structure

```
desktop/
  package.json                 workspaces root (private), scripts, engines
  package-lock.json            committed — CI uses `npm ci`
  tsconfig.base.json           strict compiler options shared by all packages
  eslint.config.js             flat config, type-checked rules
  .gitignore                   node_modules/, dist/, coverage/
  packages/core/
    package.json               @nerdyapp/core
    tsconfig.json              extends ../../tsconfig.base.json
    vitest.config.ts
    src/
      index.ts                 the package's public surface
      errors.ts                DomainStateError, ValidationError
      ids.ts                   localUserId, newId()
      time.ts                  toEpochSeconds, fromEpochSeconds, msToSeconds
      db/
        schema.sql             FROZEN — already committed, never edited
        driver.ts              SqliteDriver/SqliteStatement + NodeSqliteDriver
        connection.ts          Database (driver + transaction), openDatabase()
        local-user.ts          ensureLocalUser()
      domain/
        active-session.ts      the timing state machine
      data/
        ports.ts               the four repository INTERFACES + shared row views
        subject-repository.ts
        session-repository.ts
        survey-repository.ts
        interruption-repository.ts
    test/
      support/fixture.ts       freshDb(), seeded ids, a fixed clock
      ids.test.ts
      db/schema.test.ts
      db/local-user.test.ts
      db/write-confinement.test.ts
      domain/active-session.test.ts
      data/subject-repository.test.ts
      data/session-repository.test.ts
      data/survey-repository.test.ts
      data/interruption-repository.test.ts
```

---

### Task 1: Workspace scaffold, toolchain, and `ids`

**Files:**
- Create: `desktop/package.json`, `desktop/tsconfig.base.json`, `desktop/eslint.config.js`,
  `desktop/.gitignore`, `desktop/packages/core/package.json`,
  `desktop/packages/core/tsconfig.json`, `desktop/packages/core/vitest.config.ts`,
  `desktop/packages/core/src/ids.ts`, `desktop/packages/core/src/errors.ts`,
  `desktop/packages/core/src/time.ts`
- Test: `desktop/packages/core/test/ids.test.ts`
- Delete: `desktop/packages/lab/` (vestigial — the second build is `test`, not a lab)

**Interfaces produced:**
- `localUserId: string` — the fixed UUIDv7 `'01920000-0000-7000-8000-000000000001'`
- `newId(): string` — a fresh, lexicographically time-ordered UUIDv7
- `class DomainStateError extends Error`, `class ValidationError extends Error`
- `toEpochSeconds(d: Date): number`, `fromEpochSeconds(s: number): Date`,
  `msToSeconds(ms: number): number`

- [ ] **Step 1: Create the workspace root**

`desktop/package.json`:
```json
{
  "name": "nerdyapp-desktop",
  "private": true,
  "type": "module",
  "engines": { "node": ">=25.0.0" },
  "workspaces": ["packages/*"],
  "scripts": {
    "typecheck": "tsc --build --force",
    "lint": "eslint .",
    "test": "npm run test --workspaces --if-present"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@types/node": "^24.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^3.0.0"
  }
}
```

`desktop/tsconfig.base.json` (P9; strict plus the flags that catch real bugs):
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`desktop/.gitignore`:
```
node_modules/
dist/
coverage/
*.tsbuildinfo
```

- [ ] **Step 2: Create the `core` package**

`desktop/packages/core/package.json`:
```json
{
  "name": "@nerdyapp/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "dependencies": { "uuid": "^11.0.0" }
}
```

`desktop/packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "test/**/*.ts", "*.ts"]
}
```

`desktop/packages/core/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
```

`desktop/eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // The project's async-ordering bugs (spec 2026-07-26 §4.2) were all
      // un-awaited or mis-ordered promises. This rule is the cheap half of the fix.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
);
```

- [ ] **Step 3: Install and remove the vestigial directory**

```bash
cd desktop && npm install
```
```bash
git rm -r desktop/packages/lab 2>/dev/null || rmdir desktop/packages/lab/src desktop/packages/lab
```

- [ ] **Step 4: Write the failing test**

`desktop/packages/core/test/ids.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { localUserId, newId } from '../src/ids.js';
import { fromEpochSeconds, msToSeconds, toEpochSeconds } from '../src/time.js';

describe('ids', () => {
  test('localUserId is the frozen UUIDv7 from masterplan decision 4', () => {
    // A constant, not a generated value: a future server sync relies on it and
    // every user_id foreign key in the database already points at it.
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
    // same-second interruptions sort arbitrarily between runs.
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
  });
});
```

- [ ] **Step 5: Run it and see it fail**

Run: `cd desktop/packages/core && npx vitest run test/ids.test.ts`
Expected: FAIL — cannot resolve `../src/ids.js`.

*This step also proves P9: `.js`-suffixed relative imports resolve to `.ts` under vitest. If they
do not, stop and fix the resolution before writing any more files.*

- [ ] **Step 6: Implement**

`desktop/packages/core/src/ids.ts`:
```ts
import { v7 as uuidv7 } from 'uuid';

/** Fixed UUIDv7 for the single local user row (masterplan locked decision 4).
 *  Constant so a future server sync can rely on it; never regenerate. */
export const localUserId = '01920000-0000-7000-8000-000000000001';

/** UUIDv7 — lexicographically time-ordered, which several queries sort on. */
export function newId(): string {
  return uuidv7();
}
```

`desktop/packages/core/src/time.ts`:
```ts
/** Storage is INTEGER epoch SECONDS (schema.sql). These are the only two places
 *  the boundary is crossed, and both truncate toward zero — matching Dart's
 *  Duration.inSeconds, which the shipped rows were written with. */
export function toEpochSeconds(d: Date): number {
  return Math.trunc(d.getTime() / 1000);
}

export function fromEpochSeconds(s: number): Date {
  return new Date(s * 1000);
}

/** Milliseconds → whole seconds, truncating toward zero (P1). */
export function msToSeconds(ms: number): number {
  return Math.trunc(ms / 1000);
}
```

`desktop/packages/core/src/errors.ts`:
```ts
/** The operation is illegal for the current state of the data
 *  (Dart: StateError). Example: surveying a crashed session. */
export class DomainStateError extends Error {
  override readonly name = 'DomainStateError';
}

/** The argument is malformed or out of range (Dart: ArgumentError/RangeError).
 *  Distinct from DomainStateError so a test cannot pass on the wrong failure. */
export class ValidationError extends Error {
  override readonly name = 'ValidationError';
}
```

- [ ] **Step 7: Run tests, typecheck and lint**

Run: `cd desktop/packages/core && npx vitest run` → Expected: 5 passed
Run: `cd desktop && npx tsc --build --force` → Expected: no output, exit 0
Run: `cd desktop && npx eslint .` → Expected: no output, exit 0

- [ ] **Step 8: Commit**

```bash
git add desktop/package.json desktop/package-lock.json desktop/tsconfig.base.json desktop/eslint.config.js desktop/.gitignore desktop/packages/core && git commit -m "feat(v3): scaffold the desktop npm workspace with TS strict, vitest and ids"
```

---

### Task 2: SQLite driver, connection, and the schema freeze guard

**Files:**
- Create: `desktop/packages/core/src/db/driver.ts`,
  `desktop/packages/core/src/db/connection.ts`,
  `desktop/packages/core/test/support/fixture.ts`
- Test: `desktop/packages/core/test/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 except `src/db/schema.sql` (already committed, frozen).
- Produces:
  - `type BindValue = string | number | bigint | null | Uint8Array`
  - `interface SqliteStatement { run(...p: BindValue[]): { changes: number }; get<T>(...p: BindValue[]): T | undefined; all<T>(...p: BindValue[]): T[] }`
  - `interface SqliteDriver { exec(sql: string): void; prepare(sql: string): SqliteStatement; close(): void }`
  - `interface Database extends SqliteDriver { transaction<T>(fn: () => T): T }`
  - `openDatabase(opts?: { file?: string; schemaSql?: string }): Database`
  - `readSchemaSql(): string`
  - test helper `freshDb(): Database`

- [ ] **Step 1: Write the failing test**

`desktop/packages/core/test/db/schema.test.ts`:
```ts
import { afterEach, expect, test } from 'vitest';
import { openDatabase, type Database } from '../../src/db/connection.js';

let db: Database;
const fresh = (): Database => (db = openDatabase());
afterEach(() => db?.close());

// Every expectation below is written out by hand from data-model.md, NOT read
// back from schema.sql — that is what makes these guards capable of failing.
// Change schema.sql and this file goes red; that is the freeze in the new stack.

test('exactly the seven v1 tables exist', () => {
  const rows = fresh()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all<{ name: string }>();
  // Exact set, not a superset: an accidental extra table must fail too — the
  // freeze is bidirectional.
  expect(rows.map((r) => r.name).sort()).toEqual([
    'daily_summaries', 'interruptions', 'session_surveys',
    'sessions', 'subjects', 'topics', 'users',
  ]);
});

test('every table has exactly its frozen column set', () => {
  const d = fresh();
  const expected: Record<string, string[]> = {
    users: ['id', 'created_at', 'updated_at', 'deleted_at', 'sync_state', 'email',
      'password_hash', 'display_name', 'timezone', 'day_start_hour'],
    subjects: ['id', 'created_at', 'updated_at', 'deleted_at', 'sync_state', 'user_id',
      'name', 'color', 'source', 'source_name', 'archived'],
    topics: ['id', 'created_at', 'updated_at', 'deleted_at', 'sync_state', 'subject_id',
      'parent_topic_id', 'name', 'order_index', 'status'],
    sessions: ['id', 'created_at', 'updated_at', 'deleted_at', 'sync_state', 'user_id',
      'subject_id', 'topic_id', 'mode', 'planned_duration_s', 'actual_duration_s',
      'paused_duration_s', 'started_at', 'ended_at', 'end_reason'],
    session_surveys: ['id', 'created_at', 'updated_at', 'deleted_at', 'sync_state',
      'session_id', 'focus_rating', 'comprehension_rating', 'difficulty_rating', 'note'],
    interruptions: ['id', 'created_at', 'updated_at', 'deleted_at', 'sync_state',
      'session_id', 'kind', 'occurred_at', 'duration_s', 'blocked', 'detail'],
    daily_summaries: ['id', 'created_at', 'updated_at', 'deleted_at', 'sync_state',
      'user_id', 'local_date', 'total_seconds', 'session_count', 'avg_focus_rating',
      'qualified'],
  };
  for (const [table, columns] of Object.entries(expected)) {
    const actual = d
      .prepare(`PRAGMA table_info(${table})`)
      .all<{ name: string }>()
      .map((r) => r.name);
    expect(actual, `columns of ${table}`).toEqual(columns);
  }
});

test('the six v1 indexes exist, partial where data-model.md says so', () => {
  const rows = fresh()
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
    .all<{ name: string; sql: string }>();
  const bySql = new Map(rows.map((r) => [r.name, r.sql]));
  expect([...bySql.keys()].sort()).toEqual([
    'idx_interruptions_session', 'idx_sessions_topic', 'idx_sessions_user_time',
    'idx_subjects_user', 'idx_topics_parent', 'idx_topics_subject',
  ]);
  for (const p of ['idx_subjects_user', 'idx_topics_subject', 'idx_sessions_user_time']) {
    expect(bySql.get(p), `${p} must be partial`).toContain('WHERE deleted_at IS NULL');
  }
  for (const f of ['idx_topics_parent', 'idx_sessions_topic', 'idx_interruptions_session']) {
    expect(bySql.get(f), `${f} must not be partial`).not.toContain('WHERE');
  }
});

test('the frozen FK set is exactly the nine declared references', () => {
  const d = fresh();
  const expected: Record<string, string[]> = {
    subjects: ['users.user_id->id'],
    topics: ['subjects.subject_id->id', 'topics.parent_topic_id->id'],
    sessions: ['subjects.subject_id->id', 'topics.topic_id->id', 'users.user_id->id'],
    session_surveys: ['sessions.session_id->id'],
    interruptions: ['sessions.session_id->id'],
    daily_summaries: ['users.user_id->id'],
  };
  let total = 0;
  for (const [table, fks] of Object.entries(expected)) {
    const actual = d
      .prepare(`PRAGMA foreign_key_list(${table})`)
      .all<{ table: string; from: string; to: string }>()
      .map((r) => `${r.table}.${r.from}->${r.to}`)
      .sort();
    expect(actual, `FKs of ${table}`).toEqual(fks);
    total += actual.length;
  }
  expect(total, 'nine foreign keys, per data-model.md §6').toBe(9);
});

test('foreign keys are ENFORCED, not merely declared', () => {
  // node:sqlite enables foreign_keys by default AND schema.sql sets the pragma.
  // This pins the behaviour rather than the mechanism: if a future connection
  // option turns it off, this goes red.
  const d = fresh();
  expect(d.prepare('PRAGMA foreign_keys').get<{ foreign_keys: number }>()?.foreign_keys).toBe(1);
  expect(() =>
    d.prepare('INSERT INTO subjects (id, user_id, name) VALUES (?,?,?)')
      .run('s1', 'no-such-user', 'Physics'),
  ).toThrow(/FOREIGN KEY constraint failed/);
});

test('session_surveys rejects an out-of-range focus_rating', () => {
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u1', 'a@b.c', '');
  d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s1', 'u1', 'Maths');
  d.prepare('INSERT INTO sessions (id,user_id,subject_id,mode,started_at) VALUES (?,?,?,?,?)')
    .run('sess1', 'u1', 's1', 'plain', 1000);
  expect(() =>
    d.prepare('INSERT INTO session_surveys (id,session_id,focus_rating) VALUES (?,?,?)')
      .run('sv1', 'sess1', 6),
  ).toThrow(/CHECK constraint failed/);
  // SQLite cannot add a CHECK after the freeze, so the in-range branch is
  // pinned too: a constraint that rejects everything would also pass above.
  d.prepare('INSERT INTO session_surveys (id,session_id,focus_rating) VALUES (?,?,?)')
    .run('sv2', 'sess1', 4);
});

test('daily_summaries rejects a duplicate (user_id, local_date)', () => {
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u1', 'a@b.c', '');
  d.prepare('INSERT INTO daily_summaries (id,user_id,local_date) VALUES (?,?,?)')
    .run('d1', 'u1', '2026-07-26');
  expect(() =>
    d.prepare('INSERT INTO daily_summaries (id,user_id,local_date) VALUES (?,?,?)')
      .run('d2', 'u1', '2026-07-26'),
  ).toThrow(/UNIQUE constraint failed/);
});

test('an instant round-trips as the same second', () => {
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)')
    .run('u1', 'a@b.c', '', 1785073512);
  expect(d.prepare('SELECT created_at FROM users').get<{ created_at: number }>()?.created_at)
    .toBe(1785073512);
});

test('a rolled-back savepoint leaves no rows, and savepoints nest', () => {
  const d = fresh();
  d.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u1', 'a@b.c', '');
  expect(() =>
    d.transaction(() => {
      d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s1', 'u1', 'A');
      d.transaction(() => {
        d.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s2', 'u1', 'B');
      });
      throw new Error('boom');
    }),
  ).toThrow('boom');
  expect(d.prepare('SELECT count(*) c FROM subjects').get<{ c: number }>()?.c).toBe(0);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd desktop/packages/core && npx vitest run test/db/schema.test.ts`
Expected: FAIL — cannot resolve `../../src/db/connection.js`.

- [ ] **Step 3: Implement the driver**

`desktop/packages/core/src/db/driver.ts`:
```ts
import { DatabaseSync } from 'node:sqlite';

export type BindValue = string | number | bigint | null | Uint8Array;

export interface SqliteStatement {
  run(...params: BindValue[]): { changes: number };
  get<T>(...params: BindValue[]): T | undefined;
  all<T>(...params: BindValue[]): T[];
}

/** The whole persistence surface `core` depends on. `node:sqlite` is one
 *  implementation; `better-sqlite3` is the recorded fallback if Electron's
 *  bundled Node turns out not to expose node:sqlite (handoff, 2026-07-27).
 *  Keeping it this narrow is what makes that a one-file change. */
export interface SqliteDriver {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

export function nodeSqliteDriver(file: string): SqliteDriver {
  const db = new DatabaseSync(file);
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => db.prepare(sql) as unknown as SqliteStatement,
    close: () => db.close(),
  };
}
```

- [ ] **Step 4: Implement the connection**

`desktop/packages/core/src/db/connection.ts`:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nodeSqliteDriver, type SqliteDriver } from './driver.js';

export interface Database extends SqliteDriver {
  /** Runs `fn` inside a SAVEPOINT (P7): SQLite cannot nest BEGIN, but
   *  savepoints nest and open an implicit transaction at the top level. */
  transaction<T>(fn: () => T): T;
}

/** The frozen schema, read from the committed .sql file rather than duplicated
 *  into a string constant — there is exactly one source of truth (V3 spec §4.1).
 *  V3-B owns getting this into a bundle; `openDatabase({ schemaSql })` is the
 *  seam for supplying it another way. */
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
      const name = `sp_${String(depth++)}`;
      driver.exec(`SAVEPOINT ${name}`);
      try {
        const result = fn();
        driver.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        driver.exec(`ROLLBACK TO ${name}`);
        driver.exec(`RELEASE ${name}`);
        throw error;
      } finally {
        depth--;
      }
    },
  };
}
```

- [ ] **Step 5: Add the shared test fixture**

`desktop/packages/core/test/support/fixture.ts`:
```ts
import { openDatabase, type Database } from '../../src/db/connection.js';

/** A fresh in-memory database with the frozen schema applied. */
export function freshDb(): Database {
  return openDatabase();
}

/** A clock the tests drive by hand (P5), so `updated_at` is assertable. */
export function fixedClock(start: Date): { now: () => Date; set: (d: Date) => void } {
  let current = start;
  return { now: () => current, set: (d) => (current = d) };
}
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `cd desktop/packages/core && npx vitest run test/db/schema.test.ts` → Expected: 9 passed
Run: `cd desktop && npx tsc --build --force && npx eslint .` → Expected: exit 0

- [ ] **Step 7: Probe the freeze guard RED (mandatory — masterplan §1a)**

Temporarily add `CREATE TABLE zzz_probe (id TEXT PRIMARY KEY);` to the end of `schema.sql`, and
separately add a nullable column to `subjects`.

Run: `npx vitest run test/db/schema.test.ts`
Expected: FAIL on "exactly the seven v1 tables exist" (probe 1) and on "every table has exactly its
frozen column set" (probe 2). **Record both outputs in the PR.** Revert `schema.sql` afterwards and
confirm `git diff -- desktop/packages/core/src/db/schema.sql` is empty.

- [ ] **Step 8: Commit**

```bash
git add desktop/packages/core/src/db desktop/packages/core/test && git commit -m "feat(v3): sqlite driver, schema-applying connection, and the v1 freeze guard"
```

---

### Task 3: `ensureLocalUser`

**Files:**
- Create: `desktop/packages/core/src/db/local-user.ts`
- Test: `desktop/packages/core/test/db/local-user.test.ts`

**Interfaces:**
- Consumes: `Database` (Task 2), `localUserId` (Task 1)
- Produces: `ensureLocalUser(db: Database): void`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, expect, test } from 'vitest';
import { ensureLocalUser } from '../../src/db/local-user.js';
import { localUserId } from '../../src/ids.js';
import { freshDb } from '../support/fixture.js';
import type { Database } from '../../src/db/connection.js';

let db: Database;
afterEach(() => db.close());

test('seeds exactly one row with the fixed id and the sentinel fields', () => {
  db = freshDb();
  ensureLocalUser(db);
  const rows = db.prepare('SELECT * FROM users').all<{ id: string; email: string }>();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(localUserId);
  // masterplan §10: NOT NULL columns seeded with sentinels for the local user.
  expect(rows[0]?.email).toBe('local@device.invalid');
});

test('is idempotent — 100 calls still leave one row, and never throw', () => {
  // V2's defect was read-then-insert: concurrent callers either duplicated the
  // row or threw on the PK collision. INSERT OR IGNORE is atomic, so the fix
  // survives the port. Honest note: the driver is synchronous and
  // single-threaded, so this proves idempotency, not concurrency — the property
  // that could still regress is someone swapping OR IGNORE for a plain INSERT.
  db = freshDb();
  for (let i = 0; i < 100; i++) ensureLocalUser(db);
  expect(db.prepare('SELECT count(*) c FROM users').get<{ c: number }>()?.c).toBe(1);
});

test('does not overwrite an existing local user row', () => {
  db = freshDb();
  ensureLocalUser(db);
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run('Isaac', localUserId);
  ensureLocalUser(db);
  expect(
    db.prepare('SELECT display_name d FROM users').get<{ d: string | null }>()?.d,
  ).toBe('Isaac');
});
```

- [ ] **Step 2: Run it and see it fail** — `npx vitest run test/db/local-user.test.ts` → cannot resolve `local-user.js`.

- [ ] **Step 3: Implement**

```ts
import type { Database } from './connection.js';
import { localUserId } from '../ids.js';

/** Seeds the single local user row (masterplan locked decision 4).
 *  INSERT OR IGNORE on the primary key makes this atomic and idempotent —
 *  no read-then-insert race (V2 post-mortem defect 4). */
export function ensureLocalUser(db: Database): void {
  db.prepare(
    'INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, ?)',
  ).run(localUserId, 'local@device.invalid', '');
}
```

- [ ] **Step 4: Run tests** → Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add desktop/packages/core/src/db/local-user.ts desktop/packages/core/test/db/local-user.test.ts && git commit -m "feat(v3): seed the single local user row idempotently"
```

---

### Task 4: `ActiveSession` — the timing state machine

**Files:**
- Create: `desktop/packages/core/src/domain/active-session.ts`
- Test: `desktop/packages/core/test/domain/active-session.test.ts`

**Interfaces:**
- Consumes: `DomainStateError` (Task 1)
- Produces:
  ```ts
  class ActiveSession {
    static start(a: { id: string; subjectId: string; startedAt: Date; mode?: string }): ActiveSession;
    readonly id: string; readonly subjectId: string; readonly mode: string;
    readonly startedAt: Date; readonly accumulatedPauseMs: number;
    readonly pauseStartedAt: Date | null;
    get isPaused(): boolean;
    pause(now: Date): ActiveSession;   // throws DomainStateError if paused
    resume(now: Date): ActiveSession;  // throws DomainStateError if running
    totalPausedMs(now: Date): number;
    elapsedMs(now: Date): number;
  }
  ```

- [ ] **Step 1: Write the failing test** (mirrors `app-flutter/test/features/session/active_session_test.dart`, plus three cases the Dart suite lacked)

```ts
import { describe, expect, test } from 'vitest';
import { ActiveSession } from '../../src/domain/active-session.js';
import { DomainStateError } from '../../src/errors.js';

const t0 = new Date('2026-07-26T10:00:00.000Z');
const at = (minutes: number): Date => new Date(t0.getTime() + minutes * 60_000);
const MIN = 60_000;
const started = (): ActiveSession =>
  ActiveSession.start({ id: 'id', subjectId: 'subj', startedAt: t0 });

describe('ActiveSession', () => {
  test('elapsed tracks wall clock while running', () => {
    expect(started().elapsedMs(at(5))).toBe(5 * MIN);
  });

  test('a pause/resume cycle is excluded from elapsed', () => {
    const s = started().pause(at(10)).resume(at(15));
    expect(s.elapsedMs(at(20))).toBe(15 * MIN);
    expect(s.totalPausedMs(at(20))).toBe(5 * MIN);
  });

  test('elapsed freezes during an in-flight pause', () => {
    const s = started().pause(at(10));
    expect(s.elapsedMs(at(25))).toBe(10 * MIN);
    expect(s.totalPausedMs(at(25))).toBe(15 * MIN);
  });

  test('multiple pause cycles accumulate', () => {
    const s = started().pause(at(10)).resume(at(12)).pause(at(20)).resume(at(25));
    expect(s.elapsedMs(at(30))).toBe(23 * MIN);
    expect(s.totalPausedMs(at(30))).toBe(7 * MIN);
  });

  test('pause while paused throws', () => {
    expect(() => started().pause(at(1)).pause(at(2))).toThrow(DomainStateError);
  });

  test('resume while running throws', () => {
    expect(() => started().resume(at(1))).toThrow(DomainStateError);
  });

  test('mode defaults to plain and is carried through pause/resume', () => {
    expect(started().mode).toBe('plain');
    const f = ActiveSession.start({ id: 'i', subjectId: 's', startedAt: t0, mode: 'focused' });
    expect(f.pause(at(1)).resume(at(2)).mode).toBe('focused');
  });

  test('transitions return a NEW instance and never mutate the old one', () => {
    // Elapsed is computed from timestamps, so a mutated-in-place session would
    // silently rewrite history for any holder of the previous value.
    const a = started();
    const b = a.pause(at(10));
    expect(b).not.toBe(a);
    expect(a.isPaused).toBe(false);
    expect(a.pauseStartedAt).toBeNull();
    expect(b.isPaused).toBe(true);
  });

  test('elapsed is computed from timestamps, so a backwards clock is visible not hidden', () => {
    // Guards the tick-counter regression (architecture.md §3.4): a counter would
    // return a monotonically growing value here regardless of `now`.
    expect(started().elapsedMs(new Date(t0.getTime() - 5 * MIN))).toBe(-5 * MIN);
  });
});
```

- [ ] **Step 2: Run it and see it fail** — `npx vitest run test/domain/active-session.test.ts`.

- [ ] **Step 3: Implement**

```ts
import { DomainStateError } from '../errors.js';

/** Pure session timing state machine (architecture.md §3.4).
 *  Elapsed time is ALWAYS computed from timestamps — never a tick counter.
 *  Every transition returns a new instance; nothing here is mutable. */
export class ActiveSession {
  private constructor(
    readonly id: string,
    readonly subjectId: string,
    /** 'plain' | 'focused' — chosen at start, immutable for the session's life. */
    readonly mode: string,
    readonly startedAt: Date,
    readonly accumulatedPauseMs: number,
    readonly pauseStartedAt: Date | null,
  ) {}

  static start(a: {
    id: string;
    subjectId: string;
    startedAt: Date;
    mode?: string;
  }): ActiveSession {
    return new ActiveSession(a.id, a.subjectId, a.mode ?? 'plain', a.startedAt, 0, null);
  }

  get isPaused(): boolean {
    return this.pauseStartedAt !== null;
  }

  pause(now: Date): ActiveSession {
    if (this.pauseStartedAt !== null) throw new DomainStateError('already paused');
    return new ActiveSession(
      this.id, this.subjectId, this.mode, this.startedAt, this.accumulatedPauseMs, now,
    );
  }

  resume(now: Date): ActiveSession {
    const pausedAt = this.pauseStartedAt;
    if (pausedAt === null) throw new DomainStateError('not paused');
    return new ActiveSession(
      this.id, this.subjectId, this.mode, this.startedAt,
      this.accumulatedPauseMs + (now.getTime() - pausedAt.getTime()), null,
    );
  }

  totalPausedMs(now: Date): number {
    const pausedAt = this.pauseStartedAt;
    return this.accumulatedPauseMs + (pausedAt === null ? 0 : now.getTime() - pausedAt.getTime());
  }

  elapsedMs(now: Date): number {
    return now.getTime() - this.startedAt.getTime() - this.totalPausedMs(now);
  }
}
```

- [ ] **Step 4: Run tests** → Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add desktop/packages/core/src/domain desktop/packages/core/test/domain && git commit -m "feat(v3): port the ActiveSession timing state machine to TypeScript"
```

---

### Task 5: `SubjectRepository`

**Files:**
- Create: `desktop/packages/core/src/data/ports.ts`,
  `desktop/packages/core/src/data/subject-repository.ts`
- Test: `desktop/packages/core/test/data/subject-repository.test.ts`

**Interfaces:**
- Consumes: `Database`, `ensureLocalUser`, `localUserId`, `newId`, `toEpochSeconds`
- Produces:
  ```ts
  interface SubjectRow { id: string; name: string; color: string | null;
    source: string; sourceName: string | null; archived: boolean; createdAt: Date }
  interface SubjectRepository {
    create(a: { name: string; color?: string | null; source?: string; sourceName?: string | null }): Promise<string>;
    update(id: string, a: { name: string; color: string | null; source: string; sourceName: string | null }): Promise<void>;
    setArchived(id: string, archived: boolean): Promise<void>;
    remove(id: string): Promise<void>;            // soft delete
    list(opts?: { archived?: boolean }): Promise<SubjectRow[]>;
  }
  class SqliteSubjectRepository implements SubjectRepository {
    constructor(db: Database, now?: () => Date);
  }
  ```

- [ ] **Step 1: Write the failing test** (mirrors `subject_repository_test.dart`; the two
  history-join cases move to Task 6, which owns `listHistory`)

```ts
import { afterEach, beforeEach, expect, test } from 'vitest';
import { SqliteSubjectRepository } from '../../src/data/subject-repository.js';
import { ensureLocalUser } from '../../src/db/local-user.js';
import type { Database } from '../../src/db/connection.js';
import { freshDb, fixedClock } from '../support/fixture.js';

let db: Database;
let repo: SqliteSubjectRepository;
const clock = fixedClock(new Date('2026-07-26T09:00:00.000Z'));

beforeEach(() => {
  db = freshDb();
  ensureLocalUser(db);
  repo = new SqliteSubjectRepository(db, clock.now);
});
afterEach(() => db.close());

test('create inserts a row visible to list', async () => {
  await repo.create({ name: 'Physics' });
  const subjects = await repo.list();
  expect(subjects).toHaveLength(1);
  expect(subjects[0]?.name).toBe('Physics');
});

test('list excludes soft-deleted rows', async () => {
  const id = await repo.create({ name: 'Old' });
  db.prepare('UPDATE subjects SET deleted_at = ? WHERE id = ?').run(1, id);
  expect(await repo.list()).toEqual([]);
});

test('create persists colour, source and source name; defaults are self/null', async () => {
  const plainId = await repo.create({ name: 'Maths' });
  const richId = await repo.create({
    name: 'Flutter', color: '#42A5F5', source: 'course', sourceName: 'Udemy',
  });
  const rows = await repo.list();
  const plain = rows.find((s) => s.id === plainId);
  const rich = rows.find((s) => s.id === richId);
  // Asymmetric on purpose: three identical values could not catch swapped columns.
  expect([plain?.color, plain?.source, plain?.sourceName]).toEqual([null, 'self', null]);
  expect([rich?.color, rich?.source, rich?.sourceName]).toEqual(['#42A5F5', 'course', 'Udemy']);
});

test('update rewrites all editable fields, and null clears them', async () => {
  const id = await repo.create({
    name: 'Chem', color: '#EF5350', source: 'school', sourceName: 'MRSM',
  });
  await repo.update(id, { name: 'Chemistry', color: null, source: 'self', sourceName: null });
  const s = (await repo.list())[0];
  expect([s?.name, s?.color, s?.source, s?.sourceName])
    .toEqual(['Chemistry', null, 'self', null]);
});

test('archiving moves a subject between the two lists, both ways', async () => {
  const id = await repo.create({ name: 'Physics' });
  await repo.setArchived(id, true);
  expect(await repo.list()).toEqual([]);
  expect((await repo.list({ archived: true }))[0]?.name).toBe('Physics');
  await repo.setArchived(id, false);
  expect((await repo.list())[0]?.name).toBe('Physics');
  expect(await repo.list({ archived: true })).toEqual([]);
});

test('remove is soft: gone from both lists, the row survives', async () => {
  const id = await repo.create({ name: 'Physics' });
  await repo.remove(id);
  expect(await repo.list()).toEqual([]);
  expect(await repo.list({ archived: true })).toEqual([]);
  const row = db.prepare('SELECT deleted_at FROM subjects').get<{ deleted_at: number | null }>();
  expect(row?.deleted_at, 'soft delete, never DELETE — history joins keep the name')
    .not.toBeNull();
});

test('every write advances updated_at', async () => {
  // updated_at is the liveness watermark crash recovery bounds a session by.
  const id = await repo.create({ name: 'Physics' });
  const readUpdatedAt = (): number =>
    db.prepare('SELECT updated_at u FROM subjects WHERE id = ?')
      .get<{ u: number }>(id)?.u ?? 0;
  const first = readUpdatedAt();
  clock.set(new Date('2026-07-26T09:30:00.000Z'));
  await repo.setArchived(id, true);
  expect(readUpdatedAt()).toBeGreaterThan(first);
});

test('list is newest-first', async () => {
  clock.set(new Date('2026-07-26T09:00:00.000Z'));
  const a = await repo.create({ name: 'A' });
  clock.set(new Date('2026-07-26T10:00:00.000Z'));
  const b = await repo.create({ name: 'B' });
  expect((await repo.list()).map((s) => s.id)).toEqual([b, a]);
});
```

- [ ] **Step 2: Run it and see it fail.**

- [ ] **Step 3: Write `src/data/ports.ts`** with the `SubjectRow` / `SubjectRepository`
  declarations exactly as in the Interfaces block above, plus this header comment:

```ts
/** The repository INTERFACES `core` exposes (V3 spec §5).
 *
 *  `nerdyapp.exe` binds these to the SQLite implementations in this directory;
 *  `nerdyapp-test.exe` will bind them to in-memory fixtures and open no
 *  database at all. The renderer never learns which one it is talking to.
 *
 *  Methods return Promises even though the SQLite binding is synchronous (P1
 *  in the V3-A plan): the fixture binding and the V3-B IPC boundary are not. */
```

- [ ] **Step 4: Implement `src/data/subject-repository.ts`**

```ts
import type { Database } from '../db/connection.js';
import { localUserId, newId } from '../ids.js';
import { fromEpochSeconds, toEpochSeconds } from '../time.js';
import type { SubjectRepository, SubjectRow } from './ports.js';

interface Raw {
  id: string; name: string; color: string | null; source: string;
  source_name: string | null; archived: number; created_at: number;
}

const map = (r: Raw): SubjectRow => ({
  id: r.id, name: r.name, color: r.color, source: r.source,
  sourceName: r.source_name, archived: r.archived === 1,
  createdAt: fromEpochSeconds(r.created_at),
});

export class SqliteSubjectRepository implements SubjectRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(a: {
    name: string; color?: string | null; source?: string; sourceName?: string | null;
  }): Promise<string> {
    const id = newId();
    const ts = toEpochSeconds(this.now());
    this.db
      .prepare(
        `INSERT INTO subjects (id, user_id, name, color, source, source_name,
                               created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, localUserId, a.name, a.color ?? null, a.source ?? 'self',
        a.sourceName ?? null, ts, ts);
    return Promise.resolve(id);
  }

  update(
    id: string,
    a: { name: string; color: string | null; source: string; sourceName: string | null },
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE subjects SET name = ?, color = ?, source = ?, source_name = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(a.name, a.color, a.source, a.sourceName, toEpochSeconds(this.now()), id);
    return Promise.resolve();
  }

  setArchived(id: string, archived: boolean): Promise<void> {
    // node:sqlite refuses to bind a JS boolean (probed 2026-07-27) — 0/1 always.
    this.db
      .prepare('UPDATE subjects SET archived = ?, updated_at = ? WHERE id = ?')
      .run(archived ? 1 : 0, toEpochSeconds(this.now()), id);
    return Promise.resolve();
  }

  /** Soft delete (data-model.md §2) — history joins keep the name. */
  remove(id: string): Promise<void> {
    const ts = toEpochSeconds(this.now());
    this.db
      .prepare('UPDATE subjects SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(ts, ts, id);
    return Promise.resolve();
  }

  list(opts: { archived?: boolean } = {}): Promise<SubjectRow[]> {
    const rows = this.db
      .prepare(
        `SELECT id, name, color, source, source_name, archived, created_at
         FROM subjects WHERE deleted_at IS NULL AND archived = ?
         ORDER BY created_at DESC, id DESC`,
      )
      .all<Raw>((opts.archived ?? false) ? 1 : 0);
    return Promise.resolve(rows.map(map));
  }
}
```

- [ ] **Step 5: Run tests** → Expected: 8 passed. Then `npx tsc --build --force && npx eslint .`.

- [ ] **Step 6: Commit**

```bash
git add desktop/packages/core/src/data desktop/packages/core/test/data && git commit -m "feat(v3): port SubjectRepository with the repository port interfaces"
```

---

### Task 6: `SessionRepository` — writes, immutability, crash recovery, history

**Files:**
- Modify: `desktop/packages/core/src/data/ports.ts` (add `SessionRepository`, `HistoryEntry`)
- Create: `desktop/packages/core/src/data/session-repository.ts`
- Test: `desktop/packages/core/test/data/session-repository.test.ts`

**Interfaces:**
- Consumes: `ActiveSession`, `Database`, `localUserId`, `msToSeconds`, `toEpochSeconds`
- Produces:
  ```ts
  interface HistoryEntry { sessionId: string; subjectName: string; startedAt: Date;
    actualDurationS: number; endReason: string | null }
  interface SessionRepository {
    insertStarted(s: ActiveSession): Promise<void>;
    updatePausedDuration(id: string, totalPausedMs: number): Promise<void>;
    end(a: { id: string; endedAt: Date; actualDurationMs: number; totalPausedMs: number }): Promise<void>;
    recoverCrashedSessions(): Promise<number>;
    listHistory(): Promise<HistoryEntry[]>;
  }
  class SqliteSessionRepository implements SessionRepository { constructor(db: Database, now?: () => Date) }
  ```

- [ ] **Step 1: Write the failing test** (mirrors `session_repository_test.dart` in full)

```ts
import { afterEach, beforeEach, expect, test } from 'vitest';
import { ActiveSession } from '../../src/domain/active-session.js';
import { SqliteSessionRepository } from '../../src/data/session-repository.js';
import { SqliteSubjectRepository } from '../../src/data/subject-repository.js';
import { ensureLocalUser } from '../../src/db/local-user.js';
import { localUserId } from '../../src/ids.js';
import { toEpochSeconds } from '../../src/time.js';
import type { Database } from '../../src/db/connection.js';
import { fixedClock, freshDb } from '../support/fixture.js';

const t0 = new Date('2026-07-26T10:00:00.000Z');
const at = (m: number): Date => new Date(t0.getTime() + m * 60_000);
const MIN = 60_000;

let db: Database;
let repo: SqliteSessionRepository;
let subjectId: string;
const clock = fixedClock(t0);

beforeEach(async () => {
  db = freshDb();
  ensureLocalUser(db);
  subjectId = await new SqliteSubjectRepository(db, clock.now).create({ name: 'Physics' });
  repo = new SqliteSessionRepository(db, clock.now);
});
afterEach(() => db.close());

const start = (id = 'sess-1', startedAt = t0): ActiveSession =>
  ActiveSession.start({ id, subjectId, startedAt });

const row = (id = 'sess-1'): Record<string, unknown> | undefined =>
  db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);

/** Seeds a session left open by a crash, at a chosen last-write watermark. */
function seedOpenSession(id: string, a: { pausedS?: number; updatedAt: Date }): void {
  db.prepare(
    `INSERT INTO sessions (id, user_id, subject_id, mode, started_at,
                           paused_duration_s, created_at, updated_at)
     VALUES (?, ?, ?, 'plain', ?, ?, ?, ?)`,
  ).run(id, localUserId, subjectId, toEpochSeconds(t0), a.pausedS ?? 0,
    toEpochSeconds(t0), toEpochSeconds(a.updatedAt));
}

test('a started session is persisted in progress and absent from history', async () => {
  await repo.insertStarted(start());
  const r = row();
  expect(r?.['ended_at']).toBeNull();
  expect(r?.['mode']).toBe('plain');
  expect(r?.['started_at']).toBe(toEpochSeconds(t0));
  expect(await repo.listHistory()).toEqual([]);
});

test('insertStarted records the session mode', async () => {
  await repo.insertStarted(
    ActiveSession.start({ id: 'sess-f', subjectId, startedAt: t0, mode: 'focused' }),
  );
  expect(row('sess-f')?.['mode']).toBe('focused');
});

test('ending writes duration fields and end_reason user_ended', async () => {
  const s = start().pause(at(10)).resume(at(12));
  await repo.insertStarted(s);
  const endAt = at(30);
  await repo.end({
    id: s.id, endedAt: endAt,
    actualDurationMs: s.elapsedMs(endAt), totalPausedMs: s.totalPausedMs(endAt),
  });
  const r = row();
  expect(r?.['actual_duration_s']).toBe(28 * 60);
  expect(r?.['paused_duration_s']).toBe(2 * 60);
  expect(r?.['end_reason']).toBe('user_ended');
  expect(r?.['ended_at']).toBe(toEpochSeconds(endAt));
});

test('an ended session is immutable through every repository write path', async () => {
  const s = start().pause(at(10)).resume(at(12));
  await repo.insertStarted(s);
  const endAt = at(30);
  await repo.end({
    id: s.id, endedAt: endAt,
    actualDurationMs: s.elapsedMs(endAt), totalPausedMs: s.totalPausedMs(endAt),
  });
  const before = row();

  // Every write path, replayed against the ended row. The AND ended_at IS NULL
  // guards must make all three no-ops; deleting one guard turns this red.
  await repo.updatePausedDuration(s.id, 9 * 3600_000);
  await repo.end({
    id: s.id, endedAt: at(90), actualDurationMs: 9 * 3600_000, totalPausedMs: 9 * 3600_000,
  });
  await repo.recoverCrashedSessions();

  expect(row()).toEqual(before); // column-identical, every column compared
});

test('updatePausedDuration advances the updated_at watermark on a live session', async () => {
  // architecture.md §3.4: state is persisted on EVERY change. Pause leaves the
  // accumulated value unchanged, so updated_at is the only observable effect —
  // and it is exactly what makes crash recovery exact for a paused session.
  await repo.insertStarted(start());
  const before = row()?.['updated_at'];
  clock.set(at(10));
  await repo.updatePausedDuration('sess-1', 0);
  expect(row()?.['updated_at']).toBe(toEpochSeconds(at(10)));
  expect(row()?.['updated_at']).not.toBe(before);
});

test('history lists ended sessions newest first with the subject name', async () => {
  for (const [id, offset] of [['a', 0], ['b', 60]] as const) {
    const s = ActiveSession.start({ id, subjectId, startedAt: at(offset) });
    await repo.insertStarted(s);
    const endAt = new Date(s.startedAt.getTime() + 25 * MIN);
    await repo.end({
      id, endedAt: endAt, actualDurationMs: s.elapsedMs(endAt), totalPausedMs: 0,
    });
  }
  const history = await repo.listHistory();
  expect(history.map((h) => h.sessionId)).toEqual(['b', 'a']);
  expect(history[0]?.subjectName).toBe('Physics');
  expect(history[0]?.actualDurationS).toBe(25 * 60);
});

test('history keeps the subject name after the subject is archived or deleted', async () => {
  const s = start();
  await repo.insertStarted(s);
  await repo.end({ id: s.id, endedAt: at(30), actualDurationMs: 30 * MIN, totalPausedMs: 0 });
  const subjects = new SqliteSubjectRepository(db, clock.now);
  await subjects.setArchived(subjectId, true);
  expect((await repo.listHistory())[0]?.subjectName).toBe('Physics');
  await subjects.remove(subjectId);
  expect((await repo.listHistory())[0]?.subjectName).toBe('Physics');
});

test('recovery closes open sessions as crashed at their last write', async () => {
  // started at t0, last persisted write (a pause) at t0+30min, 5 minutes of
  // completed pause before that.
  seedOpenSession('open-1', { pausedS: 5 * 60, updatedAt: at(30) });
  expect(await repo.recoverCrashedSessions()).toBe(1);
  const r = row('open-1');
  expect(r?.['end_reason']).toBe('crashed');
  expect(r?.['ended_at']).toBe(toEpochSeconds(at(30)));
  expect(r?.['actual_duration_s']).toBe(25 * 60);
  expect(await repo.recoverCrashedSessions()).toBe(0); // literal idempotency
});

test('recovery clamps a negative computed duration to zero', async () => {
  seedOpenSession('open-2', { pausedS: 60 * 60, updatedAt: at(10) });
  await repo.recoverCrashedSessions();
  expect(row('open-2')?.['actual_duration_s']).toBe(0);
});

test('recovery ignores ended sessions and is idempotent', async () => {
  const s = start();
  await repo.insertStarted(s);
  await repo.end({ id: s.id, endedAt: at(20), actualDurationMs: 20 * MIN, totalPausedMs: 0 });
  const before = row();
  expect(await repo.recoverCrashedSessions()).toBe(0);
  expect(row()).toEqual(before);
});

test('recovered sessions appear in history marked crashed', async () => {
  seedOpenSession('open-3', { updatedAt: at(15) });
  await repo.recoverCrashedSessions();
  const history = await repo.listHistory();
  expect(history).toHaveLength(1);
  expect(history[0]?.endReason).toBe('crashed');
});

test('recovery closes every open session in one pass', async () => {
  // The Dart original only ever seeded one. A loop that returned after the
  // first row would have passed there and fails here.
  seedOpenSession('open-a', { updatedAt: at(10) });
  seedOpenSession('open-b', { updatedAt: at(20) });
  expect(await repo.recoverCrashedSessions()).toBe(2);
  expect(
    db.prepare("SELECT count(*) c FROM sessions WHERE end_reason = 'crashed'")
      .get<{ c: number }>()?.c,
  ).toBe(2);
});
```

- [ ] **Step 2: Run it and see it fail.**

- [ ] **Step 3: Implement `src/data/session-repository.ts`**

```ts
import type { Database } from '../db/connection.js';
import type { ActiveSession } from '../domain/active-session.js';
import { localUserId } from '../ids.js';
import { fromEpochSeconds, msToSeconds, toEpochSeconds } from '../time.js';
import type { HistoryEntry, SessionRepository } from './ports.js';

export class SqliteSessionRepository implements SessionRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  insertStarted(s: ActiveSession): Promise<void> {
    const ts = toEpochSeconds(this.now());
    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, subject_id, mode, started_at,
                               created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(s.id, localUserId, s.subjectId, s.mode, toEpochSeconds(s.startedAt), ts, ts);
    return Promise.resolve();
  }

  /** Guarded: an ended session is immutable (data-model.md §3.4). The guard is
   *  in the SQL, not in the caller — that is the whole point of invariant 3. */
  updatePausedDuration(id: string, totalPausedMs: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE sessions SET paused_duration_s = ?, updated_at = ?
         WHERE id = ? AND ended_at IS NULL`,
      )
      .run(msToSeconds(totalPausedMs), toEpochSeconds(this.now()), id);
    return Promise.resolve();
  }

  /** Guarded: ending is a one-shot closing write (data-model.md §3.4). */
  end(a: {
    id: string; endedAt: Date; actualDurationMs: number; totalPausedMs: number;
  }): Promise<void> {
    this.db
      .prepare(
        `UPDATE sessions
         SET ended_at = ?, actual_duration_s = ?, paused_duration_s = ?,
             end_reason = 'user_ended', updated_at = ?
         WHERE id = ? AND ended_at IS NULL`,
      )
      .run(toEpochSeconds(a.endedAt), msToSeconds(a.actualDurationMs),
        msToSeconds(a.totalPausedMs), toEpochSeconds(this.now()), a.id);
    return Promise.resolve();
  }

  /** Closes out sessions left open by a crash (architecture.md §3.4).
   *  ended_at is the row's last persisted write — an honest lower bound — and
   *  end_reason 'crashed' is the key streak inputs will exclude on. */
  recoverCrashedSessions(): Promise<number> {
    const count = this.db.transaction(() => {
      const open = this.db
        .prepare(
          `SELECT id, started_at, updated_at, paused_duration_s
           FROM sessions WHERE ended_at IS NULL`,
        )
        .all<{ id: string; started_at: number; updated_at: number; paused_duration_s: number }>();
      const nowS = toEpochSeconds(this.now());
      for (const r of open) {
        const active = r.updated_at - r.started_at - r.paused_duration_s;
        this.db
          .prepare(
            `UPDATE sessions
             SET ended_at = ?, actual_duration_s = ?, end_reason = 'crashed', updated_at = ?
             WHERE id = ? AND ended_at IS NULL`,
          )
          .run(r.updated_at, Math.max(0, active), nowS, r.id);
      }
      return open.length;
    });
    return Promise.resolve(count);
  }

  listHistory(): Promise<HistoryEntry[]> {
    // INNER JOIN without a deleted_at filter on subjects: a soft-deleted or
    // archived subject must still name its sessions in history.
    const rows = this.db
      .prepare(
        `SELECT s.id, sub.name AS subject_name, s.started_at,
                s.actual_duration_s, s.end_reason
         FROM sessions s
         JOIN subjects sub ON sub.id = s.subject_id
         WHERE s.deleted_at IS NULL AND s.ended_at IS NOT NULL
         ORDER BY s.started_at DESC, s.id DESC`,
      )
      .all<{
        id: string; subject_name: string; started_at: number;
        actual_duration_s: number | null; end_reason: string | null;
      }>();
    return Promise.resolve(
      rows.map((r) => ({
        sessionId: r.id,
        subjectName: r.subject_name,
        startedAt: fromEpochSeconds(r.started_at),
        actualDurationS: r.actual_duration_s ?? 0,
        endReason: r.end_reason,
      })),
    );
  }
}
```

- [ ] **Step 4: Run tests** → Expected: 12 passed. Then typecheck and lint.

- [ ] **Step 5: Probe the immutability guard RED (mandatory)**

Remove `AND ended_at IS NULL` from `updatePausedDuration`.
Run: `npx vitest run test/data/session-repository.test.ts`
Expected: FAIL on "an ended session is immutable through every repository write path".
**Record the output in the PR.** Restore the guard and re-run green.

- [ ] **Step 6: Commit**

```bash
git add desktop/packages/core/src/data desktop/packages/core/test/data && git commit -m "feat(v3): port SessionRepository - guarded writes, crash recovery, history"
```

---

### Task 7: `InterruptionRepository` — the privacy-critical writer

**Files:**
- Modify: `desktop/packages/core/src/data/ports.ts`
- Create: `desktop/packages/core/src/data/interruption-repository.ts`
- Test: `desktop/packages/core/test/data/interruption-repository.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const KIND_MANUAL_PAUSE = 'manual_pause';
  const KIND_SELF_REPORTED = 'self_reported';
  interface InterruptionEntry { kind: string; occurredAt: Date; durationS: number | null }
  interface InterruptionRepository {
    logSessionEvent(a: { sessionId: string; kind: string; occurredAt: Date;
      durationS?: number | null; blocked?: boolean }): Promise<void>;
    logPause(a: { sessionId: string; pauseStartedAt: Date; resumedAt: Date }): Promise<void>;
    logSelfReport(a: { sessionId: string; occurredAt: Date }): Promise<void>;
    countSelfReports(sessionId: string): Promise<number>;
  }
  class SqliteInterruptionRepository implements InterruptionRepository { constructor(db: Database, now?: () => Date) }
  ```

- [ ] **Step 1: Write the failing test** (mirrors `interruption_repository_test.dart`)

```ts
import { afterEach, beforeEach, expect, test } from 'vitest';
import { ActiveSession } from '../../src/domain/active-session.js';
import { SqliteInterruptionRepository } from '../../src/data/interruption-repository.js';
import { SqliteSessionRepository } from '../../src/data/session-repository.js';
import { SqliteSubjectRepository } from '../../src/data/subject-repository.js';
import { ensureLocalUser } from '../../src/db/local-user.js';
import { ValidationError } from '../../src/errors.js';
import { toEpochSeconds } from '../../src/time.js';
import type { Database } from '../../src/db/connection.js';
import { fixedClock, freshDb } from '../support/fixture.js';

const t0 = new Date('2026-07-26T09:00:00.000Z');
const at = (m: number): Date => new Date(t0.getTime() + m * 60_000);

let db: Database;
let repo: SqliteInterruptionRepository;
const sessionId = 'sess-1';
const clock = fixedClock(t0);

beforeEach(async () => {
  db = freshDb();
  ensureLocalUser(db);
  const subjectId = await new SqliteSubjectRepository(db, clock.now).create({ name: 'Physics' });
  await new SqliteSessionRepository(db, clock.now).insertStarted(
    ActiveSession.start({ id: sessionId, subjectId, startedAt: t0 }),
  );
  repo = new SqliteInterruptionRepository(db, clock.now);
});
afterEach(() => db.close());

const rows = (): Record<string, unknown>[] =>
  db.prepare('SELECT * FROM interruptions ORDER BY id').all();

test('logPause writes one manual_pause at the pause moment, blocked false', async () => {
  await repo.logPause({ sessionId, pauseStartedAt: at(10), resumedAt: at(12) });
  const all = rows();
  expect(all).toHaveLength(1); // exact count — isNotEmpty would miss a duplicate
  const r = all[0];
  // Exact wire value: the column has no CHECK, so this string IS the contract.
  expect(r?.['kind']).toBe('manual_pause');
  expect(r?.['blocked']).toBe(0);
  expect(r?.['detail']).toBeNull();
  expect(r?.['duration_s']).toBe(120);
  expect(r?.['occurred_at'], 'occurred_at is when the pause STARTED')
    .toBe(toEpochSeconds(at(10)));
});

test('logPause clamps a negative span to zero', async () => {
  // DateTime.now() is not monotonic: an NTP correction mid-pause must not
  // store a negative duration (same convention as crash recovery).
  await repo.logPause({ sessionId, pauseStartedAt: at(12), resumedAt: at(10) });
  expect(rows()[0]?.['duration_s']).toBe(0);
});

test('logSelfReport writes one self_reported row with no duration', async () => {
  await repo.logSelfReport({ sessionId, occurredAt: t0 });
  const r = rows()[0];
  expect(r?.['kind']).toBe('self_reported');
  expect(r?.['duration_s']).toBeNull();
  expect(r?.['blocked']).toBe(0);
  expect(r?.['detail']).toBeNull();
  expect(r?.['occurred_at']).toBe(toEpochSeconds(t0));
});

test('blocked is carried by production code, not by the column default', async () => {
  // Asserting only `false` passes even if the writer never mentions the column
  // (it defaults to 0 in schema v1), so the true branch has to be pinned too.
  await repo.logSessionEvent({
    sessionId, kind: 'exit_attempt', occurredAt: t0, blocked: true,
  });
  expect(rows()[0]?.['blocked']).toBe(1);
});

test('kind cannot carry app identity, only a bare token', async () => {
  // The privacy line names `detail`, but `kind` is the other free-text column
  // on this path: 'app_switch:chrome.exe' would be surveillance that no
  // detail-shaped guard could see.
  for (const smuggled of [
    'app_switch:chrome.exe', 'Discord', 'app switch', 'app-switch',
    'notification(Slack)', 'app_switch chrome', '', 'APP_SWITCH',
  ]) {
    await expect(
      repo.logSessionEvent({ sessionId, kind: smuggled, occurredAt: t0 }),
      `"${smuggled}" must be refused`,
    ).rejects.toThrow(ValidationError);
  }
  expect(rows()).toEqual([]);
  // Every documented kind still passes — a validator that refused everything
  // would satisfy the loop above.
  for (const kind of [
    'manual_pause', 'self_reported', 'app_switch', 'exit_attempt',
    'notification', 'idle_timeout', 'device_locked',
  ]) {
    await repo.logSessionEvent({ sessionId, kind, occurredAt: t0 });
  }
  expect(rows()).toHaveLength(7);
});

test("countSelfReports counts only this session's self reports", async () => {
  expect(await repo.countSelfReports(sessionId)).toBe(0);
  await repo.logSelfReport({ sessionId, occurredAt: t0 });
  await repo.logPause({ sessionId, pauseStartedAt: t0, resumedAt: t0 });
  expect(await repo.countSelfReports(sessionId), 'a pause is not a self report').toBe(1);
});

test('countSelfReports ignores other sessions and soft-deleted rows', async () => {
  await repo.logSelfReport({ sessionId, occurredAt: t0 });
  db.prepare('UPDATE interruptions SET deleted_at = ?').run(1);
  expect(await repo.countSelfReports(sessionId)).toBe(0);
});

test('the writer refuses an unknown session id', async () => {
  // The FK is the last line of defence; this proves it is live on this path.
  await expect(
    repo.logSelfReport({ sessionId: 'no-such-session', occurredAt: t0 }),
  ).rejects.toThrow(/FOREIGN KEY constraint failed/);
});
```

- [ ] **Step 2: Run it and see it fail.**

- [ ] **Step 3: Implement `src/data/interruption-repository.ts`**

```ts
import type { Database } from '../db/connection.js';
import { ValidationError } from '../errors.js';
import { newId } from '../ids.js';
import { toEpochSeconds } from '../time.js';
import type { InterruptionRepository } from './ports.js';

/** Wire values for `interruptions.kind`. The column has no CHECK in schema v1,
 *  so these strings ARE the contract — renaming one silently orphans history. */
export const KIND_MANUAL_PAUSE = 'manual_pause';
export const KIND_SELF_REPORTED = 'self_reported';

const BARE_TOKEN = /^[a-z_]+$/;

/** The ONLY writer of the interruptions table — enforced by
 *  test/db/write-confinement.test.ts.
 *
 *  PRIVACY (data-model.md §3.6, focus-enforcement.md §7): log the *kind*, never
 *  the *identity*. Record that an app switch happened, not which app was
 *  opened. No method here accepts free-form context, so app identity is not
 *  representable through this API; Phase 3's first such write has to widen a
 *  signature in this file deliberately, in front of a reviewer. */
export class SqliteInterruptionRepository implements InterruptionRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The single write path. `blocked` is explicit rather than left to the
   *  column default so production code — not the schema — decides it. */
  logSessionEvent(a: {
    sessionId: string; kind: string; occurredAt: Date;
    durationS?: number | null; blocked?: boolean;
  }): Promise<void> {
    // focus-enforcement.md §7's vocabulary is bare tokens. Without this the
    // discriminator itself could smuggle identity ('app_switch:chrome.exe') —
    // the one free-text column left on this write path.
    if (!BARE_TOKEN.test(a.kind)) {
      throw new ValidationError(
        `kind "${a.kind}" must be a bare token — the log records the kind, never the identity`,
      );
    }
    const ts = toEpochSeconds(this.now());
    this.db
      .prepare(
        `INSERT INTO interruptions (id, session_id, kind, occurred_at, duration_s,
                                    blocked, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(newId(), a.sessionId, a.kind, toEpochSeconds(a.occurredAt),
        a.durationS ?? null, a.blocked === true ? 1 : 0, ts, ts);
    return Promise.resolve();
  }

  /** One append-only row per COMPLETED pause: `occurred_at` is when the pause
   *  began, `duration_s` how long it lasted. Never insert-then-update — that
   *  would break the union-dedup sync strategy (V3 spec §4.4). The span is
   *  clamped because the wall clock is not monotonic. */
  logPause(a: { sessionId: string; pauseStartedAt: Date; resumedAt: Date }): Promise<void> {
    const spanS = Math.trunc((a.resumedAt.getTime() - a.pauseStartedAt.getTime()) / 1000);
    return this.logSessionEvent({
      sessionId: a.sessionId,
      kind: KIND_MANUAL_PAUSE,
      occurredAt: a.pauseStartedAt,
      durationS: Math.max(0, spanS),
    });
  }

  /** The one-tap distraction button (masterplan §7 Phase 2, R3). Records only
   *  that the user was distracted — never by what. */
  logSelfReport(a: { sessionId: string; occurredAt: Date }): Promise<void> {
    return this.logSessionEvent({
      sessionId: a.sessionId, kind: KIND_SELF_REPORTED, occurredAt: a.occurredAt,
    });
  }

  countSelfReports(sessionId: string): Promise<number> {
    const r = this.db
      .prepare(
        `SELECT count(*) AS c FROM interruptions
         WHERE session_id = ? AND kind = ? AND deleted_at IS NULL`,
      )
      .get<{ c: number }>(sessionId, KIND_SELF_REPORTED);
    return Promise.resolve(r?.c ?? 0);
  }
}
```

- [ ] **Step 4: Run tests** → Expected: 8 passed. Then typecheck and lint.

- [ ] **Step 5: Commit**

```bash
git add desktop/packages/core/src/data desktop/packages/core/test/data && git commit -m "feat(v3): port InterruptionRepository - the single privacy-guarded writer"
```

---

### Task 8: `SurveyRepository`

**Files:**
- Modify: `desktop/packages/core/src/data/ports.ts`
- Create: `desktop/packages/core/src/data/survey-repository.ts`
- Test: `desktop/packages/core/test/data/survey-repository.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface SurveyRepository {
    save(a: { sessionId: string; focusRating: number; comprehensionRating?: number | null;
      difficultyRating?: number | null; note?: string | null }): Promise<void>;
  }
  class SqliteSurveyRepository implements SurveyRepository { constructor(db: Database, now?: () => Date) }
  ```

- [ ] **Step 1: Write the failing test** (mirrors `survey_repository_test.dart`)

```ts
import { afterEach, beforeEach, expect, test } from 'vitest';
import { ActiveSession } from '../../src/domain/active-session.js';
import { SqliteSessionRepository } from '../../src/data/session-repository.js';
import { SqliteSubjectRepository } from '../../src/data/subject-repository.js';
import { SqliteSurveyRepository } from '../../src/data/survey-repository.js';
import { ensureLocalUser } from '../../src/db/local-user.js';
import { localUserId } from '../../src/ids.js';
import { DomainStateError, ValidationError } from '../../src/errors.js';
import { toEpochSeconds } from '../../src/time.js';
import type { Database } from '../../src/db/connection.js';
import { fixedClock, freshDb } from '../support/fixture.js';

const t0 = new Date('2026-07-26T09:00:00.000Z');
const at = (m: number): Date => new Date(t0.getTime() + m * 60_000);

let db: Database;
let repo: SqliteSurveyRepository;
let sessions: SqliteSessionRepository;
let subjectId: string;
const endedId = 'ended-1';
const runningId = 'running-1';
const clock = fixedClock(t0);

const surveys = (): Record<string, unknown>[] =>
  db.prepare('SELECT * FROM session_surveys').all();

beforeEach(async () => {
  db = freshDb();
  ensureLocalUser(db);
  subjectId = await new SqliteSubjectRepository(db, clock.now).create({ name: 'Physics' });
  sessions = new SqliteSessionRepository(db, clock.now);
  const ended = ActiveSession.start({ id: endedId, subjectId, startedAt: t0 });
  await sessions.insertStarted(ended);
  await sessions.end({
    id: endedId, endedAt: at(30), actualDurationMs: 30 * 60_000, totalPausedMs: 0,
  });
  await sessions.insertStarted(ActiveSession.start({ id: runningId, subjectId, startedAt: t0 }));
  repo = new SqliteSurveyRepository(db, clock.now);
});
afterEach(() => db.close());

test('a saved survey round-trips every field and leaves the session identical', async () => {
  const before = db.prepare('SELECT * FROM sessions WHERE id = ?').get(endedId);
  await repo.save({
    sessionId: endedId, focusRating: 4, comprehensionRating: 2,
    difficultyRating: 5, note: 'derivations were slow',
  });
  const s = surveys()[0];
  // Asymmetric on purpose: 3/3/3 could not catch two swapped columns.
  expect([s?.['focus_rating'], s?.['comprehension_rating'], s?.['difficulty_rating']])
    .toEqual([4, 2, 5]);
  expect(s?.['note']).toBe('derivations were slow');
  expect(s?.['session_id']).toBe(endedId);
  expect(s?.['deleted_at']).toBeNull();
  // A survey must not touch the session: updated_at is the crash-recovery
  // watermark, and an ended session is immutable.
  expect(db.prepare('SELECT * FROM sessions WHERE id = ?').get(endedId)).toEqual(before);
});

test('optional ratings and a blank note are stored as null', async () => {
  await repo.save({ sessionId: endedId, focusRating: 3, note: '   ' });
  const s = surveys()[0];
  expect(s?.['note'], 'an untouched field yields "", which must not become a note').toBeNull();
  expect(s?.['comprehension_rating']).toBeNull();
  expect(s?.['difficulty_rating']).toBeNull();
});

test('refuses a survey for a recovered crashed session, writing nothing', async () => {
  db.prepare(
    `INSERT INTO sessions (id, user_id, subject_id, mode, started_at, created_at, updated_at)
     VALUES ('open-1', ?, ?, 'plain', ?, ?, ?)`,
  ).run(localUserId, subjectId, toEpochSeconds(t0), toEpochSeconds(t0), toEpochSeconds(at(5)));
  await sessions.recoverCrashedSessions();
  await expect(repo.save({ sessionId: 'open-1', focusRating: 5 }))
    .rejects.toThrow(DomainStateError);
  expect(surveys(), 'a crashed session must never weight a qualified day').toEqual([]);
});

test('refuses a survey for a session that has not ended', async () => {
  await expect(repo.save({ sessionId: runningId, focusRating: 5 }))
    .rejects.toThrow(DomainStateError);
  expect(surveys()).toEqual([]);
});

test('refuses a survey for an unknown session', async () => {
  await expect(repo.save({ sessionId: 'nope', focusRating: 5 }))
    .rejects.toThrow(DomainStateError);
  expect(surveys()).toEqual([]);
});

test('refuses a survey for a soft-deleted session', async () => {
  db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run(1, endedId);
  await expect(repo.save({ sessionId: endedId, focusRating: 5 }))
    .rejects.toThrow(DomainStateError);
  expect(surveys()).toEqual([]);
});

test('refuses out-of-range ratings before touching the database', async () => {
  for (const bad of [0, 6, -1, 2.5, Number.NaN]) {
    await expect(repo.save({ sessionId: endedId, focusRating: bad })).rejects
      .toThrow(ValidationError);
  }
  await expect(
    repo.save({ sessionId: endedId, focusRating: 3, comprehensionRating: 9 }),
  ).rejects.toThrow(ValidationError);
  await expect(
    repo.save({ sessionId: endedId, focusRating: 3, difficultyRating: 0 }),
  ).rejects.toThrow(ValidationError);
  expect(surveys()).toEqual([]);
});

test('is insert-only: a second survey for the same session is refused', async () => {
  // session_id is UNIQUE at column level and SQLite's implicit unique index
  // counts tombstones, so a survey must never be soft-deleted or upserted.
  await repo.save({ sessionId: endedId, focusRating: 4 });
  await expect(repo.save({ sessionId: endedId, focusRating: 5 }))
    .rejects.toThrow(/UNIQUE constraint failed/);
  expect(surveys()).toHaveLength(1);
  expect(surveys()[0]?.['focus_rating'], 'the first rating stands').toBe(4);
});
```

- [ ] **Step 2: Run it and see it fail.**

- [ ] **Step 3: Implement `src/data/survey-repository.ts`**

```ts
import type { Database } from '../db/connection.js';
import { DomainStateError, ValidationError } from '../errors.js';
import { newId } from '../ids.js';
import { toEpochSeconds } from '../time.js';
import type { SurveyRepository } from './ports.js';

/** Writes the post-session survey — the app's core signal (data-model.md §3.5).
 *
 *  INSERT-ONLY, and two one-way doors under the frozen schema explain why there
 *  is no upsert and no soft delete:
 *   * `session_id` is UNIQUE at column level, so SQLite's implicit unique index
 *     counts tombstones: a soft-deleted survey would permanently block
 *     re-rating that session, and the freeze forbids dropping the constraint.
 *   * Any future backfill (deferred decision D5) must therefore be an explicit
 *     UPSERT on the session_id conflict target, decided deliberately. */
const SURVEYABLE_END_REASONS = new Set(['completed', 'user_ended']);

export class SqliteSurveyRepository implements SurveyRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  save(a: {
    sessionId: string; focusRating: number; comprehensionRating?: number | null;
    difficultyRating?: number | null; note?: string | null;
  }): Promise<void> {
    checkRange('focusRating', a.focusRating);
    checkRange('comprehensionRating', a.comprehensionRating ?? null);
    checkRange('difficultyRating', a.difficultyRating ?? null);
    const trimmed = a.note?.trim() ?? '';

    this.db.transaction(() => {
      // Read inside the transaction so this cannot race recoverCrashedSessions.
      const session = this.db
        .prepare('SELECT deleted_at, ended_at, end_reason FROM sessions WHERE id = ?')
        .get<{ deleted_at: number | null; ended_at: number | null; end_reason: string | null }>(
          a.sessionId,
        );
      if (
        session === undefined ||
        session.deleted_at !== null ||
        session.ended_at === null ||
        session.end_reason === null ||
        !SURVEYABLE_END_REASONS.has(session.end_reason)
      ) {
        throw new DomainStateError(
          `only a normally-ended session can be surveyed (end_reason: ` +
            `${session?.end_reason ?? 'no such session'}). A crashed session cannot be ` +
            `trusted and must never weight a qualified day (data-model.md §5.1).`,
        );
      }
      const ts = toEpochSeconds(this.now());
      this.db
        .prepare(
          `INSERT INTO session_surveys (id, session_id, focus_rating, comprehension_rating,
                                        difficulty_rating, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(newId(), a.sessionId, a.focusRating, a.comprehensionRating ?? null,
          a.difficultyRating ?? null, trimmed === '' ? null : trimmed, ts, ts);
    });
    return Promise.resolve();
  }
}

/** Validated in TypeScript rather than relying on the CHECK constraints, so the
 *  failure is a typed ValidationError at the boundary rather than a raw SQLite
 *  error surfaced differently by each binding. */
function checkRange(name: string, value: number | null): void {
  if (value === null) return;
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new ValidationError(`${name} must be an integer 1..5, got ${String(value)}`);
  }
}
```

- [ ] **Step 4: Run tests** → Expected: 8 passed. Then typecheck and lint.

- [ ] **Step 5: Probe the refusal guard RED (mandatory)**

Replace the `if (...)` refusal block with `if (false)`.
Run: `npx vitest run test/data/survey-repository.test.ts`
Expected: FAIL on all four refusal tests. **Record the output in the PR.** Restore and re-run green.

- [ ] **Step 6: Commit**

```bash
git add desktop/packages/core/src/data desktop/packages/core/test/data && git commit -m "feat(v3): port SurveyRepository - insert-only, normally-ended sessions only"
```

---

### Task 9: `loadSessionDetail` and the public surface

**Files:**
- Modify: `desktop/packages/core/src/data/session-repository.ts`,
  `desktop/packages/core/src/data/ports.ts`
- Create: `desktop/packages/core/src/index.ts`
- Test: append to `desktop/packages/core/test/data/session-repository.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface SessionDetailView { interruptions: InterruptionEntry[];
    focusRating: number | null; comprehensionRating: number | null;
    difficultyRating: number | null; note: string | null; hasSurvey: boolean }
  // added to SessionRepository:
  loadSessionDetail(sessionId: string): Promise<SessionDetailView>;
  ```

- [ ] **Step 1: Write the failing test** (append to the session-repository test file)

```ts
test('loadSessionDetail returns the survey and the interruption log in order', async () => {
  const s = start();
  await repo.insertStarted(s);
  await repo.end({ id: s.id, endedAt: at(30), actualDurationMs: 30 * MIN, totalPausedMs: 0 });
  const log = new SqliteInterruptionRepository(db, clock.now);
  // Same second on purpose: occurred_at has second precision, so the id
  // tiebreak (UUIDv7, time-ordered) is what makes this deterministic.
  await log.logSelfReport({ sessionId: s.id, occurredAt: at(5) });
  await log.logSelfReport({ sessionId: s.id, occurredAt: at(5) });
  await log.logPause({ sessionId: s.id, pauseStartedAt: at(1), resumedAt: at(3) });
  await new SqliteSurveyRepository(db, clock.now).save({
    sessionId: s.id, focusRating: 4, comprehensionRating: 2, note: 'ok',
  });

  const detail = await repo.loadSessionDetail(s.id);
  expect(detail.hasSurvey).toBe(true);
  expect([detail.focusRating, detail.comprehensionRating, detail.difficultyRating])
    .toEqual([4, 2, null]);
  expect(detail.note).toBe('ok');
  expect(detail.interruptions.map((i) => i.kind))
    .toEqual(['manual_pause', 'self_reported', 'self_reported']);
  expect(detail.interruptions[0]?.durationS).toBe(120);
  expect(detail.interruptions[0]?.occurredAt.getTime()).toBe(at(1).getTime());
});

test('loadSessionDetail on an unrated session reports no survey', async () => {
  const s = start();
  await repo.insertStarted(s);
  await repo.end({ id: s.id, endedAt: at(30), actualDurationMs: 30 * MIN, totalPausedMs: 0 });
  const detail = await repo.loadSessionDetail(s.id);
  expect(detail.hasSurvey).toBe(false);
  expect(detail.focusRating).toBeNull();
  expect(detail.interruptions).toEqual([]);
});

test('loadSessionDetail excludes soft-deleted surveys and interruptions', async () => {
  const s = start();
  await repo.insertStarted(s);
  await repo.end({ id: s.id, endedAt: at(30), actualDurationMs: 30 * MIN, totalPausedMs: 0 });
  await new SqliteInterruptionRepository(db, clock.now)
    .logSelfReport({ sessionId: s.id, occurredAt: at(5) });
  await new SqliteSurveyRepository(db, clock.now).save({ sessionId: s.id, focusRating: 4 });
  db.prepare('UPDATE interruptions SET deleted_at = ?').run(1);
  db.prepare('UPDATE session_surveys SET deleted_at = ?').run(1);
  const detail = await repo.loadSessionDetail(s.id);
  expect(detail.interruptions).toEqual([]);
  expect(detail.hasSurvey).toBe(false);
});
```

Add the two imports at the top of that file:
```ts
import { SqliteInterruptionRepository } from '../../src/data/interruption-repository.js';
import { SqliteSurveyRepository } from '../../src/data/survey-repository.js';
```

- [ ] **Step 2: Run it and see it fail.**

- [ ] **Step 3: Implement `loadSessionDetail` on `SqliteSessionRepository`**

```ts
  /** Everything the Stats inline expansion shows for one session: its survey
   *  (if it was rated) and its interruption log. */
  loadSessionDetail(sessionId: string): Promise<SessionDetailView> {
    const survey = this.db
      .prepare(
        `SELECT focus_rating, comprehension_rating, difficulty_rating, note
         FROM session_surveys WHERE session_id = ? AND deleted_at IS NULL`,
      )
      .get<{
        focus_rating: number; comprehension_rating: number | null;
        difficulty_rating: number | null; note: string | null;
      }>(sessionId);
    // Ordered by id as well as time: occurred_at is epoch SECONDS, so two
    // events in the same second would otherwise sort arbitrarily between runs.
    // newId() is UUIDv7, which is lexicographically time-ordered.
    const rows = this.db
      .prepare(
        `SELECT kind, occurred_at, duration_s FROM interruptions
         WHERE session_id = ? AND deleted_at IS NULL
         ORDER BY occurred_at ASC, id ASC`,
      )
      .all<{ kind: string; occurred_at: number; duration_s: number | null }>(sessionId);
    return Promise.resolve({
      interruptions: rows.map((r) => ({
        kind: r.kind,
        occurredAt: fromEpochSeconds(r.occurred_at),
        durationS: r.duration_s,
      })),
      focusRating: survey?.focus_rating ?? null,
      comprehensionRating: survey?.comprehension_rating ?? null,
      difficultyRating: survey?.difficulty_rating ?? null,
      note: survey?.note ?? null,
      hasSurvey: survey !== undefined,
    });
  }
```

- [ ] **Step 4: Write `src/index.ts`** — the package's public surface

```ts
export { ActiveSession } from './domain/active-session.js';
export { DomainStateError, ValidationError } from './errors.js';
export { localUserId, newId } from './ids.js';
export { fromEpochSeconds, msToSeconds, toEpochSeconds } from './time.js';
export { openDatabase, readSchemaSql, type Database } from './db/connection.js';
export { nodeSqliteDriver, type SqliteDriver, type SqliteStatement } from './db/driver.js';
export { ensureLocalUser } from './db/local-user.js';
export type {
  HistoryEntry, InterruptionEntry, InterruptionRepository, SessionDetailView,
  SessionRepository, SubjectRepository, SubjectRow, SurveyRepository,
} from './data/ports.js';
export { SqliteSubjectRepository } from './data/subject-repository.js';
export { SqliteSessionRepository } from './data/session-repository.js';
export {
  KIND_MANUAL_PAUSE, KIND_SELF_REPORTED, SqliteInterruptionRepository,
} from './data/interruption-repository.js';
export { SqliteSurveyRepository } from './data/survey-repository.js';
```

- [ ] **Step 5: Run the whole suite** — `npx vitest run` → Expected: all green. Typecheck, lint.

- [ ] **Step 6: Commit**

```bash
git add desktop/packages/core/src desktop/packages/core/test && git commit -m "feat(v3): session detail read model and the core package surface"
```

---

### Task 10: The privacy write-confinement guard

**Files:**
- Test: `desktop/packages/core/test/db/write-confinement.test.ts`

**Interfaces:** consumes nothing at runtime — it scans source text.

This is the port of `app-flutter/test/core/db/write_confinement_test.dart`, upgraded in one way:
it scans **every package under `desktop/packages/*/src`**, not just `core`, so the `ui` and `app`
packages are covered the moment they exist rather than needing this test widened.

- [ ] **Step 1: Write the failing test**

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// data-model.md §3.6 / focus-enforcement.md §7:
//   "detail records *kind*, never *identity*. Store `app_switch`, not the name
//    of the app switched to."
//
// Phase 2's exit criterion 3 cannot honestly be met by asserting rows have
// detail == null: there is no window title to record yet, so such an assertion
// passes on code that COULD NOT leak and never exercises the Phase 3
// app_switch writer that actually risks it — the unfailable-test class the V2
// post-mortem calls its most expensive lesson.
//
// Instead this confines the table: exactly one file may reach it to write, one
// may read it, and the writer's API cannot express identity. It forbids
// REACHING the table rather than enumerating write syntaxes.
const PACKAGES = fileURLToPath(new URL('../../../', import.meta.url)); // desktop/packages/

const OWNER = join('core', 'src', 'data', 'interruption-repository.ts');
// The one legal reader: SessionRepository.loadSessionDetail selects the log for
// the Stats expansion. An exact path, not a pattern — a new reader has to be
// added here deliberately, in front of a reviewer.
const READERS = new Set([join('core', 'src', 'data', 'session-repository.ts')]);

// Any SQL statement naming the table, wherever it is built. Matches SQL-shaped
// proximity so ordinary prose mentioning the log does not trip it.
const SQL_REACH =
  /(?:insert|update|delete|replace|into|from|join)\b[^;]{0,160}?interruptions/is;

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts') || entry.endsWith('.vue')) out.push(full);
    }
  };
  for (const pkg of readdirSync(PACKAGES)) {
    const src = join(PACKAGES, pkg, 'src');
    try {
      if (statSync(src).isDirectory()) walk(src);
    } catch {
      /* a package without src/ yet */
    }
  }
  return out;
}

test('only the interruption repository reaches the interruptions table', () => {
  const offenders: string[] = [];
  let scanned = 0;
  let ownerSeen = false;

  for (const file of sourceFiles()) {
    scanned++;
    const rel = relative(PACKAGES, file);
    const source = readFileSync(file, 'utf8');

    if (rel.endsWith(OWNER)) {
      ownerSeen = true;
      // App identity must stay UNREPRESENTABLE in the writer's API. Adding a
      // `detail` parameter has to be a deliberate edit to this named test.
      expect(source.includes('detail'), `app identity must stay unrepresentable in ${OWNER}`)
        .toBe(false);
      continue;
    }
    if ([...READERS].some((r) => rel.endsWith(r))) continue;
    if (SQL_REACH.test(source)) offenders.push(rel.split(sep).join('/'));
  }

  expect(offenders, `the interruptions table may only be reached by ${OWNER}`).toEqual([]);
  expect(ownerSeen, `${OWNER} must exist and have been scanned`).toBe(true);
  // Anti-vacuity: a wrong working directory would make the scan pass having
  // read nothing. The floor sits below the real file count on purpose — it only
  // has to prove the walk ran, so adding files must never require touching it.
  expect(scanned).toBeGreaterThan(8);
});
```

- [ ] **Step 2: Run it** — `npx vitest run test/db/write-confinement.test.ts` → Expected: PASS.

- [ ] **Step 3: Probe it RED three ways (mandatory — this guard is the privacy line)**

| Probe | Edit | Expected failure |
|---|---|---|
| A | Add `detail?: string` to `logSessionEvent`'s parameter object | "app identity must stay unrepresentable" |
| B | Add `const leak = db.prepare('SELECT * FROM interruptions').all();` to `subject-repository.ts` | offenders contains `core/src/data/subject-repository.ts` |
| C | Change `PACKAGES` to a directory with no `src` subtrees | `scanned` floor fails |

Run each, **record the output in the PR**, revert each.

- [ ] **Step 4: Commit**

```bash
git add desktop/packages/core/test/db/write-confinement.test.ts && git commit -m "test(v3): confine the interruptions table to its single writer"
```

---

### Task 11: CI for `desktop/`

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a second job**, leaving the existing `build` (Flutter reference) job untouched

```yaml
  desktop:
    runs-on: windows-latest
    defaults:
      run:
        working-directory: desktop
    steps:
      - uses: actions/checkout@v4
      # node:sqlite is why the floor is Node 25; pinned exactly, as Flutter was.
      - uses: actions/setup-node@v4
        with:
          node-version: '25.7.0'
          cache: npm
          cache-dependency-path: desktop/package-lock.json
      - name: Install
        run: npm ci
      - name: Typecheck
        run: npm run typecheck
      - name: Lint
        run: npm run lint
      - name: Test
        run: npm test
```

- [ ] **Step 2: Verify locally what CI will run** (one command per step — the pwsh exit-code gotcha)

```bash
cd desktop && npm ci && npm run typecheck && npm run lint && npm test
```

- [ ] **Step 3: Commit and push; confirm the run is green in the Actions tab before opening the PR.**

```bash
git add .github/workflows/ci.yml && git commit -m "ci: typecheck, lint and test the desktop workspace"
```

---

### Task 12: Dedicated independent review pass (hybrid mode)

Per the handoff, this slice gets an independent review on **the timer state machine, the
repositories, and the privacy guard** — the correctness-critical core. Not a general code review.

- [ ] **Step 1: Dispatch independent reviewers** with the V3 spec §4 invariants, the Dart reference
      sources, and the diff. Ask specifically: which invariant could this port violate without any
      test going red?
- [ ] **Step 2: Verify each finding before acting on it** (superpowers:receiving-code-review) — the
      project's history is that ~⅓ of findings are refuted.
- [ ] **Step 3: Fix confirmed findings, each probed red first.**
- [ ] **Step 4: Re-run the full suite, typecheck and lint; record the output.**

---

### Task 13: PR, merge, handoff

- [ ] **Step 1:** Write the PR body to a file and use `--body-file` (`gh pr create` mangles a
      multiline `--body` here-string in this PowerShell setup). Include every RED probe output.
- [ ] **Step 2:** Confirm CI green on the branch.
- [ ] **Step 3:** Squash merge.
- [ ] **Step 4:** Update `docs/superpowers/HANDOFF.md` — new LATEST block; move V3-A from "Future
      slices" to "Completed"; record decision **V3-1** (reactivity, owner V3-C) and the deferrals
      table above; add the new gotchas (node:sqlite refuses boolean binds; `.js` extensions under
      NodeNext; savepoints not BEGIN).
- [ ] **Step 5:** Add a masterplan §10 row recording the stack change (outstanding backlog item).

---

## Self-review against the spec

**Coverage of V3 spec §4 (the seven carried-over invariants):**

| Invariant | Where |
|---|---|
| 1. Schema v1 unchanged | Task 2 — column/index/FK exact-set guards, probed red |
| 2. Timer laws (timestamps, persist every change, crash recovery clamped) | Tasks 4 and 6 — `elapsedMs` from timestamps + backwards-clock test; `updated_at` watermark test; clamp test |
| 3. Post-end immutability at the data layer | Task 6 — every write path replayed against an ended row, probed red |
| 4. One append-only `manual_pause` per completed pause | Task 7 — exact count of 1, occurred_at is the pause start, clamped span. **The controller-ordering half is V3-C** (declared in Scope) |
| 5. Survey rules | Task 8 — mandatory 1–5, insert-only (UNIQUE test), refused unless normally ended, probed red |
| 6. The privacy line | Tasks 7 and 10 — bare-token `kind`, no `detail` parameter, source-scan confinement probed red three ways |
| 7. The Modernist design | **V3-C** — no UI in this slice (declared in Scope) |

**Coverage of V3 spec §5 (the two executables seam):** Task 5 introduces `ports.ts`; the fixture
binding itself is declared out of scope with owner V3-B.

**Coverage of V3 spec §6 (test strategy):** vitest for `core` against an in-memory SQLite database
— done. `@vue/test-utils` and Playwright belong to V3-C/V3-D. The three Phase 2 exit criteria: the
`blocked` both-directions pin and identity-unrepresentability land here (Tasks 7, 10); the
mechanical interaction budget is a widget test and is V3-C's.

**Coverage of V3 spec §7:** CI builds and tests `desktop/` (Task 11); the `schema.sql` freeze gets
its new enforcement mechanism (Task 2), with the live-database half owned by V3-D.
