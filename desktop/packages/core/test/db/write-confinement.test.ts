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
// Instead this confines the table. Exactly one file may reach it to write, one
// may read it, and the writer's API cannot express identity. It forbids
// REACHING the table rather than enumerating write syntaxes, so it does not
// need to know how a query was built.
//
// Two deliberate improvements on the retired Dart version:
//  * it scans EVERY package under desktop/packages/*/src, so `ui` and `app` are
//    covered the moment they exist rather than needing this test widened;
//  * it strips comments before matching, so the guard keys on code rather than
//    on prose. The Dart version used a 120-character proximity window against
//    raw source, which fires on ordinary sentences that happen to mention the
//    log near a word like "from".

const PACKAGES = fileURLToPath(new URL('../../../', import.meta.url)); // desktop/packages/

const OWNER = join('core', 'src', 'data', 'interruption-repository.ts');

// The one legal reader: SessionRepository.loadSessionDetail selects the log for
// the Stats expansion. An exact path, not a pattern — a new reader has to be
// added here deliberately, in front of a reviewer.
const READERS = [join('core', 'src', 'data', 'session-repository.ts')];

const TABLE = 'interruptions';

/**
 * Any SQL statement naming the table. Every route to it — however the query is
 * assembled — must put the table name after one of these keywords.
 */
const SQL_REACH = new RegExp(String.raw`\b(?:from|into|update|join|table)\s+${TABLE}\b`, 'i');

/**
 * Belt and braces: the bare table name inside any string literal, which catches
 * a query assembled from fragments (`'SELECT * FROM ' + 'interruptions'`).
 * Known limit, and why the spec calls this guarantee procedural: a name built
 * from concatenated single characters, or read from a config file, would slip
 * past. The guard raises the cost of leaking identity; it does not make it
 * impossible.
 */
const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/** Strips block and line comments so the guard keys on code, not on prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

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
      // a package with no src/ yet
    }
  }
  return out;
}

test('only the interruption repository reaches the interruptions table', () => {
  const offenders: string[] = [];
  const readersSeen: string[] = [];
  let scanned = 0;
  let ownerSeen = false;

  for (const file of sourceFiles()) {
    scanned++;
    const rel = relative(PACKAGES, file);
    const code = stripComments(readFileSync(file, 'utf8'));

    if (rel.endsWith(OWNER)) {
      ownerSeen = true;
      // App identity must stay UNREPRESENTABLE in the writer's API. The free
      // text column's name must not appear in this file at all: adding a
      // parameter for it has to be a deliberate edit to this named test.
      expect(
        /\bdetail\b/i.test(readFileSync(file, 'utf8')),
        `app identity must stay unrepresentable in ${OWNER}`,
      ).toBe(false);
      continue;
    }
    if (READERS.some((r) => rel.endsWith(r))) {
      readersSeen.push(rel);
      continue;
    }

    const literals = code.match(STRING_LITERAL) ?? [];
    const inLiteral = literals.some((l) => new RegExp(String.raw`\b${TABLE}\b`, 'i').test(l));
    if (SQL_REACH.test(code) || inLiteral) offenders.push(rel.split(sep).join('/'));
  }

  expect(
    offenders,
    `the interruptions table may only be reached by ${OWNER} (writes) and ${READERS.join(', ')} (reads)`,
  ).toEqual([]);

  // Anti-vacuity. A wrong working directory, a renamed file, or a walk that
  // silently found nothing would otherwise make this pass having proved
  // nothing at all.
  expect(ownerSeen, `${OWNER} must exist and have been scanned`).toBe(true);
  expect(readersSeen, 'every declared reader must exist and have been scanned').toHaveLength(
    READERS.length,
  );
  // The floor sits below the real file count on purpose: it only has to prove
  // the walk ran, so adding files must never require touching this number.
  expect(scanned).toBeGreaterThan(8);
});
