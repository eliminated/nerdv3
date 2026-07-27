/**
 * Does the BUILT product bundle contain any example data?
 *
 * `test/import-isolation.test.ts` proves the product entry cannot reach the
 * fixture *bindings* in source. This makes the stronger claim about what
 * actually ships: no fixture seed string survives tree-shaking into the product
 * bundle, so example data cannot appear as real study history even if something
 * later reached the fixture classes by accident.
 *
 * A source-level test cannot make that claim, because the fixture classes live
 * in `core` and are reachable from both entries by construction. Only the
 * emitted bundle can answer it.
 *
 * Run after `electron-vite build`: `npm run verify:builds`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAIN_OUT = fileURLToPath(new URL('../out/main', import.meta.url));

/** Strings that exist ONLY in the fixture seed data. */
const EXAMPLE_DATA_MARKERS = [
  'Further Maths',
  'Retired Subject',
  'Example data',
  'Example Course',
];

const PRODUCT = 'nerdyapp.js';
const TEST_BUILD = 'nerdyapp-test.js';

function readBundleWithChunks(entry) {
  // An entry plus every chunk it pulls in. Rollup hoists shared code, so
  // checking the entry file alone would miss anything that landed in a chunk.
  const entryPath = join(MAIN_OUT, entry);
  let text = readFileSync(entryPath, 'utf8');
  const chunkDir = join(MAIN_OUT, 'chunks');
  let chunks = [];
  try {
    if (statSync(chunkDir).isDirectory()) chunks = readdirSync(chunkDir);
  } catch {
    /* no chunks emitted */
  }
  for (const c of chunks) {
    // Only chunks this entry actually imports.
    if (text.includes(c)) text += readFileSync(join(chunkDir, c), 'utf8');
  }
  return text;
}

const failures = [];
const note = (ok, msg) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures.push(msg);
};

console.log('=== BUILD ISOLATION ===');

let product;
let testBuild;
try {
  product = readBundleWithChunks(PRODUCT);
  testBuild = readBundleWithChunks(TEST_BUILD);
} catch (e) {
  console.log(`  FAIL  both bundles must exist — run electron-vite build first (${e.message})`);
  process.exit(1);
}

for (const marker of EXAMPLE_DATA_MARKERS) {
  note(!product.includes(marker), `the product bundle contains no example data: ${marker}`);
}

// Anti-vacuity: the markers must be findable SOMEWHERE, or this proves nothing.
// If the seed data were renamed, every check above would pass on a stale list.
const foundInTestBuild = EXAMPLE_DATA_MARKERS.filter((m) => testBuild.includes(m));
note(
  foundInTestBuild.length === EXAMPLE_DATA_MARKERS.length,
  `every marker is present in the test bundle (${String(foundInTestBuild.length)}/${String(
    EXAMPLE_DATA_MARKERS.length,
  )}) — otherwise this list is stale and proves nothing`,
);

console.log(failures.length === 0 ? '=== ISOLATION VERIFIED ===' : '=== ISOLATION FAILED ===');
process.exit(failures.length === 0 ? 0 : 1);
