import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

/**
 * The product entry must never REACH the fixture wiring.
 *
 * This is the whole reason the two executables are two entry points rather than
 * one binary reading an env var (plan P31B, decision B4): with a flag, the
 * product binary contains the fixture wiring and a single wrong variable ships
 * example data as the user's real study history — silently, and indistinguishably
 * from real sessions once it is in the database.
 *
 * ## What this test does and does not claim
 *
 * It walks the RELATIVE import graph from each entry. Package imports
 * (`@nerdyapp/core`, `electron`) stop the walk, which is deliberate and worth
 * being precise about: the fixture *classes* live in `core`, so they are
 * reachable from both entries by construction. What must never be reachable
 * from the product entry is `main/bindings-fixture.ts` — the code that BINDS
 * the app to them. Reachability of the classes is a bundle-size question;
 * reachability of the binding is a correctness one.
 *
 * `scripts/verify-build-isolation.mjs` makes the stronger, complementary claim
 * against the built output: no example data string appears in the product
 * bundle at all.
 */

const SRC = resolve(fileURLToPath(new URL('../src', import.meta.url)));

/** Follows relative imports only; package specifiers terminate the walk. */
function reachableFrom(entryRelative: string): Set<string> {
  const seen = new Set<string>();
  const walk = (file: string): void => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    // Covers `import … from 'x'`, bare `import 'x'`, and `export … from 'x'`.
    const specifiers = [...source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map(
      (m) => m[1] ?? '',
    );
    for (const spec of specifiers) {
      if (!spec.startsWith('.')) continue;
      const base = join(dirname(file), spec).replace(/\.js$/, '');
      for (const candidate of [`${base}.ts`, join(base, 'index.ts'), base]) {
        if (existsSync(candidate)) {
          walk(candidate);
          break;
        }
      }
    }
  };
  walk(join(SRC, entryRelative));
  return seen;
}

const rel = (files: Set<string>): string[] =>
  [...files].map((f) => f.slice(SRC.length + 1).replace(/\\/g, '/')).sort();

test('the PRODUCT entry cannot reach the fixture bindings', () => {
  const reached = rel(reachableFrom('entry-product.ts'));
  expect(reached, 'example data must not be bindable in the product build').not.toContain(
    'main/bindings-fixture.ts',
  );
  // Anti-vacuity: prove the walk actually traversed rather than finding nothing.
  expect(reached).toContain('main/bindings-sqlite.ts');
  expect(reached).toContain('main/index.ts');
  expect(reached).toContain('main/session-controller.ts');
  expect(reached.length).toBeGreaterThan(4);
});

test('the TEST entry cannot reach the SQLite bindings', () => {
  // The mirror. The demo build opening a database would defeat its entire
  // purpose — there would be a real file to corrupt after all.
  const reached = rel(reachableFrom('entry-test.ts'));
  expect(reached, 'the test build must open no database').not.toContain(
    'main/bindings-sqlite.ts',
  );
  expect(reached).toContain('main/bindings-fixture.ts');
  expect(reached.length).toBeGreaterThan(4);
});

test('neither entry reaches the other', () => {
  expect(rel(reachableFrom('entry-product.ts'))).not.toContain('entry-test.ts');
  expect(rel(reachableFrom('entry-test.ts'))).not.toContain('entry-product.ts');
});
