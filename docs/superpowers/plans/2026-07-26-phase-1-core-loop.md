# Phase 1 Remainder — Core Loop Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish masterplan §7 Phase 1: crash recovery (unterminated sessions closed as `'crashed'` on launch), full subject CRUD (colour, source, archive, soft delete), the no-mutation-after-end guarantee with its test, and the wall-clock accuracy check.

**Architecture:** No schema change — schema stays frozen at v1. Crash recovery and the immutability guarantee are both repository-level: every session write path gains a `WHERE ended_at IS NULL` guard (so an ended session is physically unwritable through the repository), and a launch-time routine closes any still-open session using its last persisted write (`updated_at`) as the honest lower-bound end time. To make that bound tight, the controller starts persisting a write on *pause* as well as resume (architecture.md §3.4: persist on every state change). Subject CRUD extends the existing repository + list screen in place.

**Tech Stack:** As slices 1–2 (Flutter 3.41.4, drift/drift_dev pinned exactly 2.34.0, Riverpod 3.3.2). No new dependencies.

**Execution mode (locked in HANDOFF.md):** Hybrid — inline by default; **dedicated independent review on Tasks 1–3 and 6** (crash recovery + timer correctness, the correctness-critical core of Phase 1).

**Branch:** `feat/phase-1-core-loop`, squash-merged via PR when CI is green and review is clean.

## Global Constraints

- Slice 1–2 Global Constraints carry forward: `drift`/`drift_dev` pinned **exactly 2.34.0**; all stored timestamps written `.toUtc()`; tests compare instants via `toUtc().isAtSameMomentAs(...)`, never `isUtc`; never `git add -A`; never `pumpAndSettle()` while a spinner is up; widget tests end with `pumpWidget(SizedBox())` + `pump(Duration(seconds: 1))`; never run two `flutter test` invocations in parallel; Conventional Commits.
- **Schema v1 stays frozen — this slice makes zero schema changes.** If any task appears to need a column, stop and re-plan.
- **The invariant is "immutable once ended"** (data-model.md §3.4): after `ended_at` is set, no field changes except the closing writes themselves. Pause bookkeeping may write `paused_duration_s`/`updated_at` only while in progress.
- For every test added, the plan states what change would make it fail (V2's "a test that can't fail isn't a test").
- Run tests from `app/` with `flutter test --timeout 60s` while iterating (a hung widget test otherwise stalls ~10 min).

## File Structure

```
app/lib/features/session/data/session_repository.dart      # guards + recoverCrashedSessions() + endReason in history
app/lib/features/session/presentation/session_controller.dart  # persist on pause
app/lib/features/session/presentation/history_screen.dart  # crashed marker
app/lib/features/subjects/data/subject_repository.dart     # update/archive/delete/filtered watch
app/lib/features/subjects/presentation/subject_list_screen.dart  # CRUD UI, archived toggle
app/lib/main.dart                                           # recovery call on launch
app/test/features/session/session_repository_test.dart      # immutability + recovery tests
app/test/features/session/session_controller_test.dart      # NEW: pause persistence + real-clock smoke
app/test/features/subjects/subject_repository_test.dart     # CRUD tests
app/test/features/subjects/subject_list_screen_test.dart    # edit/archive/delete widget tests
CHANGELOG.md                                                 # Unreleased additions
```

## Design decisions (settled here, not during implementation)

1. **Recovered `ended_at` = the row's `updated_at`** — the last persisted write, an honest lower bound of when the session was alive. `actual_duration_s = max(0, (updated_at − started_at) − paused_duration_s)`. Crashed durations are approximate by nature; that is acceptable because crashed sessions are excluded from streak inputs by `end_reason = 'crashed'` (the exclusion key Phase 5 will filter on — no streak code exists yet).
2. **Pause now persists a write.** Controller calls `updatePausedDuration` on pause *and* resume. On pause the accumulated value is unchanged but `updated_at` advances, which makes the crashed-while-paused recovery duration *exact* (active time = pause start − start − prior pauses). Full pause-state persistence (`pause_started_at` column) would need a schema change — deliberately not taken; a session that crashes while paused and is later recovered simply doesn't count the dangling pause, which is already the conservative direction.
3. **Immutability is enforced, not just asserted:** `updatePausedDuration` and `endSession` gain `& endedAt.isNull()` in their WHERE clauses, so a write against an ended session affects zero rows. The immutability test then exercises every repository write path against an ended row and asserts the row is byte-identical.
4. **Recovered sessions appear in history** (they have `ended_at` now), labelled `· crashed`. Kept visible because "a pattern of crashes is a bug report" (data-model.md §3.4).
5. **Subject delete is soft** (`deleted_at`, data-model.md §2). History join intentionally does *not* filter subjects by `deleted_at`, so a deleted subject's past sessions keep their name.
6. **Wall-clock accuracy** is verified twice: an automated ~6-second real-clock end-to-end test (catches any tick-counter/fake-duration regression), and the one-hour human-run check from the Phase 1 exit criteria, routed to Isaac (manual verification cannot be delegated).

---

### Task 1: Immutability guards on session write paths

**Files:**
- Modify: `app/lib/features/session/data/session_repository.dart`
- Test: `app/test/features/session/session_repository_test.dart`

**Interfaces:**
- Produces: `updatePausedDuration` / `endSession` that silently no-op on ended sessions. Task 3 extends the same test with `recoverCrashedSessions()`.

- [ ] **Step 1: Write the failing test** (append to `session_repository_test.dart`)

```dart
test('an ended session is immutable through every repository write path',
    () async {
  final s = start()
      .pause(t0.add(const Duration(minutes: 10)))
      .resume(t0.add(const Duration(minutes: 12)));
  await repo.insertStartedSession(s);
  final endAt = t0.add(const Duration(minutes: 30));
  await repo.endSession(
    id: s.id,
    endedAt: endAt,
    actualDuration: s.elapsed(endAt),
    totalPaused: s.totalPaused(endAt),
  );
  final before = await db.select(db.sessions).getSingle();

  await repo.updatePausedDuration(s.id, const Duration(hours: 9));
  await repo.endSession(
    id: s.id,
    endedAt: endAt.add(const Duration(hours: 1)),
    actualDuration: const Duration(hours: 9),
    totalPaused: const Duration(hours: 9),
  );

  // Drift data classes implement ==; this compares every column.
  expect(await db.select(db.sessions).getSingle(), before);
});
```

What would make it fail: removing either `endedAt.isNull()` guard added in Step 3 — the second `endSession`/`updatePausedDuration` would then overwrite the closed row.

- [ ] **Step 2: Run it, verify it fails**

Run: `cd app && flutter test test/features/session/session_repository_test.dart --timeout 60s`
Expected: FAIL — the ended row is overwritten (both write paths currently match on id alone).

- [ ] **Step 3: Add the guards**

In `session_repository.dart`, change both WHERE clauses:

```dart
  Future<void> updatePausedDuration(String id, Duration totalPaused) async {
    // Guarded: an ended session is immutable (data-model.md §3.4).
    await (_db.update(_db.sessions)
          ..where((t) => t.id.equals(id) & t.endedAt.isNull()))
        .write(
      SessionsCompanion(
        pausedDurationS: Value(totalPaused.inSeconds),
        updatedAt: Value(DateTime.now().toUtc()),
      ),
    );
  }
```

and in `endSession`:

```dart
    await (_db.update(_db.sessions)
          ..where((t) => t.id.equals(id) & t.endedAt.isNull()))
        .write(
```

- [ ] **Step 4: Run the full session repository test file, verify all pass**

Run: `cd app && flutter test test/features/session/session_repository_test.dart --timeout 60s`
Expected: PASS (existing tests prove the guards don't break the live-session paths).

- [ ] **Step 5: Commit**

```bash
git add app/lib/features/session/data/session_repository.dart app/test/features/session/session_repository_test.dart
git commit -m "feat: enforce session immutability after end in repository writes"
```

---

### Task 2: Persist the pause state change

**Files:**
- Modify: `app/lib/features/session/presentation/session_controller.dart`
- Create: `app/test/features/session/session_controller_test.dart`

**Interfaces:**
- Consumes: `updatePausedDuration(String id, Duration totalPaused)` from Task 1.
- Produces: a controller whose pause branch writes to the DB (Task 3's recovery-accuracy bound relies on this). Test file shared with Task 6.

- [ ] **Step 1: Write the failing test**

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/providers.dart';
import 'package:nerdyapp/features/session/presentation/session_controller.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

void main() {
  late AppDatabase db;
  late ProviderContainer container;
  late String subjectId;

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    await ensureLocalUser(db);
    subjectId = await SubjectRepository(db).createSubject('Physics');
    container = ProviderContainer(
      overrides: [databaseProvider.overrideWithValue(db)],
    );
  });
  tearDown(() async {
    container.dispose();
    await db.close();
  });

  test('pausing persists a write (the liveness watermark advances)', () async {
    final controller = container.read(sessionControllerProvider.notifier);
    await controller.start(subjectId);
    final id = container.read(sessionControllerProvider)!.id;

    // Backdate updated_at so the pause write is observable at the stored
    // one-second precision.
    final backdated = DateTime.utc(2000);
    await (db.update(db.sessions)..where((t) => t.id.equals(id)))
        .write(SessionsCompanion(updatedAt: Value(backdated)));

    await controller.togglePause(); // pause — must hit the DB
    final row = await db.select(db.sessions).getSingle();
    expect(row.updatedAt.toUtc().isAfter(backdated), isTrue,
        reason: 'pause must persist a write (architecture.md §3.4)');
  });
}
```

What would make it fail: removing the DB write from the pause branch (the current code — pause only mutates in-memory state).

- [ ] **Step 2: Run it, verify it fails**

Run: `cd app && flutter test test/features/session/session_controller_test.dart --timeout 60s`
Expected: FAIL — `updatedAt` still equals the backdated value because pause never writes.

- [ ] **Step 3: Make the pause branch write**

Replace `togglePause` in `session_controller.dart`:

```dart
  Future<void> togglePause() async {
    final s = state;
    if (s == null) return;
    final next = s.isPaused ? s.resume(_now()) : s.pause(_now());
    // Written on pause AND resume: every state change is persisted
    // (architecture.md §3.4). On pause the accumulated value is unchanged
    // but updated_at advances, which is what makes crash recovery's
    // last-write bound exact for a session that dies while paused.
    await ref
        .read(sessionRepositoryProvider)
        .updatePausedDuration(next.id, next.accumulatedPause);
    state = next;
  }
```

- [ ] **Step 4: Run the test file, verify it passes**

Run: `cd app && flutter test test/features/session/session_controller_test.dart --timeout 60s`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/lib/features/session/presentation/session_controller.dart app/test/features/session/session_controller_test.dart
git commit -m "feat: persist session state on pause, not only resume"
```

---

### Task 3: Crash recovery on launch

**Files:**
- Modify: `app/lib/features/session/data/session_repository.dart`
- Modify: `app/lib/main.dart`
- Modify: `app/lib/features/session/presentation/history_screen.dart`
- Test: `app/test/features/session/session_repository_test.dart`

**Interfaces:**
- Produces: `Future<int> recoverCrashedSessions()` on `SessionRepository` (returns how many rows were closed); `HistoryEntry` gains `final String? endReason`.

- [ ] **Step 1: Write the failing tests** (append to `session_repository_test.dart`)

```dart
  test('recovery closes open sessions as crashed at their last write',
      () async {
    // Simulates: started at t0, last persisted write (a pause) at t0+30min,
    // with 5 minutes of completed pause before that.
    await db.into(db.sessions).insert(SessionsCompanion.insert(
          id: 'open-1',
          userId: localUserId,
          subjectId: subjectId,
          mode: 'plain',
          startedAt: t0,
          pausedDurationS: const Value(5 * 60),
          updatedAt: Value(t0.add(const Duration(minutes: 30))),
        ));
    final recovered = await repo.recoverCrashedSessions();
    expect(recovered, 1);
    final row = await db.select(db.sessions).getSingle();
    expect(row.endReason, 'crashed');
    expect(
        row.endedAt!
            .toUtc()
            .isAtSameMomentAs(t0.add(const Duration(minutes: 30))),
        isTrue);
    expect(row.actualDurationS, 25 * 60);
  });

  test('recovery clamps a negative computed duration to zero', () async {
    // Paused longer than the elapsed window (possible when the dangling
    // pause was never persisted): duration must clamp, not go negative.
    await db.into(db.sessions).insert(SessionsCompanion.insert(
          id: 'open-2',
          userId: localUserId,
          subjectId: subjectId,
          mode: 'plain',
          startedAt: t0,
          pausedDurationS: const Value(60 * 60),
          updatedAt: Value(t0.add(const Duration(minutes: 10))),
        ));
    await repo.recoverCrashedSessions();
    final row = await db.select(db.sessions).getSingle();
    expect(row.actualDurationS, 0);
  });

  test('recovery ignores ended sessions and is idempotent', () async {
    final s = start();
    await repo.insertStartedSession(s);
    final endAt = t0.add(const Duration(minutes: 20));
    await repo.endSession(
      id: s.id,
      endedAt: endAt,
      actualDuration: s.elapsed(endAt),
      totalPaused: Duration.zero,
    );
    final before = await db.select(db.sessions).getSingle();
    expect(await repo.recoverCrashedSessions(), 0);
    expect(await db.select(db.sessions).getSingle(), before);
  });

  test('recovered sessions appear in history marked crashed', () async {
    await db.into(db.sessions).insert(SessionsCompanion.insert(
          id: 'open-3',
          userId: localUserId,
          subjectId: subjectId,
          mode: 'plain',
          startedAt: t0,
          updatedAt: Value(t0.add(const Duration(minutes: 15))),
        ));
    await repo.recoverCrashedSessions();
    final history = await repo.watchHistory().first;
    expect(history.single.endReason, 'crashed');
  });
```

Also add the recovery path to Task 1's immutability test, after the second `endSession` call:

```dart
  await repo.recoverCrashedSessions();
```

(and add `import 'package:drift/drift.dart' hide isNull;` plus `import 'package:nerdyapp/core/ids.dart';` to the test file for `Value` and `localUserId`).

What would make them fail: recovery not writing `end_reason`/`ended_at`; using recovery time (or `DateTime.now()`) instead of `updated_at` as the end bound; forgetting the pause subtraction or the clamp; recovery matching ended rows; history not surfacing `end_reason`.

- [ ] **Step 2: Run them, verify they fail**

Run: `cd app && flutter test test/features/session/session_repository_test.dart --timeout 60s`
Expected: FAIL with "recoverCrashedSessions is not defined" (compile error) — that counts as red for all four.

- [ ] **Step 3: Implement recovery + history end reason**

In `session_repository.dart`, extend `HistoryEntry`:

```dart
class HistoryEntry {
  const HistoryEntry({
    required this.sessionId,
    required this.subjectName,
    required this.startedAt,
    required this.actualDuration,
    this.endReason,
  });

  final String sessionId;
  final String subjectName;
  final DateTime startedAt;
  final Duration actualDuration;
  final String? endReason;
}
```

In `watchHistory()`'s row mapping, add:

```dart
            endReason: session.endReason,
```

Add the recovery routine to `SessionRepository`:

```dart
  /// Closes out sessions left open by a crash (architecture.md §3.4).
  /// ended_at is the row's last persisted write — an honest lower bound —
  /// and end_reason 'crashed' is the key streak inputs will exclude on.
  /// Returns the number of sessions recovered.
  Future<int> recoverCrashedSessions() async {
    return _db.transaction(() async {
      final open = await (_db.select(_db.sessions)
            ..where((t) => t.endedAt.isNull()))
          .get();
      for (final row in open) {
        final active = row.updatedAt.difference(row.startedAt).inSeconds -
            row.pausedDurationS;
        await (_db.update(_db.sessions)..where((t) => t.id.equals(row.id)))
            .write(
          SessionsCompanion(
            endedAt: Value(row.updatedAt),
            actualDurationS: Value(active < 0 ? 0 : active),
            endReason: const Value('crashed'),
            updatedAt: Value(DateTime.now().toUtc()),
          ),
        );
      }
      return open.length;
    });
  }
```

In `main.dart`, after `ensureLocalUser(db)`:

```dart
  await SessionRepository(db).recoverCrashedSessions();
```

with import `'features/session/data/session_repository.dart'`.

In `history_screen.dart`, mark crashed entries:

```dart
                  return ListTile(
                    title: Text(e.subjectName),
                    subtitle: Text(e.endReason == 'crashed'
                        ? '${e.startedAt.toLocal()} · crashed'
                        : e.startedAt.toLocal().toString()),
                    trailing: Text(formatDuration(e.actualDuration)),
                  );
```

- [ ] **Step 4: Run the whole test suite, verify green**

Run: `cd app && flutter test --timeout 60s`
Expected: PASS, all files.

- [ ] **Step 5: Commit**

```bash
git add app/lib/features/session/data/session_repository.dart app/lib/main.dart app/lib/features/session/presentation/history_screen.dart app/test/features/session/session_repository_test.dart
git commit -m "feat: recover crashed sessions on launch as end_reason=crashed"
```

---

### Task 4: Subject repository CRUD

**Files:**
- Modify: `app/lib/features/subjects/data/subject_repository.dart`
- Test: `app/test/features/subjects/subject_repository_test.dart`

**Interfaces:**
- Produces (Task 5 consumes exactly these):
  - `Future<String> createSubject(String name, {String? color, String source = 'self', String? sourceName})` — existing positional-name callers stay valid
  - `Future<void> updateSubject(String id, {required String name, String? color, required String source, String? sourceName})` — always writes all four (passing null clears colour/sourceName)
  - `Future<void> setArchived(String id, {required bool archived})`
  - `Future<void> deleteSubject(String id)` — soft delete
  - `Stream<List<Subject>> watchSubjects({bool archived = false})`

- [ ] **Step 1: Write the failing tests** (append to `subject_repository_test.dart`; keep existing tests untouched — read the file first and reuse its setup)

```dart
  test('create persists colour, source and source name; defaults are self/null',
      () async {
    final plainId = await repo.createSubject('Maths');
    final richId = await repo.createSubject('Flutter',
        color: '#42A5F5', source: 'course', sourceName: 'Udemy');
    final rows = await repo.watchSubjects().first;
    final plain = rows.singleWhere((s) => s.id == plainId);
    final rich = rows.singleWhere((s) => s.id == richId);
    expect((plain.color, plain.source, plain.sourceName), (null, 'self', null));
    expect((rich.color, rich.source, rich.sourceName),
        ('#42A5F5', 'course', 'Udemy'));
  });

  test('update rewrites all editable fields', () async {
    final id = await repo.createSubject('Chem',
        color: '#EF5350', source: 'school', sourceName: 'MRSM');
    await repo.updateSubject(id,
        name: 'Chemistry', color: null, source: 'self', sourceName: null);
    final s = (await repo.watchSubjects().first).single;
    expect((s.name, s.color, s.source, s.sourceName),
        ('Chemistry', null, 'self', null));
  });

  test('archiving removes from the active list but not from history joins',
      () async {
    final id = await repo.createSubject('Physics');
    // An ended session, so the history join has something to find.
    final session = ActiveSession.start(
        id: 'sess-arch', subjectId: id, startedAt: DateTime.utc(2026, 7, 26));
    final sessions = SessionRepository(db);
    await sessions.insertStartedSession(session);
    await sessions.endSession(
      id: session.id,
      endedAt: session.startedAt.add(const Duration(minutes: 30)),
      actualDuration: const Duration(minutes: 30),
      totalPaused: Duration.zero,
    );

    await repo.setArchived(id, archived: true);
    expect(await repo.watchSubjects().first, isEmpty);
    expect((await repo.watchSubjects(archived: true).first).single.name,
        'Physics');
    expect((await sessions.watchHistory().first).single.subjectName,
        'Physics');

    await repo.setArchived(id, archived: false);
    expect((await repo.watchSubjects().first).single.name, 'Physics');
  });

  test('delete is soft: gone from both lists, history keeps the name',
      () async {
    final id = await repo.createSubject('Physics');
    final session = ActiveSession.start(
        id: 'sess-del', subjectId: id, startedAt: DateTime.utc(2026, 7, 26));
    final sessions = SessionRepository(db);
    await sessions.insertStartedSession(session);
    await sessions.endSession(
      id: session.id,
      endedAt: session.startedAt.add(const Duration(minutes: 30)),
      actualDuration: const Duration(minutes: 30),
      totalPaused: Duration.zero,
    );

    await repo.deleteSubject(id);
    expect(await repo.watchSubjects().first, isEmpty);
    expect(await repo.watchSubjects(archived: true).first, isEmpty);
    final row = await db.select(db.subjects).getSingle();
    expect(row.deletedAt, isNotNull); // soft, not DELETE
    expect((await sessions.watchHistory().first).single.subjectName,
        'Physics');
  });
```

(new imports needed: `package:nerdyapp/features/session/data/session_repository.dart`, `package:nerdyapp/features/session/domain/active_session.dart`)

What would make them fail: create ignoring the new fields; update missing a field or refusing to clear nulls; `watchSubjects` not filtering on `archived`; archive implemented as delete (history assertion breaks); delete implemented as hard `DELETE` (the `deletedAt` row read breaks) or history join filtering deleted subjects.

- [ ] **Step 2: Run them, verify they fail**

Run: `cd app && flutter test test/features/subjects/subject_repository_test.dart --timeout 60s`
Expected: FAIL (compile error — new named parameters/methods don't exist).

- [ ] **Step 3: Implement the repository**

Replace `subject_repository.dart`'s class body:

```dart
class SubjectRepository {
  SubjectRepository(this._db);

  final AppDatabase _db;

  Future<String> createSubject(
    String name, {
    String? color,
    String source = 'self',
    String? sourceName,
  }) async {
    final id = newId();
    await _db.into(_db.subjects).insert(SubjectsCompanion.insert(
          id: id,
          userId: localUserId,
          name: name,
          color: Value(color),
          source: Value(source),
          sourceName: Value(sourceName),
        ));
    return id;
  }

  /// Writes all editable fields; null clears colour / source name.
  Future<void> updateSubject(
    String id, {
    required String name,
    String? color,
    required String source,
    String? sourceName,
  }) async {
    await (_db.update(_db.subjects)..where((s) => s.id.equals(id))).write(
      SubjectsCompanion(
        name: Value(name),
        color: Value(color),
        source: Value(source),
        sourceName: Value(sourceName),
        updatedAt: Value(DateTime.now().toUtc()),
      ),
    );
  }

  Future<void> setArchived(String id, {required bool archived}) async {
    await (_db.update(_db.subjects)..where((s) => s.id.equals(id))).write(
      SubjectsCompanion(
        archived: Value(archived),
        updatedAt: Value(DateTime.now().toUtc()),
      ),
    );
  }

  /// Soft delete (data-model.md §2) — history joins keep the name.
  Future<void> deleteSubject(String id) async {
    final now = DateTime.now().toUtc();
    await (_db.update(_db.subjects)..where((s) => s.id.equals(id))).write(
      SubjectsCompanion(deletedAt: Value(now), updatedAt: Value(now)),
    );
  }

  Stream<List<Subject>> watchSubjects({bool archived = false}) {
    return (_db.select(_db.subjects)
          ..where((s) => s.deletedAt.isNull() & s.archived.equals(archived))
          ..orderBy([(s) => OrderingTerm.desc(s.createdAt)]))
        .watch();
  }
}
```

- [ ] **Step 4: Run the whole test suite, verify green**

Run: `cd app && flutter test --timeout 60s`
Expected: PASS (including slice-1 tests that call `createSubject('name')` positionally).

- [ ] **Step 5: Commit**

```bash
git add app/lib/features/subjects/data/subject_repository.dart app/test/features/subjects/subject_repository_test.dart
git commit -m "feat: full subject CRUD in repository (colour, source, archive, soft delete)"
```

---

### Task 5: Subject CRUD UI

**Files:**
- Modify: `app/lib/features/subjects/presentation/subject_list_screen.dart`
- Test: `app/test/features/subjects/subject_list_screen_test.dart`

**Interfaces:**
- Consumes: every Task 4 method, exact signatures as listed there.

- [ ] **Step 1: Write the failing widget tests** (append to `subject_list_screen_test.dart`; factor the existing pump discipline into a helper if convenient, but keep the existing test's assertions intact)

```dart
  Future<AppDatabase> pumpApp(WidgetTester tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await ensureLocalUser(db);
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const MaterialApp(home: SubjectListScreen()),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    return db;
  }

  Future<void> unmount(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  }

  testWidgets('editing a subject renames it in the list', (tester) async {
    final db = await pumpApp(tester);
    await SubjectRepository(db).createSubject('Chem');
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Edit'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.enterText(
        find.widgetWithText(TextField, 'Chem'), 'Chemistry');
    await tester.tap(find.text('Save'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.widgetWithText(ListTile, 'Chemistry'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Chem'), findsNothing);
    await unmount(tester);
  });

  testWidgets('archiving moves a subject to the archived view',
      (tester) async {
    final db = await pumpApp(tester);
    await SubjectRepository(db).createSubject('Old semester');
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Archive'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.widgetWithText(ListTile, 'Old semester'), findsNothing);

    await tester.tap(find.byIcon(Icons.inventory_2_outlined));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.widgetWithText(ListTile, 'Old semester'), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('deleting a subject removes it after confirmation',
      (tester) async {
    final db = await pumpApp(tester);
    await SubjectRepository(db).createSubject('Mistake');
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Delete'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Delete').last); // confirm dialog action
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.widgetWithText(ListTile, 'Mistake'), findsNothing);
    await unmount(tester);
  });
```

(new import: `package:nerdyapp/features/subjects/data/subject_repository.dart`)

What would make them fail: the menu, edit dialog, archive toggle, or delete confirmation not existing or not calling the repository; the archived view not filtering.

- [ ] **Step 2: Run them, verify they fail**

Run: `cd app && flutter test test/features/subjects/subject_list_screen_test.dart --timeout 60s`
Expected: FAIL — no `more_vert` icon exists yet.

- [ ] **Step 3: Implement the UI**

Rework `subject_list_screen.dart`. Keep `_startSession` and `_backup` as they are; replace the create dialog with a shared form dialog and extend the list tiles:

```dart
const subjectPalette = <String>[
  '#EF5350', '#FFA726', '#FFD54F', '#66BB6A',
  '#4FC3F7', '#7986CB', '#BA68C8', '#A1887F',
];
const subjectSources = <String>['self', 'school', 'university', 'course'];

Color colorFromHex(String hex) =>
    Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));

class SubjectDraft {
  const SubjectDraft(
      {required this.name, this.color, required this.source, this.sourceName});
  final String name;
  final String? color;
  final String source;
  final String? sourceName;
}

// Riverpod 3 moved StateProvider to a legacy import; use the Notifier
// pattern already proven in SessionController instead.
final showArchivedProvider =
    NotifierProvider<ShowArchivedNotifier, bool>(ShowArchivedNotifier.new);

class ShowArchivedNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void toggle() => state = !state;
}

final subjectsProvider = StreamProvider<List<Subject>>((ref) => ref
    .watch(subjectRepositoryProvider)
    .watchSubjects(archived: ref.watch(showArchivedProvider)));
```

The form dialog (used by both create and edit):

```dart
class _SubjectDialog extends StatefulWidget {
  const _SubjectDialog({this.existing});

  final Subject? existing;

  @override
  State<_SubjectDialog> createState() => _SubjectDialogState();
}

class _SubjectDialogState extends State<_SubjectDialog> {
  late final TextEditingController _name =
      TextEditingController(text: widget.existing?.name ?? '');
  late final TextEditingController _sourceName =
      TextEditingController(text: widget.existing?.sourceName ?? '');
  late String? _color = widget.existing?.color;
  late String _source = widget.existing?.source ?? 'self';

  @override
  void dispose() {
    _name.dispose();
    _sourceName.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _name.text.trim();
    if (name.isEmpty) return;
    final sourceName = _sourceName.text.trim();
    Navigator.of(context).pop(SubjectDraft(
      name: name,
      color: _color,
      source: _source,
      sourceName: sourceName.isEmpty ? null : sourceName,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.existing == null ? 'New subject' : 'Edit subject'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _name,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Name'),
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              children: [
                for (final hex in subjectPalette)
                  GestureDetector(
                    onTap: () =>
                        setState(() => _color = _color == hex ? null : hex),
                    child: CircleAvatar(
                      radius: 14,
                      backgroundColor: colorFromHex(hex),
                      child: _color == hex
                          ? const Icon(Icons.check, size: 16)
                          : null,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _source,
              decoration: const InputDecoration(labelText: 'Source'),
              items: [
                for (final s in subjectSources)
                  DropdownMenuItem(value: s, child: Text(s)),
              ],
              onChanged: (v) => setState(() => _source = v ?? 'self'),
            ),
            TextField(
              controller: _sourceName,
              decoration: const InputDecoration(
                  labelText: 'Source name (e.g. Udemy)'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: Text(widget.existing == null ? 'Create' : 'Save'),
        ),
      ],
    );
  }
}
```

Screen changes:

```dart
  Future<void> _createSubject(BuildContext context, WidgetRef ref) async {
    final draft = await showDialog<SubjectDraft>(
      context: context,
      builder: (context) => const _SubjectDialog(),
    );
    if (draft == null) return;
    await ref.read(subjectRepositoryProvider).createSubject(
          draft.name,
          color: draft.color,
          source: draft.source,
          sourceName: draft.sourceName,
        );
  }

  Future<void> _editSubject(
      BuildContext context, WidgetRef ref, Subject subject) async {
    final draft = await showDialog<SubjectDraft>(
      context: context,
      builder: (context) => _SubjectDialog(existing: subject),
    );
    if (draft == null) return;
    await ref.read(subjectRepositoryProvider).updateSubject(
          subject.id,
          name: draft.name,
          color: draft.color,
          source: draft.source,
          sourceName: draft.sourceName,
        );
  }

  Future<void> _confirmDelete(
      BuildContext context, WidgetRef ref, Subject subject) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete ${subject.name}?'),
        content: const Text(
            'The subject leaves your lists. Past sessions keep its name.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed ?? false) {
      await ref.read(subjectRepositoryProvider).deleteSubject(subject.id);
    }
  }
```

In `build`, add the archived toggle as the first AppBar action:

```dart
          IconButton(
            icon: Icon(showArchived
                ? Icons.inventory_2
                : Icons.inventory_2_outlined),
            tooltip: showArchived ? 'Show active' : 'Show archived',
            onPressed: () =>
                ref.read(showArchivedProvider.notifier).toggle(),
          ),
```

(with `final showArchived = ref.watch(showArchivedProvider);` at the top of `build`, and the empty-state text switching to `'No archived subjects'` when `showArchived`).

Each list tile becomes:

```dart
                  return ListTile(
                    leading: CircleAvatar(
                      radius: 14,
                      backgroundColor: subject.color == null
                          ? Theme.of(context).colorScheme.surfaceContainerHighest
                          : colorFromHex(subject.color!),
                    ),
                    title: Text(subject.name),
                    subtitle: subject.source == 'self'
                        ? null
                        : Text(subject.sourceName == null
                            ? subject.source
                            : '${subject.source} · ${subject.sourceName}'),
                    onTap: showArchived
                        ? null
                        : () => _startSession(context, ref, subject.id),
                    trailing: PopupMenuButton<String>(
                      icon: const Icon(Icons.more_vert),
                      onSelected: (action) async {
                        switch (action) {
                          case 'edit':
                            await _editSubject(context, ref, subject);
                          case 'archive':
                            await ref
                                .read(subjectRepositoryProvider)
                                .setArchived(subject.id,
                                    archived: !subject.archived);
                          case 'delete':
                            await _confirmDelete(context, ref, subject);
                        }
                      },
                      itemBuilder: (context) => [
                        const PopupMenuItem(
                            value: 'edit', child: Text('Edit')),
                        PopupMenuItem(
                            value: 'archive',
                            child: Text(subject.archived
                                ? 'Unarchive'
                                : 'Archive')),
                        const PopupMenuItem(
                            value: 'delete', child: Text('Delete')),
                      ],
                    ),
                  );
```

Note the existing create test taps `find.text('Create')` and enters text into `find.byType(TextField)` — there are now two TextFields in the dialog, so update that existing test to target `find.widgetWithText(TextField, '').first` **only if it breaks**; prefer keeping it passing by checking first. If it fails on the ambiguous finder, change its enterText line to:

```dart
    await tester.enterText(
        find.ancestor(
            of: find.text('Name'), matching: find.byType(TextField)),
        'Physics');
```

- [ ] **Step 4: Run the widget tests, then the whole suite**

Run: `cd app && flutter test test/features/subjects/subject_list_screen_test.dart --timeout 60s`
Then: `cd app && flutter test --timeout 60s`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/features/subjects/presentation/subject_list_screen.dart app/test/features/subjects/subject_list_screen_test.dart
git commit -m "feat: subject edit, colour, source, archive and delete UI"
```

---

### Task 6: Real-clock end-to-end duration smoke test

**Files:**
- Test: `app/test/features/session/session_controller_test.dart` (same file as Task 2)

**Interfaces:**
- Consumes: `SessionController.start/togglePause/end` and the Task 1 repository. No production code changes — this task exists to catch a future regression that decouples recorded duration from the wall clock (the tick-counter failure architecture.md §3.4 bans).

- [ ] **Step 1: Write the test**

```dart
  test('real-clock session records wall time, active vs paused split',
      () async {
    final controller = container.read(sessionControllerProvider.notifier);
    await controller.start(subjectId);
    await Future<void>.delayed(const Duration(seconds: 2));
    await controller.togglePause(); // pause
    await Future<void>.delayed(const Duration(seconds: 2));
    await controller.togglePause(); // resume
    await Future<void>.delayed(const Duration(seconds: 2));
    await controller.end();

    final row = await db.select(db.sessions).getSingle();
    // ~4s active, ~2s paused; generous bounds for scheduler jitter.
    expect(row.actualDurationS, inInclusiveRange(3, 6));
    expect(row.pausedDurationS, inInclusiveRange(1, 4));
    expect(row.endReason, 'user_ended');
    expect(row.endedAt, isNotNull);
  });
```

What would make it fail: elapsed time derived from anything but real timestamps (no ticker runs in this test, so a tick-counter implementation records ~0), pause time folded into active time, or the end write not persisting.

- [ ] **Step 2: Run it, verify it passes** (this is a characterization of already-working code — red was Tasks 1–2's job)

Run: `cd app && flutter test test/features/session/session_controller_test.dart --timeout 60s`
Expected: PASS in ~6–8 s.

- [ ] **Step 3: Sanity-check it CAN fail** — temporarily change `end()`'s `actualDuration:` argument to `Duration.zero` in the controller, run, watch it go red, revert. Capture the red output for the PR body (guards-seen-red convention).

- [ ] **Step 4: Commit**

```bash
git add app/test/features/session/session_controller_test.dart
git commit -m "test: real-clock end-to-end session duration smoke test"
```

---

### Task 7: Changelog, full verification, PR

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Changelog entries** — under `## [Unreleased]` / `### Added`:

```markdown
- Crash recovery: sessions left open by a crash are closed on next launch with `end_reason = 'crashed'` (excluded from future streak inputs) and shown in history marked crashed.
- Full subject management: colour, source and source name, edit, archive/unarchive with an archived view, and soft delete that preserves session history.
```

and a new `### Changed` section:

```markdown
### Changed

- Pausing a session now persists immediately (previously only resume did), so crash recovery can close a session that died while paused at the exact pause moment.
- Ended sessions are immutable at the repository level: post-end writes are refused.
```

- [ ] **Step 2: Full local verification, output seen**

Run, from `app/`, sequentially (never in parallel):

```bash
flutter analyze
flutter test --timeout 60s
```

Expected: analyze clean; all tests green (~35+). Paste both outputs into the PR body.

- [ ] **Step 3: Commit, push, PR**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for phase-1 core-loop slice"
git push -u origin feat/phase-1-core-loop
```

PR via `gh pr create --title "feat: phase 1 remainder - core-loop correctness" --body-file <file>` (multiline `--body` mangles in this PowerShell setup — use a file). Body includes: scope, design decisions 1–6, the guards-seen-red evidence (Task 6 step 3), analyze/test output, and the **manual checklist for Isaac** below.

- [ ] **Step 4: Wait for CI green on the branch, then squash-merge**

```bash
gh pr checks --watch
gh pr merge --squash
```

- [ ] **Step 5: Update `docs/superpowers/HANDOFF.md`** — new LATEST block: state, what shipped, process notes, next slice (Phase 2 — survey + interruption log), and the outstanding manual checks.

## Manual verification (Isaac — cannot be delegated)

1. **Crash recovery:** launch the app, start a session, **pause it after ~2 min, resume, pause again**, then kill the process (Task Manager → End task, or `taskkill /f /im nerdyapp.exe`), relaunch → History shows the session marked `· crashed` with a duration close to the active time before the last pause. **Known limitation (design decision 1):** a session killed while running that never paused recovers with a duration near 0 — the last persisted write is its start. That is the honest lower bound, not a bug; a periodic liveness heartbeat is recorded as a follow-up.
2. **One-hour wall-clock accuracy (Phase 1 exit criterion):** start a real session alongside a phone stopwatch, include at least one pause/resume, end it at 60:00 on the stopwatch → recorded duration within 2 seconds of (60 min − paused time). Record the two numbers.
3. **Subject CRUD smoke:** create a subject with colour + source, edit it, archive it, check the archived view, unarchive, delete a scratch subject, confirm history still names it.

Until 1–2 are recorded, Phase 1's exit criteria are not fully met even if this slice is merged — track in the handoff.

## Review findings (dedicated independent review, 2026-07-26)

Scope: Tasks 1–3 and 6 (crash recovery + timer correctness). Verdict: ready with fixes; no Critical. All fixes applied before PR:

1. **(Important, fixed)** The real-clock smoke test's original bounds (2s pause, upper bound 6) sat exactly on the value produced by a pause-folded-into-active regression — the plan claimed the test caught a regression it couldn't. Fixed by widening the pause window to 3 s (folded wall time ≥ 7 s must exceed the [3, 6] active bound); probed red with `elapsed = now - startedAt` (`Actual: <7>`), reverted. This was a defect in *this plan's* Task 6 code — V2's "every defect was in the plan" lesson recurring again.
2. **(Important, fixed)** Interleaved `end()` / `togglePause()` could resurrect controller state for an ended session (DB stayed correct; UI ghosted). Fixed with post-await rechecks — identity check in `togglePause`, id check in `end` — plus a deterministic race test, probed red (`Actual: <Instance of 'ActiveSession'>`), reverted.
3. **(Important, plan fixed)** Manual checklist step 1 originally expected "a plausible duration" from an unpaused kill, contradicting design decision 1 (a never-paused crash recovers ~0). Checklist reworded above; **follow-up recorded:** a once-a-minute liveness write (persisting `totalPaused(now)` so the crashed-while-paused bound stays exact) would tighten the bound without violating the no-tick-counter rule and without schema changes.
4. **(Minor, fixed)** Recovery's inner UPDATE gained its own `endedAt.isNull()` guard (defense-in-depth outside the transaction) and the recovery test now asserts a literal second run recovers 0.
5. **(Minor, deferred)** `start()` double-tap can insert two open sessions (pre-existing); self-healing via recovery on next launch. Recorded in the handoff backlog with the heartbeat.
