import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

// data-model.md §3.6 / focus-enforcement.md §7:
//   "detail records *kind*, never *identity*. Store `app_switch`, not the name
//    of the app switched to. Recording which apps a student opens is
//    surveillance, and it would also make an Accessibility Service permission
//    far harder to justify."
//
// Phase 2's exit criterion 3 ("a test asserts detail never records app
// identity") CANNOT honestly be met by asserting rows have detail == null:
// there is no window title to record yet, so such an assertion passes on code
// that could not leak and never exercises the Phase 3 app_switch writer that
// actually risks it. That is the unfailable-test class the V2 post-mortem calls
// its most expensive lesson.
//
// Instead this confines the table: one file may write it, one may read it, and
// the writer's API cannot express identity. It forbids REACHING the table
// rather than enumerating write syntaxes, so it need not know how a query was
// built.
//
// FOUR BYPASSES CLOSED after the 2026-07-27 independent review, each of which
// was demonstrated green against the previous version of this file:
//
//  1. The scan stripped comments before matching. Both stripping regexes ran
//     over raw text, so a string containing "//" or "/*" erased real code from
//     the scan — `const d = 'assets//icons'; db.prepare('INSERT INTO
//     interruptions …')` was invisible. It failed UNSAFELY (under-firing).
//     Comments are no longer stripped: a false positive on prose is a reworded
//     comment, a false negative is a privacy leak.
//  2. The reader exemption was an unconditional `continue`, so the declared
//     reader could INSERT freely. Readers are now allowed only read-shaped SQL.
//  3. The owner exemption was a single `detail` grep, which a positional
//     `INSERT INTO interruptions VALUES (?×11)` walks straight past — the 11th
//     column IS detail. The owner's INSERT must now name its columns, and the
//     column list is asserted exactly. The owner path was also matched by
//     suffix with no count, so a second file at any path ending in the same
//     name inherited the exemption; there is now an exact-count assertion, as
//     READERS already had.
//  4. Only `<pkg>/src` was walked, and only .ts/.vue. Electron scaffolds put
//     main/preload at `packages/app/electron/main.ts` — outside src/, and
//     exactly where the foreground window name is available. The whole package
//     is now walked, including .sql files, since SQL living beside a module is
//     already the house pattern (see readSchemaSql).

const PACKAGES = fileURLToPath(new URL('../../../', import.meta.url)); // desktop/packages/

const OWNER = join('core', 'src', 'data', 'interruption-repository.ts');

// The one legal reader: SessionRepository.loadSessionDetail selects the log for
// the Stats expansion. Exact paths, not patterns — a new reader has to be added
// here deliberately, in front of a reviewer.
const READERS = [join('core', 'src', 'data', 'session-repository.ts')];

// The frozen schema legitimately declares the table. It is exempt from the
// reach scan, and `schema.test.ts` guards its contents (including that it
// declares no triggers and no views, which could otherwise write the table
// from inside the database itself).
const SCHEMA = join('core', 'src', 'db', 'schema.sql');

const TABLE = 'interruptions';

/** Any SQL naming the table, read or write. */
const SQL_REACH = new RegExp(String.raw`\b(?:from|into|update|join|table)\s+\W?${TABLE}\b`, 'i');

/** SQL that MUTATES the table — forbidden even for a declared reader. */
const SQL_WRITE = new RegExp(
  String.raw`\b(?:insert\s+into|replace\s+into|update|delete\s+from|drop\s+table|alter\s+table)\s+\W?${TABLE}\b`,
  'i',
);

/**
 * Belt and braces: the bare table name inside any string literal, which catches
 * a query assembled from fragments (`'SELECT * FROM ' + 'interruptions'`).
 *
 * Known limit, and why the spec calls this guarantee procedural rather than
 * absolute: two fragments defeat it (`'interrup' + 'tions'`), as do
 * `String.fromCharCode`, a `i` escape, or a name read from a file at
 * runtime. The guard raises the cost of leaking identity and makes the
 * deliberate act visible in review; it cannot make leaking impossible.
 */
const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

const SCANNED_EXTENSIONS = [
  '.ts', '.tsx', '.mts', '.cts',
  '.js', '.mjs', '.cjs',
  '.vue', '.sql',
];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git', 'test', 'tests', '__tests__']);

/** Tests legitimately assert on the table, and are not shipped. */
const isTestFile = (name: string): boolean => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);

function sourceFiles(): { file: string; pkg: string }[] {
  const out: { file: string; pkg: string }[] = [];
  const walk = (dir: string, pkg: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(full, pkg);
      } else if (SCANNED_EXTENSIONS.some((e) => entry.endsWith(e)) && !isTestFile(entry)) {
        out.push({ file: full, pkg });
      }
    }
  };
  for (const pkg of readdirSync(PACKAGES)) {
    const dir = join(PACKAGES, pkg);
    if (statSync(dir).isDirectory()) walk(dir, pkg);
  }
  return out;
}

/** Every directory under packages/ that is a real npm package. */
function declaredPackages(): string[] {
  return readdirSync(PACKAGES).filter((p) => {
    try {
      return statSync(join(PACKAGES, p, 'package.json')).isFile();
    } catch {
      return false;
    }
  });
}

test('only the interruption repository reaches the interruptions table', () => {
  const offenders: string[] = [];
  const readerWrites: string[] = [];
  const readersSeen: string[] = [];
  const ownersSeen: string[] = [];
  const packagesScanned = new Set<string>();
  let scanned = 0;

  for (const { file, pkg } of sourceFiles()) {
    scanned++;
    packagesScanned.add(pkg);
    const rel = relative(PACKAGES, file);
    // Deliberately NOT comment-stripped — see bypass 1 in the header.
    const source = readFileSync(file, 'utf8');

    if (rel.endsWith(SCHEMA)) continue;

    if (rel.endsWith(OWNER)) {
      ownersSeen.push(rel);
      assertOwnerCannotExpressIdentity(source);
      continue;
    }
    if (READERS.some((r) => rel.endsWith(r))) {
      readersSeen.push(rel);
      // A reader may READ. It may not write — the previous unconditional
      // `continue` let the declared reader INSERT app names freely.
      if (SQL_WRITE.test(source)) readerWrites.push(rel.split(sep).join('/'));
      continue;
    }

    const literals = source.match(STRING_LITERAL) ?? [];
    const inLiteral = literals.some((l) => new RegExp(String.raw`\b${TABLE}\b`, 'i').test(l));
    if (SQL_REACH.test(source) || inLiteral) offenders.push(rel.split(sep).join('/'));
  }

  expect(
    offenders,
    `the interruptions table may only be reached by ${OWNER} (writes) and ${READERS.join(', ')} (reads)`,
  ).toEqual([]);
  expect(readerWrites, 'a declared READER may only read the interruptions table').toEqual([]);

  // --- Anti-vacuity. A wrong root, a renamed file, or a walk that silently
  // found nothing would otherwise make this pass having proved nothing. ---
  expect(ownersSeen, `exactly one file may be the owner (${OWNER})`).toHaveLength(1);
  expect(readersSeen, 'every declared reader must exist and have been scanned').toHaveLength(
    READERS.length,
  );
  // Scales, unlike a hard-coded file-count floor: when ui/ and app/ land, this
  // fails unless their code is actually being walked. A floor of "> 8" would
  // have kept passing on core's 13 files while covering neither.
  expect([...packagesScanned].sort(), 'every package under packages/ must be scanned').toEqual(
    declaredPackages().sort(),
  );
  expect(scanned).toBeGreaterThan(8);
});

/**
 * The owner is exempt from the reach scan, so it gets stricter checks instead.
 */
function assertOwnerCannotExpressIdentity(source: string): void {
  // 1. The free-text column's name must not appear at all. Adding a parameter
  //    for it has to be a deliberate edit to this named test.
  expect(/\bdetail\b/i.test(source), `app identity must stay unrepresentable in ${OWNER}`).toBe(
    false,
  );

  // 2. Exactly one INSERT, and it must NAME its columns. A positional
  //    `INSERT INTO interruptions VALUES (?×11)` writes all eleven columns —
  //    the eleventh is the free-text one — without the word ever appearing.
  const inserts = source.match(new RegExp(String.raw`insert\s+into\s+\W?${TABLE}\b`, 'gi')) ?? [];
  expect(inserts, `${OWNER} must contain exactly one INSERT`).toHaveLength(1);
  expect(
    new RegExp(String.raw`insert\s+into\s+${TABLE}\s+values`, 'i').test(source),
    'a positional INSERT would write every column, including the free-text one',
  ).toBe(false);

  // 3. The column list is pinned exactly, so the INSERT cannot silently grow.
  const columns = new RegExp(String.raw`insert\s+into\s+${TABLE}\s*\(([^)]*)\)`, 'i').exec(source);
  expect(columns, `${OWNER}'s INSERT must name its columns`).not.toBeNull();
  expect(
    (columns?.[1] ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c !== ''),
  ).toEqual([
    'id',
    'session_id',
    'kind',
    'occurred_at',
    'duration_s',
    'blocked',
    'created_at',
    'updated_at',
  ]);

  // 4. There is no UPDATE path: the log is append-only, one row per completed
  //    pause (V3 spec §4.4), never insert-then-update.
  expect(
    new RegExp(String.raw`\bupdate\s+\W?${TABLE}\b`, 'i').test(source),
    'the interruption log is append-only',
  ).toBe(false);
}
