/**
 * Runs the product smoke against a THROWAWAY database.
 *
 * The smoke flow drives a real session — create a subject, start, pause,
 * resume, distraction, end. Pointed at the default directory that lands in the
 * user's actual study history, which is exactly what happened before this
 * existed: eleven junk subjects and twenty-two interruptions in a real
 * database, with no UI to remove them.
 *
 * The directory is created fresh and deleted afterwards, so the smoke also
 * exercises first-launch database creation every single run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nerdyapp-smoke-'));

console.log(`[smoke] throwaway database directory: ${dir}`);

// Imported from plain Node (not from inside Electron), the `electron` package
// resolves to the absolute path of the binary. Going through `npx` instead
// silently produced no output at all on Windows.
const { default: electronPath } = await import('electron');

const result = spawnSync(
  electronPath,
  [join(appDir, 'out', 'main', 'nerdyapp.js'), '--smoke', `--nerdy-data-dir=${dir}`],
  { cwd: appDir, stdio: 'inherit' },
);

rmSync(dir, { recursive: true, force: true });
console.log(`[smoke] throwaway directory removed`);

process.exit(result.status ?? 1);
