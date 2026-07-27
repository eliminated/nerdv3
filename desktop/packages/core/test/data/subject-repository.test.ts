import { afterEach, beforeEach, expect, test } from 'vitest';

import { SqliteSubjectRepository } from '../../src/data/subject-repository.js';
import type { Database } from '../../src/db/connection.js';
import { ensureLocalUser } from '../../src/db/local-user.js';
import { localUserId } from '../../src/ids.js';
import { toEpochSeconds } from '../../src/time.js';
import { fixedClock, freshDb } from '../support/fixture.js';

const t0 = new Date('2026-07-26T09:00:00.000Z');

let db: Database;
let repo: SqliteSubjectRepository;
let clock: ReturnType<typeof fixedClock>;

beforeEach(() => {
  db = freshDb();
  ensureLocalUser(db);
  clock = fixedClock(t0);
  repo = new SqliteSubjectRepository(db, clock.now);
});
afterEach(() => {
  db.close();
});

test('create inserts a row visible to list', async () => {
  await repo.create({ name: 'Physics' });
  const subjects = await repo.list();
  expect(subjects).toHaveLength(1);
  expect(subjects[0]?.name).toBe('Physics');
});

test('create attaches the row to the local user', async () => {
  // Locked decision 4: every user_id FK is populated from day one so adding a
  // server later needs no migration.
  await repo.create({ name: 'Physics' });
  expect(db.prepare('SELECT user_id FROM subjects').get<{ user_id: string }>()?.user_id).toBe(
    localUserId,
  );
});

test('list excludes soft-deleted rows', async () => {
  const id = await repo.create({ name: 'Old' });
  db.prepare('UPDATE subjects SET deleted_at = ? WHERE id = ?').run(toEpochSeconds(t0), id);
  expect(await repo.list()).toEqual([]);
});

test('create persists colour, source and source name; defaults are self/null', async () => {
  const plainId = await repo.create({ name: 'Maths' });
  const richId = await repo.create({
    name: 'Flutter',
    color: '#42A5F5',
    source: 'course',
    sourceName: 'Udemy',
  });
  const rows = await repo.list();
  const plain = rows.find((s) => s.id === plainId);
  const rich = rows.find((s) => s.id === richId);
  // Asymmetric on purpose: three identical values could not catch two swapped
  // columns.
  expect([plain?.color, plain?.source, plain?.sourceName]).toEqual([null, 'self', null]);
  expect([rich?.color, rich?.source, rich?.sourceName]).toEqual(['#42A5F5', 'course', 'Udemy']);
});

test('update rewrites all editable fields, and null clears them', async () => {
  const id = await repo.create({
    name: 'Chem',
    color: '#EF5350',
    source: 'school',
    sourceName: 'MRSM',
  });
  await repo.update(id, { name: 'Chemistry', color: null, source: 'self', sourceName: null });
  const s = (await repo.list())[0];
  expect([s?.name, s?.color, s?.source, s?.sourceName]).toEqual([
    'Chemistry',
    null,
    'self',
    null,
  ]);
});

test('update touches only the named row', async () => {
  const a = await repo.create({ name: 'A' });
  await repo.create({ name: 'B' });
  await repo.update(a, { name: 'A2', color: null, source: 'self', sourceName: null });
  const names = (await repo.list()).map((s) => s.name).sort();
  expect(names).toEqual(['A2', 'B']);
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

test('archived is exposed as a boolean, not the stored 0/1', async () => {
  const id = await repo.create({ name: 'Physics' });
  expect((await repo.list())[0]?.archived).toBe(false);
  await repo.setArchived(id, true);
  expect((await repo.list({ archived: true }))[0]?.archived).toBe(true);
});

test('remove is soft: gone from both lists, the row survives', async () => {
  const id = await repo.create({ name: 'Physics' });
  await repo.remove(id);
  expect(await repo.list()).toEqual([]);
  expect(await repo.list({ archived: true })).toEqual([]);
  const row = db.prepare('SELECT deleted_at FROM subjects').get<{ deleted_at: number | null }>();
  expect(row?.deleted_at, 'soft delete, never DELETE — history joins keep the name').not.toBeNull();
});

test('a soft-deleted archived subject stays hidden from both lists', async () => {
  const id = await repo.create({ name: 'Physics' });
  await repo.setArchived(id, true);
  await repo.remove(id);
  expect(await repo.list()).toEqual([]);
  expect(await repo.list({ archived: true })).toEqual([]);
});

test('every write advances the updated_at watermark', async () => {
  // updated_at is the liveness watermark crash recovery bounds a session by, so
  // a write path that forgets it is a real defect, not cosmetic.
  const id = await repo.create({ name: 'Physics' });
  const readUpdatedAt = (): number =>
    db.prepare('SELECT updated_at u FROM subjects WHERE id = ?').get<{ u: number }>(id)?.u ?? 0;
  const created = readUpdatedAt();
  expect(created).toBe(toEpochSeconds(t0));

  for (const [minutes, write] of [
    [10, () => repo.update(id, { name: 'P', color: null, source: 'self', sourceName: null })],
    [20, () => repo.setArchived(id, true)],
    [30, () => repo.remove(id)],
  ] as const) {
    const then = new Date(t0.getTime() + minutes * 60_000);
    clock.set(then);
    await write();
    expect(readUpdatedAt(), `after the write at +${String(minutes)}min`).toBe(
      toEpochSeconds(then),
    );
  }
});

test('list is newest-first', async () => {
  const a = await repo.create({ name: 'A' });
  clock.set(new Date(t0.getTime() + 60 * 60_000));
  const b = await repo.create({ name: 'B' });
  expect((await repo.list()).map((s) => s.id)).toEqual([b, a]);
});

test('list breaks same-second ties deterministically', async () => {
  // created_at has second precision, so without the id tiebreak two subjects
  // made in the same second would order arbitrarily between runs. newId() is
  // UUIDv7, so descending id is descending time.
  const first = await repo.create({ name: 'A' });
  const second = await repo.create({ name: 'B' });
  expect((await repo.list()).map((s) => s.id)).toEqual([second, first]);
});

test('createdAt comes back as a Date at second precision', async () => {
  await repo.create({ name: 'Physics' });
  const s = (await repo.list())[0];
  expect(s?.createdAt).toBeInstanceOf(Date);
  expect(s?.createdAt.getTime()).toBe(t0.getTime());
});
