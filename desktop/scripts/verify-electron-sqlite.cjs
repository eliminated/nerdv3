/**
 * Does the TARGET Electron's bundled Node expose `node:sqlite`, and does it
 * behave the way `core` relies on?
 *
 * Kept as a runnable guard rather than a throwaway spike: the question recurs
 * on every Electron upgrade and the failure mode is SILENT — `core` would
 * still typecheck and its vitest suite would still pass under plain Node,
 * while the shipped app could not open a database at all. `npm run verify:sqlite`.
 *
 * Answered 2026-07-27 for Electron 43.2.0 (Node 24.18.0, SQLite 3.53.1): yes,
 * with no --experimental-sqlite flag. If it ever fails, the recorded fallback
 * is better-sqlite3 and BY DESIGN only packages/core/src/db/driver.ts changes.
 *
 * Runs in the Electron MAIN process (where core will live — it needs fs access
 * and the renderer must not touch the database). Exits non-zero on any failure
 * so this is usable as a CI gate, not just something to eyeball.
 *
 * It exercises every capability `SqliteDriver` and the repositories depend on,
 * because "the module imports" is not the question — "core works" is.
 */
const { app } = require('electron');
const { readFileSync } = require('node:fs');

const path = require('node:path');
const SCHEMA = path.join(__dirname, '..', 'packages', 'core', 'src', 'db', 'schema.sql');

const results = [];
let failed = 0;

function check(name, fn) {
  try {
    const detail = fn();
    results.push(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name} — ${e && e.message ? e.message : String(e)}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

app.whenReady().then(() => {
  console.log('=== ELECTRON RUNTIME ===');
  console.log('  electron : ' + process.versions.electron);
  console.log('  node     : ' + process.versions.node);
  console.log('  chrome   : ' + process.versions.chrome);
  console.log('  v8       : ' + process.versions.v8);
  console.log('  platform : ' + process.platform + ' ' + process.arch);
  console.log('');
  console.log('=== node:sqlite CAPABILITY CHECKS ===');

  let DatabaseSync;
  check('node:sqlite is importable without a flag', () => {
    ({ DatabaseSync } = require('node:sqlite'));
    assert(typeof DatabaseSync === 'function', 'DatabaseSync is not a constructor');
    return 'no --experimental-sqlite needed';
  });

  if (!DatabaseSync) {
    report();
    return;
  }

  let db;
  check('opens an in-memory database', () => {
    db = new DatabaseSync(':memory:');
    return db.prepare('select sqlite_version() v').get().v;
  });

  check('applies the frozen schema.sql verbatim', () => {
    db.exec(readFileSync(SCHEMA, 'utf8'));
    const t = db
      .prepare("SELECT count(*) c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .get().c;
    assert(t === 7, `expected 7 tables, got ${t}`);
    const i = db
      .prepare("SELECT count(*) c FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .get().c;
    assert(i === 6, `expected 6 indexes, got ${i}`);
    return '7 tables, 6 indexes';
  });

  check('foreign keys are ENFORCED by default', () => {
    const on = db.prepare('PRAGMA foreign_keys').get().foreign_keys;
    assert(on === 1, 'foreign_keys pragma is off');
    let threw = false;
    try {
      db.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s', 'nouser', 'P');
    } catch {
      threw = true;
    }
    assert(threw, 'an unknown user_id was accepted');
    return 'pragma on, violation rejected';
  });

  check('CHECK constraints are enforced', () => {
    db.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u', 'a@b', '');
    db.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s', 'u', 'P');
    db.prepare(
      'INSERT INTO sessions (id,user_id,subject_id,mode,started_at) VALUES (?,?,?,?,?)',
    ).run('x', 'u', 's', 'plain', 1000);
    let threw = false;
    try {
      db.prepare('INSERT INTO session_surveys (id,session_id,focus_rating) VALUES (?,?,?)')
        .run('sv', 'x', 6);
    } catch {
      threw = true;
    }
    assert(threw, 'focus_rating 6 was accepted');
    return 'rating CHECK live';
  });

  check('prepare/run/get/all round-trip, changes count', () => {
    const r = db
      .prepare('UPDATE sessions SET paused_duration_s = ? WHERE id = ? AND ended_at IS NULL')
      .run(60, 'x');
    assert(r.changes === 1, `expected changes 1, got ${r.changes}`);
    const row = db.prepare('SELECT paused_duration_s p FROM sessions WHERE id = ?').get('x');
    assert(row.p === 60, `expected 60, got ${row.p}`);
    const all = db.prepare('SELECT id FROM sessions').all();
    assert(Array.isArray(all) && all.length === 1, 'all() did not return one row');
    return 'changes + get + all correct';
  });

  check('SAVEPOINT nests and rolls back (core uses savepoints, not BEGIN)', () => {
    db.exec('SAVEPOINT sp_0');
    db.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s2', 'u', 'A');
    db.exec('SAVEPOINT sp_1');
    db.prepare('INSERT INTO subjects (id,user_id,name) VALUES (?,?,?)').run('s3', 'u', 'B');
    db.exec('ROLLBACK TO sp_1');
    db.exec('RELEASE sp_1');
    db.exec('RELEASE sp_0');
    const n = db.prepare('SELECT count(*) c FROM subjects').get().c;
    assert(n === 2, `expected 2 subjects (s, s2), got ${n}`);
    return 'inner rollback kept outer work';
  });

  check('INSERT OR IGNORE is idempotent (local-user bootstrap)', () => {
    for (let i = 0; i < 10; i++) {
      db.prepare('INSERT OR IGNORE INTO users (id,email,password_hash) VALUES (?,?,?)')
        .run('u', 'a@b', '');
    }
    const n = db.prepare('SELECT count(*) c FROM users').get().c;
    assert(n === 1, `expected 1 user, got ${n}`);
    return 'still one row after 10 calls';
  });

  check('boolean binds are REFUSED here too (core converts to 0/1)', () => {
    let threw = false;
    try {
      db.prepare('INSERT INTO interruptions (id,session_id,kind,occurred_at,blocked) VALUES (?,?,?,?,?)')
        .run('i', 'x', 'manual_pause', 1000, true);
    } catch {
      threw = true;
    }
    assert(threw, 'a JS boolean was accepted — core assumes it is refused');
    return 'same behaviour as plain Node 25';
  });

  check('opens a real FILE database and reopens it', () => {
    const os = require('node:os');
    const fs = require('node:fs');
    const f = path.join(os.tmpdir(), `spike-${Date.now()}.db`);
    const a = new DatabaseSync(f);
    a.exec(readFileSync(SCHEMA, 'utf8'));
    a.prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)').run('u', 'a@b', '');
    a.close();
    const b = new DatabaseSync(f);
    const n = b.prepare('SELECT count(*) c FROM users').get().c;
    b.close();
    fs.unlinkSync(f);
    assert(n === 1, 'row did not survive close/reopen');
    return 'persists across close/reopen';
  });

  report();
});

function report() {
  console.log(results.join('\n'));
  console.log('');
  console.log(failed === 0 ? '=== VERDICT: node:sqlite WORKS in Electron ===' : `=== VERDICT: ${failed} CHECK(S) FAILED ===`);
  app.exit(failed === 0 ? 0 : 1);
}
