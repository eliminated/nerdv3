# Slice 1 — Usable Study Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first V3 merge is a usable study session: launch the Windows app, create a subject, start/pause/end a timed session, and see it — persisted across restart — in a history list.

**Architecture:** Flutter Windows app, feature-first layering (presentation → domain → data), Riverpod for DI/state, Drift/SQLite as the only datastore. Schema v1 (the seven locked tables) is created whole in this slice and freezes at merge; the timer is a pure-Dart domain state machine that computes elapsed time from stored timestamps, never from a tick counter.

**Tech Stack:** Flutter 3.41.4 / Dart 3.11.1 (as installed), `drift` + `drift_dev` **exactly 2.34.0**, `flutter_riverpod` 3.3.2, `uuid` (v7), `path_provider`, `sqlite3_flutter_libs`.

**Execution mode (decided 2026-07-26 with Isaac):** Hybrid — inline execution by default; a **dedicated independent review pass on Tasks 2–3** (schema + bootstrap), the risk V1 and V2 both got wrong. Light review elsewhere.

**Branch:** `feat/slice-1-usable-session`, squash-merged via PR when the manual checklist passes.

## Global Constraints

- `drift: 2.34.0` and `drift_dev: 2.34.0` — **exact pins, no caret**. At 2.34.1+ the schema CLI cannot compile; green `build_runner` does not prove the schema tooling works.
- `flutter_riverpod: 3.3.2` — the version whose idioms V2 verified.
- The domain layer (`features/*/domain/`) imports **neither Flutter nor Drift**.
- Elapsed time is **never** derived from a tick counter — computed from stored `started_at` / pause timestamps on read (architecture.md §3.4).
- All timestamps are written as UTC instants. Drift stores epoch **seconds** and reads back local time: tests compare **instants at second precision**, never assert `isUtc`.
- `main()` calls `WidgetsFlutterBinding.ensureInitialized()` before anything touches `path_provider`.
- Never `pumpAndSettle()` while a `CircularProgressIndicator` is on screen — `pump()` + `pump(Duration)` instead.
- Never `git add -A` — stage explicit paths only.
- Conventional Commits (`feat:`, `chore:`, `test:`).
- **Schema v1 freezes when this slice merges.** Everything after is additive-only (masterplan §5). The migration harness and CI land in the next slice ("harden") — the freeze is *enforced* from that merge; this slice must therefore get the schema right by review, which is why Tasks 2–3 carry the dedicated review pass.
- Every test in this plan states (in its task) what change would make it fail. A test that can't fail is a plan defect (V2's most expensive lesson).

## Design decisions made by this plan (record in masterplan §10 during the harden slice)

1. **`sessions.goal_id` is omitted from schema v1.** data-model.md §3.4 declares it `REFERENCES goals(id)`, but `goals` isn't created until Phase 6, and SQLite cannot add an FK to an existing column later — the exact defect class V2 caught with `topic_id`. Phase 6 adds the column via `ALTER TABLE sessions ADD COLUMN goal_id TEXT REFERENCES goals(id)` (SQLite supports FK clauses on added nullable columns; legal under the additive-only law).
2. **`users.email` / `users.password_hash` keep their NOT NULL** to mirror the Postgres schema; the single local user row is seeded with sentinels (`local@device.invalid`, `''`). Auth is post-finish; nothing reads these fields before then.
3. **`daily_summaries.local_date` is stored as TEXT `'YYYY-MM-DD'`** (frozen at write time, locked decision 11). Not written in this slice — the table exists, empty.
4. **Pause bookkeeping:** the in-flight pause start lives in memory; accumulated `paused_duration_s` is persisted on every resume and at end. A crash mid-pause loses at most the current pause interval, and Phase 1's crash recovery marks such sessions `'crashed'` anyway.
5. **`end_reason` is `'user_ended'`** for every session in this slice — sessions are open-ended; `'completed'` (planned duration reached) is Phase 1.

## File Structure

```
app/                                      # created by flutter create, Windows only
├── pubspec.yaml                          # pinned deps; pubspec.lock committed
├── analysis_options.yaml                 # scaffold default (flutter_lints)
├── lib/
│   ├── main.dart                         # ensureInitialized → open db → ensureLocalUser → runApp
│   ├── core/
│   │   ├── ids.dart                      # UUIDv7 generation + fixed local-user id
│   │   ├── providers.dart                # databaseProvider, repository providers
│   │   └── db/
│   │       ├── tables.dart               # 7 table definitions + SyncColumns mixin + indexes
│   │       ├── database.dart             # AppDatabase, openConnection()
│   │       ├── database.g.dart           # generated
│   │       └── local_user.dart           # ensureLocalUser (race-safe)
│   └── features/
│       ├── subjects/
│       │   ├── data/subject_repository.dart
│       │   └── presentation/subject_list_screen.dart
│       └── session/
│           ├── domain/active_session.dart        # pure Dart state machine
│           ├── data/session_repository.dart      # persistence + history query
│           └── presentation/
│               ├── session_controller.dart       # Riverpod Notifier
│               ├── session_screen.dart           # timer display, pause/end
│               └── history_screen.dart
└── test/
    ├── core/db/schema_test.dart
    ├── core/db/local_user_test.dart
    ├── features/subjects/subject_repository_test.dart
    ├── features/subjects/subject_list_screen_test.dart
    └── features/session/
        ├── active_session_test.dart
        └── session_repository_test.dart
```

---

### Task 1: Flutter Windows scaffold with pinned dependencies

**Files:**
- Create: `app/` via `flutter create` (Windows platform only)
- Modify: `app/pubspec.yaml`
- Delete: `app/test/widget_test.dart` (counter boilerplate)

**Interfaces:**
- Produces: a building, analyzable Flutter Windows app that every later task works inside.

- [ ] **Step 1: Scaffold**

```bash
cd C:\Projects\nerdv3
git checkout -b feat/slice-1-usable-session
flutter create --platforms=windows --org com.nerdyapp --project-name nerdyapp app
```

- [ ] **Step 2: Pin dependencies**

In `app/pubspec.yaml`, set (keep the scaffold's generated `flutter_lints` line as-is):

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: 3.3.2
  drift: 2.34.0
  sqlite3_flutter_libs: ^0.5.24
  path_provider: ^2.1.4
  path: ^1.9.0
  uuid: ^4.4.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  drift_dev: 2.34.0
  build_runner: ^2.4.13
```

Note the **absence of carets on drift, drift_dev, and flutter_riverpod**.

- [ ] **Step 3: Remove counter boilerplate**

Delete `app/test/widget_test.dart`. Replace `app/lib/main.dart` body with a placeholder that compiles (real wiring lands in Task 7):

```dart
import 'package:flutter/material.dart';

void main() {
  runApp(const MaterialApp(home: Scaffold(body: Center(child: Text('NerdyApp')))));
}
```

- [ ] **Step 4: Verify toolchain**

```bash
cd app && flutter pub get && flutter analyze && flutter build windows
```

Expected: `pub get` resolves with drift 2.34.0 exactly (check `pubspec.lock`), analyze clean, Windows build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "chore: scaffold Flutter Windows app with pinned toolchain"
```

(`git add app` is acceptable here only because the directory is brand-new and just built clean; every later commit stages explicit files.)

---

### Task 2: Drift schema v1 — seven tables, FKs, partial indexes

**Files:**
- Create: `app/lib/core/db/tables.dart`
- Create: `app/lib/core/db/database.dart`
- Test: `app/test/core/db/schema_test.dart`

**Interfaces:**
- Produces: `AppDatabase` (constructor takes a `QueryExecutor`; `AppDatabase(NativeDatabase.memory())` in tests), `openConnection()` for the real app, generated row classes `User`, `Subject`, `Session`, … and companions `UsersCompanion`, `SubjectsCompanion`, `SessionsCompanion` used by Tasks 3–6.

⚠️ **This task and Task 3 get the dedicated independent review pass before Task 4 begins** (hybrid mode): reviewer checks the tables against data-model.md column-by-column, the FK list (nine references: spec minus `goal_id`), the partial indexes, and each test's ability to fail.

- [ ] **Step 1: Write the table definitions**

`app/lib/core/db/tables.dart`:

```dart
import 'package:drift/drift.dart';

/// Sync + soft-delete columns carried by every table (data-model.md §2).
/// sync_state is device-only and never transmitted.
mixin SyncColumns on Table {
  TextColumn get id => text()();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
  DateTimeColumn get updatedAt => dateTime().withDefault(currentDateAndTime)();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  TextColumn get syncState => text().withDefault(const Constant('local'))();
}

class Users extends Table with SyncColumns {
  TextColumn get email => text().unique()();
  TextColumn get passwordHash => text()();
  TextColumn get displayName => text().nullable()();
  TextColumn get timezone => text().withDefault(const Constant('UTC'))();
  IntColumn get dayStartHour => integer().withDefault(const Constant(4))();

  @override
  Set<Column> get primaryKey => {id};
}

@TableIndex.sql(
    'CREATE INDEX idx_subjects_user ON subjects (user_id) WHERE deleted_at IS NULL')
class Subjects extends Table with SyncColumns {
  TextColumn get userId => text().references(Users, #id)();
  TextColumn get name => text()();
  TextColumn get color => text().nullable()();
  TextColumn get source => text().withDefault(const Constant('self'))();
  TextColumn get sourceName => text().nullable()();
  BoolColumn get archived => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

@TableIndex.sql(
    'CREATE INDEX idx_topics_subject ON topics (subject_id) WHERE deleted_at IS NULL')
@TableIndex.sql('CREATE INDEX idx_topics_parent ON topics (parent_topic_id)')
class Topics extends Table with SyncColumns {
  TextColumn get subjectId => text().references(Subjects, #id)();
  TextColumn get parentTopicId => text().nullable().references(Topics, #id)();
  TextColumn get name => text()();
  IntColumn get orderIndex => integer().withDefault(const Constant(0))();
  TextColumn get status => text().withDefault(const Constant('not_started'))();

  @override
  Set<Column> get primaryKey => {id};
}

// NOTE: goal_id is deliberately absent — see "Design decisions" §1 in the plan header.
@TableIndex.sql(
    'CREATE INDEX idx_sessions_user_time ON sessions (user_id, started_at DESC) WHERE deleted_at IS NULL')
@TableIndex.sql('CREATE INDEX idx_sessions_topic ON sessions (topic_id)')
class Sessions extends Table with SyncColumns {
  TextColumn get userId => text().references(Users, #id)();
  TextColumn get subjectId => text().references(Subjects, #id)();
  TextColumn get topicId => text().nullable().references(Topics, #id)();
  TextColumn get mode => text()(); // 'plain'|'focused'|'ultra_focus'
  IntColumn get plannedDurationS => integer().nullable()();
  IntColumn get actualDurationS => integer().nullable()();
  IntColumn get pausedDurationS => integer().withDefault(const Constant(0))();
  DateTimeColumn get startedAt => dateTime()();
  DateTimeColumn get endedAt => dateTime().nullable()();
  TextColumn get endReason => text().nullable()();
  // 'completed'|'user_ended'|'abandoned'|'crashed'

  @override
  Set<Column> get primaryKey => {id};
}

class SessionSurveys extends Table with SyncColumns {
  TextColumn get sessionId => text().references(Sessions, #id).unique()();
  IntColumn get focusRating => integer()();
  IntColumn get comprehensionRating => integer().nullable()();
  IntColumn get difficultyRating => integer().nullable()();
  TextColumn get note => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

@TableIndex.sql(
    'CREATE INDEX idx_interruptions_session ON interruptions (session_id)')
class Interruptions extends Table with SyncColumns {
  TextColumn get sessionId => text().references(Sessions, #id)();
  TextColumn get kind => text()();
  DateTimeColumn get occurredAt => dateTime()();
  IntColumn get durationS => integer().nullable()();
  BoolColumn get blocked => boolean().withDefault(const Constant(false))();
  TextColumn get detail => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class DailySummaries extends Table with SyncColumns {
  TextColumn get userId => text().references(Users, #id)();
  TextColumn get localDate => text()(); // 'YYYY-MM-DD', frozen at write time
  IntColumn get totalSeconds => integer().withDefault(const Constant(0))();
  IntColumn get sessionCount => integer().withDefault(const Constant(0))();
  RealColumn get avgFocusRating => real().nullable()();
  BoolColumn get qualified => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
        {userId, localDate},
      ];
}
```

- [ ] **Step 2: Write the database class**

`app/lib/core/db/database.dart`:

```dart
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'tables.dart';

part 'database.g.dart';

@DriftDatabase(tables: [
  Users,
  Subjects,
  Topics,
  Sessions,
  SessionSurveys,
  Interruptions,
  DailySummaries,
])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.e);

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async => m.createAll(),
        beforeOpen: (details) async {
          await customStatement('PRAGMA foreign_keys = ON');
        },
      );
}

QueryExecutor openConnection() {
  return LazyDatabase(() async {
    final dir = await getApplicationSupportDirectory();
    return NativeDatabase.createInBackground(
        File(p.join(dir.path, 'nerdyapp.db')));
  });
}
```

- [ ] **Step 3: Generate code**

```bash
cd app && dart run build_runner build --delete-conflicting-outputs
```

Expected: `database.g.dart` generated, no errors. `flutter analyze` clean.

- [ ] **Step 4: Write the schema tests**

`app/test/core/db/schema_test.dart`:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nerdyapp/core/db/database.dart';

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<List<String>> sqliteMaster(String type) async {
    final rows = await db
        .customSelect("SELECT name FROM sqlite_master WHERE type = ?",
            variables: [Variable.withString(type)])
        .get();
    return rows.map((r) => r.read<String>('name')).toList();
  }

  test('all seven v1 tables exist', () async {
    final tables = await sqliteMaster('table');
    expect(
        tables,
        containsAll([
          'users',
          'subjects',
          'topics',
          'sessions',
          'session_surveys',
          'interruptions',
          'daily_summaries',
        ]));
  });

  test('the six v1 indexes exist, partial where data-model.md says so',
      () async {
    final rows = await db
        .customSelect(
            "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
        .get();
    final bySql = {
      for (final r in rows) r.read<String>('name'): r.read<String>('sql')
    };
    expect(
        bySql.keys,
        unorderedEquals([
          'idx_subjects_user',
          'idx_topics_subject',
          'idx_topics_parent',
          'idx_sessions_user_time',
          'idx_sessions_topic',
          'idx_interruptions_session',
        ]));
    for (final partial in [
      'idx_subjects_user',
      'idx_topics_subject',
      'idx_sessions_user_time'
    ]) {
      expect(bySql[partial], contains('WHERE deleted_at IS NULL'),
          reason: '$partial must be a partial index');
    }
  });

  test('foreign keys are enforced: subject with unknown user is rejected',
      () async {
    await expectLater(
        db.into(db.subjects).insert(SubjectsCompanion.insert(
            id: 'sub-1', userId: 'no-such-user', name: 'Physics')),
        throwsA(isA<SqliteException>()));
  });

  test('sessions.topic_id enforces its foreign key (V2 defect class)',
      () async {
    await db.into(db.users).insert(UsersCompanion.insert(
        id: 'u1', email: 'a@b.c', passwordHash: ''));
    await db.into(db.subjects).insert(
        SubjectsCompanion.insert(id: 's1', userId: 'u1', name: 'Maths'));
    await expectLater(
        db.into(db.sessions).insert(SessionsCompanion.insert(
              id: 'sess-1',
              userId: 'u1',
              subjectId: 's1',
              topicId: const Value('no-such-topic'),
              mode: 'plain',
              startedAt: DateTime.now().toUtc(),
            )),
        throwsA(isA<SqliteException>()));
  });

  test('DateTime round-trips as the same instant at second precision',
      () async {
    final written = DateTime.utc(2026, 7, 26, 13, 45, 12);
    await db.into(db.users).insert(UsersCompanion.insert(
        id: 'u1', email: 'a@b.c', passwordHash: '', createdAt: Value(written)));
    final read = (await db.select(db.users).getSingle()).createdAt;
    // Never assert read.isUtc — drift reads back local time. Compare instants.
    expect(read.toUtc().isAtSameMomentAs(written), isTrue);
  });

  test('daily_summaries rejects a duplicate (user_id, local_date)', () async {
    await db.into(db.users).insert(UsersCompanion.insert(
        id: 'u1', email: 'a@b.c', passwordHash: ''));
    await db.into(db.dailySummaries).insert(DailySummariesCompanion.insert(
        id: 'd1', userId: 'u1', localDate: '2026-07-26'));
    await expectLater(
        db.into(db.dailySummaries).insert(DailySummariesCompanion.insert(
            id: 'd2', userId: 'u1', localDate: '2026-07-26')),
        throwsA(isA<SqliteException>()));
  });
}
```

What makes each fail: dropping a table from `@DriftDatabase` (test 1); removing an index annotation or its `WHERE` clause (test 2); removing `PRAGMA foreign_keys = ON` or a `references()` (tests 3–4 — test 4 is precisely V2's `topic_id` defect); switching the column to store local time or asserting `isUtc` semantics (test 5); dropping `uniqueKeys` (test 6).

- [ ] **Step 5: Run the tests**

```bash
cd app && flutter test test/core/db/schema_test.dart
```

Expected: all pass. (If `sqlite3.dll` fails to load on the Windows host, V2 proved host tests workable — resolve before proceeding rather than skipping; the usual fix is ensuring the `sqlite3` native library is available to the test runner.)

- [ ] **Step 6: Commit**

```bash
git add app/lib/core/db/tables.dart app/lib/core/db/database.dart app/test/core/db/schema_test.dart
git commit -m "feat: add Drift schema v1 - seven tables, enforced FKs, partial indexes"
```

> Execution note: the root `.gitignore` (carried from V2) ignores `*.g.dart`, so
> `database.g.dart` is **not** committed. Consequence for the harden slice: CI must run
> `dart run build_runner build` before `flutter analyze` / `flutter test`.

---

### Task 3: Race-safe local-user bootstrap

**Files:**
- Create: `app/lib/core/ids.dart`
- Create: `app/lib/core/db/local_user.dart`
- Test: `app/test/core/db/local_user_test.dart`

**Interfaces:**
- Consumes: `AppDatabase`, `UsersCompanion` (Task 2).
- Produces: `const String localUserId` (fixed UUIDv7) and `Future<void> ensureLocalUser(AppDatabase db)` — Tasks 4, 6, 7 use `localUserId` for every `user_id`; `main()` calls `ensureLocalUser` before `runApp`.

- [ ] **Step 1: Write the failing test**

`app/test/core/db/local_user_test.dart`:

```dart
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/ids.dart';

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('ensureLocalUser seeds exactly one row with the fixed id', () async {
    await ensureLocalUser(db);
    final users = await db.select(db.users).get();
    expect(users, hasLength(1));
    expect(users.single.id, localUserId);
  });

  test('ensureLocalUser is idempotent and race-safe', () async {
    // V2's defect was read-then-insert with no transaction: concurrent
    // callers either duplicated the row or threw on the PK collision.
    await Future.wait(List.generate(100, (_) => ensureLocalUser(db)));
    final users = await db.select(db.users).get();
    expect(users, hasLength(1));
  });
}
```

What makes them fail: a read-then-insert implementation throws on interleaved PK collisions under `Future.wait` (test 2); changing the seeded id (test 1).

- [ ] **Step 2: Run tests, expect failure**

```bash
cd app && flutter test test/core/db/local_user_test.dart
```

Expected: FAIL — `local_user.dart` / `ids.dart` don't exist.

- [ ] **Step 3: Implement**

`app/lib/core/ids.dart`:

```dart
import 'package:uuid/uuid.dart';

/// Fixed UUIDv7 for the single local user row (masterplan locked decision 4).
/// Constant so a future server sync can rely on it; never regenerate.
const String localUserId = '01920000-0000-7000-8000-000000000001';

const Uuid _uuid = Uuid();

String newId() => _uuid.v7();
```

`app/lib/core/db/local_user.dart`:

```dart
import 'package:drift/drift.dart';

import '../ids.dart';
import 'database.dart';

/// Seeds the single local user row (masterplan locked decision 4).
/// insertOrIgnore on the primary key makes this atomic and idempotent —
/// no read-then-insert race (V2 post-mortem defect 4).
Future<void> ensureLocalUser(AppDatabase db) async {
  await db.into(db.users).insert(
        UsersCompanion.insert(
          id: localUserId,
          email: 'local@device.invalid',
          passwordHash: '',
        ),
        mode: InsertMode.insertOrIgnore,
      );
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd app && flutter test test/core/db/local_user_test.dart
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/core/ids.dart app/lib/core/db/local_user.dart app/test/core/db/local_user_test.dart
git commit -m "feat: race-safe single local-user bootstrap"
```

- [ ] **Step 6: Dedicated review checkpoint (Tasks 2 + 3)**

Dispatch an independent review (superpowers:requesting-code-review) scoped to Tasks 2–3 with the review brief: verify tables column-by-column against data-model.md §3–4, verify all nine FKs are declared and *enforced*, verify the partial indexes, verify the two design deviations (no `goal_id`, sentinel user fields) are documented, and for every test state the change that would make it fail. Fix findings before Task 4.

---

### Task 4: Subject creation and list (repository)

**Files:**
- Create: `app/lib/features/subjects/data/subject_repository.dart`
- Create: `app/lib/core/providers.dart`
- Test: `app/test/features/subjects/subject_repository_test.dart`

**Interfaces:**
- Consumes: `AppDatabase`, `SubjectsCompanion`, `localUserId`, `newId()`.
- Produces: `SubjectRepository` with `Future<String> createSubject(String name)` (returns the new id) and `Stream<List<Subject>> watchSubjects()` (live, soft-deleted excluded, newest first). `databaseProvider` / `subjectRepositoryProvider` in `core/providers.dart`.

- [ ] **Step 1: Write the failing test**

`app/test/features/subjects/subject_repository_test.dart`:

```dart
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

void main() {
  late AppDatabase db;
  late SubjectRepository repo;

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    await ensureLocalUser(db);
    repo = SubjectRepository(db);
  });
  tearDown(() => db.close());

  test('createSubject inserts a row visible to watchSubjects', () async {
    await repo.createSubject('Physics');
    final subjects = await repo.watchSubjects().first;
    expect(subjects, hasLength(1));
    expect(subjects.single.name, 'Physics');
  });

  test('watchSubjects excludes soft-deleted rows', () async {
    final id = await repo.createSubject('Old');
    await (db.update(db.subjects)..where((s) => s.id.equals(id))).write(
        SubjectsCompanion(deletedAt: Value(DateTime.now().toUtc())));
    final subjects = await repo.watchSubjects().first;
    expect(subjects, isEmpty);
  });
}
```

(Add `import 'package:drift/drift.dart' show Value, SubjectsCompanion;` as needed — the generated companion comes from `database.dart`.)

What makes them fail: not writing the row, or a `watchSubjects` that forgets `deleted_at IS NULL` (test 2 — the filter data-model.md §2 mandates on *all* queries).

- [ ] **Step 2: Run test, expect failure** — `flutter test test/features/subjects/subject_repository_test.dart` → FAIL (no repository).

- [ ] **Step 3: Implement**

`app/lib/features/subjects/data/subject_repository.dart`:

```dart
import 'package:drift/drift.dart';

import '../../../core/db/database.dart';
import '../../../core/ids.dart';

class SubjectRepository {
  SubjectRepository(this._db);

  final AppDatabase _db;

  Future<String> createSubject(String name) async {
    final id = newId();
    await _db.into(_db.subjects).insert(SubjectsCompanion.insert(
          id: id,
          userId: localUserId,
          name: name,
        ));
    return id;
  }

  Stream<List<Subject>> watchSubjects() {
    return (_db.select(_db.subjects)
          ..where((s) => s.deletedAt.isNull())
          ..orderBy([(s) => OrderingTerm.desc(s.createdAt)]))
        .watch();
  }
}
```

`app/lib/core/providers.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/session/data/session_repository.dart';
import '../features/subjects/data/subject_repository.dart';
import 'db/database.dart';

/// Overridden in main() with the real database, and in tests with in-memory.
final databaseProvider = Provider<AppDatabase>(
  (ref) => throw UnimplementedError('databaseProvider must be overridden'),
);

final subjectRepositoryProvider = Provider<SubjectRepository>(
  (ref) => SubjectRepository(ref.watch(databaseProvider)),
);

final sessionRepositoryProvider = Provider<SessionRepository>(
  (ref) => SessionRepository(ref.watch(databaseProvider)),
);
```

(`session_repository.dart` doesn't exist until Task 6 — create `providers.dart` in this task with only the first two providers, and add `sessionRepositoryProvider` in Task 6.)

- [ ] **Step 4: Run test, expect pass** — `flutter test test/features/subjects/subject_repository_test.dart` → PASS. `flutter analyze` clean.

- [ ] **Step 5: Commit**

```bash
git add app/lib/features/subjects/data/subject_repository.dart app/lib/core/providers.dart app/test/features/subjects/subject_repository_test.dart
git commit -m "feat: subject creation and live subject list"
```

---

### Task 5: Session timing domain model (pure Dart, test-first)

**Files:**
- Create: `app/lib/features/session/domain/active_session.dart`
- Test: `app/test/features/session/active_session_test.dart`

**Interfaces:**
- Consumes: nothing — **no Flutter, no Drift imports**.
- Produces: immutable `ActiveSession` with:
  - `ActiveSession.start({required String id, required String subjectId, required DateTime startedAt})`
  - `bool get isPaused`
  - `ActiveSession pause(DateTime now)` / `ActiveSession resume(DateTime now)` (each `throw StateError` if already in that state)
  - `Duration elapsed(DateTime now)` — running time excluding pauses; frozen while paused
  - `Duration totalPaused(DateTime now)` — accumulated + in-flight pause
  - fields `String id`, `String subjectId`, `DateTime startedAt`, `Duration accumulatedPause`, `DateTime? pauseStartedAt`

- [ ] **Step 1: Write the failing tests**

`app/test/features/session/active_session_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nerdyapp/features/session/domain/active_session.dart';

void main() {
  final t0 = DateTime.utc(2026, 7, 26, 10);
  DateTime at(int minutes) => t0.add(Duration(minutes: minutes));
  ActiveSession started() =>
      ActiveSession.start(id: 'id', subjectId: 'subj', startedAt: t0);

  test('elapsed tracks wall clock while running', () {
    expect(started().elapsed(at(5)), const Duration(minutes: 5));
  });

  test('a pause/resume cycle is excluded from elapsed', () {
    final s = started().pause(at(10)).resume(at(15));
    expect(s.elapsed(at(20)), const Duration(minutes: 15));
    expect(s.totalPaused(at(20)), const Duration(minutes: 5));
  });

  test('elapsed freezes during an in-flight pause', () {
    final s = started().pause(at(10));
    expect(s.elapsed(at(25)), const Duration(minutes: 10));
    expect(s.totalPaused(at(25)), const Duration(minutes: 15));
  });

  test('multiple pause cycles accumulate', () {
    final s = started()
        .pause(at(10))
        .resume(at(12))
        .pause(at(20))
        .resume(at(25));
    expect(s.elapsed(at(30)), const Duration(minutes: 23));
    expect(s.totalPaused(at(30)), const Duration(minutes: 7));
  });

  test('pause while paused throws', () {
    expect(() => started().pause(at(1)).pause(at(2)), throwsStateError);
  });

  test('resume while running throws', () {
    expect(() => started().resume(at(1)), throwsStateError);
  });
}
```

What makes them fail: deriving elapsed from a tick counter cannot produce these answers from timestamps alone; forgetting to subtract the in-flight pause fails tests 3–4; missing state guards fails 5–6.

- [ ] **Step 2: Run tests, expect failure** — `flutter test test/features/session/active_session_test.dart` → FAIL (class missing).

- [ ] **Step 3: Implement**

`app/lib/features/session/domain/active_session.dart`:

```dart
/// Pure-Dart session timing state machine (architecture.md §3.4).
/// Elapsed time is always computed from timestamps — never a tick counter.
class ActiveSession {
  const ActiveSession._({
    required this.id,
    required this.subjectId,
    required this.startedAt,
    required this.accumulatedPause,
    required this.pauseStartedAt,
  });

  factory ActiveSession.start({
    required String id,
    required String subjectId,
    required DateTime startedAt,
  }) =>
      ActiveSession._(
        id: id,
        subjectId: subjectId,
        startedAt: startedAt,
        accumulatedPause: Duration.zero,
        pauseStartedAt: null,
      );

  final String id;
  final String subjectId;
  final DateTime startedAt;
  final Duration accumulatedPause;
  final DateTime? pauseStartedAt;

  bool get isPaused => pauseStartedAt != null;

  ActiveSession pause(DateTime now) {
    if (isPaused) throw StateError('already paused');
    return ActiveSession._(
      id: id,
      subjectId: subjectId,
      startedAt: startedAt,
      accumulatedPause: accumulatedPause,
      pauseStartedAt: now,
    );
  }

  ActiveSession resume(DateTime now) {
    if (!isPaused) throw StateError('not paused');
    return ActiveSession._(
      id: id,
      subjectId: subjectId,
      startedAt: startedAt,
      accumulatedPause: accumulatedPause + now.difference(pauseStartedAt!),
      pauseStartedAt: null,
    );
  }

  Duration totalPaused(DateTime now) =>
      accumulatedPause +
      (isPaused ? now.difference(pauseStartedAt!) : Duration.zero);

  Duration elapsed(DateTime now) =>
      now.difference(startedAt) - totalPaused(now);
}
```

- [ ] **Step 4: Run tests, expect pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/features/session/domain/active_session.dart app/test/features/session/active_session_test.dart
git commit -m "feat: session timing domain model computed from timestamps"
```

---

### Task 6: Session persistence and history query

**Files:**
- Create: `app/lib/features/session/data/session_repository.dart`
- Modify: `app/lib/core/providers.dart` (add `sessionRepositoryProvider` from Task 4's listing)
- Test: `app/test/features/session/session_repository_test.dart`

**Interfaces:**
- Consumes: `AppDatabase`, `SessionsCompanion`, `localUserId`, `ActiveSession`.
- Produces: `SessionRepository` with:
  - `Future<void> insertStartedSession(ActiveSession s)` — writes the in-progress row, `mode: 'plain'`
  - `Future<void> updatePausedDuration(String id, Duration totalPaused)` — persisted on every resume
  - `Future<void> endSession({required String id, required DateTime endedAt, required Duration actualDuration, required Duration totalPaused})` — writes `ended_at`, `actual_duration_s`, `paused_duration_s`, `end_reason: 'user_ended'`
  - `Stream<List<HistoryEntry>> watchHistory()` — ended, non-deleted sessions, newest first, joined to subject name
  - `class HistoryEntry { String sessionId; String subjectName; DateTime startedAt; Duration actualDuration; }`

- [ ] **Step 1: Write the failing tests**

`app/test/features/session/session_repository_test.dart`:

```dart
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/features/session/data/session_repository.dart';
import 'package:nerdyapp/features/session/domain/active_session.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

void main() {
  late AppDatabase db;
  late SessionRepository repo;
  late String subjectId;
  final t0 = DateTime.utc(2026, 7, 26, 10);

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    await ensureLocalUser(db);
    subjectId = await SubjectRepository(db).createSubject('Physics');
    repo = SessionRepository(db);
  });
  tearDown(() => db.close());

  ActiveSession start() =>
      ActiveSession.start(id: 'sess-1', subjectId: subjectId, startedAt: t0);

  test('a started session is persisted in progress and absent from history',
      () async {
    await repo.insertStartedSession(start());
    final row = await db.select(db.sessions).getSingle();
    expect(row.endedAt, isNull);
    expect(row.mode, 'plain');
    expect(row.startedAt.toUtc().isAtSameMomentAs(t0), isTrue);
    expect(await repo.watchHistory().first, isEmpty);
  });

  test('ending writes duration fields and end_reason user_ended', () async {
    final s = start().pause(t0.add(const Duration(minutes: 10)))
        .resume(t0.add(const Duration(minutes: 12)));
    await repo.insertStartedSession(s);
    final endAt = t0.add(const Duration(minutes: 30));
    await repo.endSession(
      id: s.id,
      endedAt: endAt,
      actualDuration: s.elapsed(endAt),
      totalPaused: s.totalPaused(endAt),
    );
    final row = await db.select(db.sessions).getSingle();
    expect(row.actualDurationS, 28 * 60);
    expect(row.pausedDurationS, 2 * 60);
    expect(row.endReason, 'user_ended');
    expect(row.endedAt!.toUtc().isAtSameMomentAs(endAt), isTrue);
  });

  test('history lists ended sessions newest first with subject name',
      () async {
    for (final (id, offsetMin) in [('a', 0), ('b', 60)]) {
      final s = ActiveSession.start(
          id: id,
          subjectId: subjectId,
          startedAt: t0.add(Duration(minutes: offsetMin)));
      await repo.insertStartedSession(s);
      final endAt = s.startedAt.add(const Duration(minutes: 25));
      await repo.endSession(
          id: id,
          endedAt: endAt,
          actualDuration: s.elapsed(endAt),
          totalPaused: Duration.zero);
    }
    final history = await repo.watchHistory().first;
    expect(history.map((h) => h.sessionId), ['b', 'a']);
    expect(history.first.subjectName, 'Physics');
    expect(history.first.actualDuration, const Duration(minutes: 25));
  });
}
```

What makes them fail: history that includes in-progress sessions (test 1); merging paused time into `actual_duration_s` — data-model.md explicitly calls that dishonest (test 2, `28*60` vs `30*60`); wrong sort order or missing join (test 3).

- [ ] **Step 2: Run tests, expect failure** — FAIL (no repository).

- [ ] **Step 3: Implement**

`app/lib/features/session/data/session_repository.dart`:

```dart
import 'package:drift/drift.dart';

import '../../../core/db/database.dart';
import '../../../core/ids.dart';
import '../domain/active_session.dart';

class HistoryEntry {
  const HistoryEntry({
    required this.sessionId,
    required this.subjectName,
    required this.startedAt,
    required this.actualDuration,
  });

  final String sessionId;
  final String subjectName;
  final DateTime startedAt;
  final Duration actualDuration;
}

class SessionRepository {
  SessionRepository(this._db);

  final AppDatabase _db;

  Future<void> insertStartedSession(ActiveSession s) async {
    await _db.into(_db.sessions).insert(SessionsCompanion.insert(
          id: s.id,
          userId: localUserId,
          subjectId: s.subjectId,
          mode: 'plain',
          startedAt: s.startedAt,
        ));
  }

  Future<void> updatePausedDuration(String id, Duration totalPaused) async {
    await (_db.update(_db.sessions)..where((t) => t.id.equals(id))).write(
      SessionsCompanion(
        pausedDurationS: Value(totalPaused.inSeconds),
        updatedAt: Value(DateTime.now().toUtc()),
      ),
    );
  }

  Future<void> endSession({
    required String id,
    required DateTime endedAt,
    required Duration actualDuration,
    required Duration totalPaused,
  }) async {
    await (_db.update(_db.sessions)..where((t) => t.id.equals(id))).write(
      SessionsCompanion(
        endedAt: Value(endedAt),
        actualDurationS: Value(actualDuration.inSeconds),
        pausedDurationS: Value(totalPaused.inSeconds),
        endReason: const Value('user_ended'),
        updatedAt: Value(DateTime.now().toUtc()),
      ),
    );
  }

  Stream<List<HistoryEntry>> watchHistory() {
    final query = _db.select(_db.sessions).join([
      innerJoin(_db.subjects, _db.subjects.id.equalsExp(_db.sessions.subjectId)),
    ])
      ..where(_db.sessions.deletedAt.isNull() &
          _db.sessions.endedAt.isNotNull())
      ..orderBy([OrderingTerm.desc(_db.sessions.startedAt)]);
    return query.watch().map((rows) => rows.map((row) {
          final session = row.readTable(_db.sessions);
          final subject = row.readTable(_db.subjects);
          return HistoryEntry(
            sessionId: session.id,
            subjectName: subject.name,
            startedAt: session.startedAt,
            actualDuration: Duration(seconds: session.actualDurationS ?? 0),
          );
        }).toList());
  }
}
```

Also add `sessionRepositoryProvider` to `app/lib/core/providers.dart` exactly as shown in Task 4 Step 3.

- [ ] **Step 4: Run tests, expect pass** — PASS. Run the full suite: `flutter test` — all green, `flutter analyze` clean.

- [ ] **Step 5: Commit**

```bash
git add app/lib/features/session/data/session_repository.dart app/lib/core/providers.dart app/test/features/session/session_repository_test.dart
git commit -m "feat: session persistence and history query"
```

---

### Task 7: UI — wire it together

**Files:**
- Create: `app/lib/features/session/presentation/session_controller.dart`
- Create: `app/lib/features/session/presentation/session_screen.dart`
- Create: `app/lib/features/session/presentation/history_screen.dart`
- Create: `app/lib/features/subjects/presentation/subject_list_screen.dart`
- Modify: `app/lib/main.dart`
- Test: `app/test/features/subjects/subject_list_screen_test.dart`

**Interfaces:**
- Consumes: everything above.
- Produces: the running app. `sessionControllerProvider` (`NotifierProvider<SessionController, ActiveSession?>`) with `start(String subjectId)`, `togglePause()`, `Future<void> end()`.

- [ ] **Step 1: Session controller**

`app/lib/features/session/presentation/session_controller.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/ids.dart';
import '../../../core/providers.dart';
import '../domain/active_session.dart';

final sessionControllerProvider =
    NotifierProvider<SessionController, ActiveSession?>(SessionController.new);

class SessionController extends Notifier<ActiveSession?> {
  @override
  ActiveSession? build() => null;

  DateTime _now() => DateTime.now().toUtc();

  Future<void> start(String subjectId) async {
    if (state != null) throw StateError('a session is already running');
    final session = ActiveSession.start(
        id: newId(), subjectId: subjectId, startedAt: _now());
    await ref.read(sessionRepositoryProvider).insertStartedSession(session);
    state = session;
  }

  Future<void> togglePause() async {
    final s = state;
    if (s == null) return;
    if (s.isPaused) {
      final resumed = s.resume(_now());
      await ref
          .read(sessionRepositoryProvider)
          .updatePausedDuration(resumed.id, resumed.accumulatedPause);
      state = resumed;
    } else {
      state = s.pause(_now());
    }
  }

  Future<void> end() async {
    final s = state;
    if (s == null) return;
    final now = _now();
    await ref.read(sessionRepositoryProvider).endSession(
          id: s.id,
          endedAt: now,
          actualDuration: s.elapsed(now),
          totalPaused: s.totalPaused(now),
        );
    state = null;
  }
}
```

- [ ] **Step 2: Session screen**

`app/lib/features/session/presentation/session_screen.dart`:

```dart
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'session_controller.dart';

String formatDuration(Duration d) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.inHours)}:${two(d.inMinutes % 60)}:${two(d.inSeconds % 60)}';
}

class SessionScreen extends ConsumerStatefulWidget {
  const SessionScreen({super.key});

  @override
  ConsumerState<SessionScreen> createState() => _SessionScreenState();
}

class _SessionScreenState extends ConsumerState<SessionScreen> {
  late final Timer _ticker;

  @override
  void initState() {
    super.initState();
    // The ticker only repaints; elapsed time always comes from timestamps.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider);
    if (session == null) {
      return const Scaffold(body: Center(child: Text('No active session')));
    }
    final elapsed = session.elapsed(DateTime.now().toUtc());
    return Scaffold(
      appBar: AppBar(title: const Text('Study session')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(formatDuration(elapsed),
                style: Theme.of(context).textTheme.displayLarge),
            if (session.isPaused)
              const Padding(
                padding: EdgeInsets.all(8),
                child: Text('Paused'),
              ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                FilledButton.tonal(
                  onPressed: () =>
                      ref.read(sessionControllerProvider.notifier).togglePause(),
                  child: Text(session.isPaused ? 'Resume' : 'Pause'),
                ),
                const SizedBox(width: 16),
                FilledButton(
                  onPressed: () async {
                    await ref.read(sessionControllerProvider.notifier).end();
                    if (context.mounted) Navigator.of(context).pop();
                  },
                  child: const Text('End session'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 3: History screen**

`app/lib/features/session/presentation/history_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/session_repository.dart';
import 'session_screen.dart' show formatDuration;

final historyProvider = StreamProvider<List<HistoryEntry>>(
    (ref) => ref.watch(sessionRepositoryProvider).watchHistory());

class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(historyProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('History')),
      body: history.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (entries) => entries.isEmpty
            ? const Center(child: Text('No sessions yet'))
            : ListView.builder(
                itemCount: entries.length,
                itemBuilder: (context, i) {
                  final e = entries[i];
                  return ListTile(
                    title: Text(e.subjectName),
                    subtitle: Text(e.startedAt.toLocal().toString()),
                    trailing: Text(formatDuration(e.actualDuration)),
                  );
                },
              ),
      ),
    );
  }
}
```

- [ ] **Step 4: Subject list screen**

`app/lib/features/subjects/presentation/subject_list_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/db/database.dart';
import '../../../core/providers.dart';
import '../../session/presentation/session_controller.dart';
import '../../session/presentation/history_screen.dart';
import '../../session/presentation/session_screen.dart';

final subjectsProvider = StreamProvider<List<Subject>>(
    (ref) => ref.watch(subjectRepositoryProvider).watchSubjects());

class SubjectListScreen extends ConsumerWidget {
  const SubjectListScreen({super.key});

  Future<void> _createSubject(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New subject'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Name'),
          onSubmitted: (v) => Navigator.of(context).pop(v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (name != null && name.trim().isNotEmpty) {
      await ref.read(subjectRepositoryProvider).createSubject(name.trim());
    }
  }

  Future<void> _startSession(
      BuildContext context, WidgetRef ref, String subjectId) async {
    await ref.read(sessionControllerProvider.notifier).start(subjectId);
    if (context.mounted) {
      await Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => const SessionScreen()));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subjects = ref.watch(subjectsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('NerdyApp'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: 'History',
            onPressed: () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const HistoryScreen())),
          ),
        ],
      ),
      body: subjects.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (list) => list.isEmpty
            ? const Center(
                child: Text('Create a subject to start studying'))
            : ListView.builder(
                itemCount: list.length,
                itemBuilder: (context, i) {
                  final subject = list[i];
                  return ListTile(
                    title: Text(subject.name),
                    trailing: const Icon(Icons.play_arrow),
                    onTap: () => _startSession(context, ref, subject.id),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _createSubject(context, ref),
        child: const Icon(Icons.add),
      ),
    );
  }
}
```

- [ ] **Step 5: main.dart**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/db/database.dart';
import 'core/db/local_user.dart';
import 'core/providers.dart';
import 'features/subjects/presentation/subject_list_screen.dart';

Future<void> main() async {
  // Required before any provider reaches path_provider (V2-verified crash).
  WidgetsFlutterBinding.ensureInitialized();
  final db = AppDatabase(openConnection());
  await ensureLocalUser(db);
  runApp(ProviderScope(
    overrides: [databaseProvider.overrideWithValue(db)],
    child: const NerdyApp(),
  ));
}

class NerdyApp extends StatelessWidget {
  const NerdyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NerdyApp',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
      home: const SubjectListScreen(),
    );
  }
}
```

- [ ] **Step 6: Widget test (light — UI is low-risk per hybrid mode)**

`app/test/features/subjects/subject_list_screen_test.dart`:

```dart
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/providers.dart';
import 'package:nerdyapp/features/subjects/presentation/subject_list_screen.dart';

void main() {
  testWidgets('creating a subject shows it in the list', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await ensureLocalUser(db);

    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const MaterialApp(home: SubjectListScreen()),
    ));
    // Never pumpAndSettle while the loading spinner is up (V2-verified hang).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Create a subject to start studying'), findsOneWidget);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(TextField), 'Physics');
    await tester.tap(find.text('Create'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Physics'), findsOneWidget);
  });
}
```

What makes it fail: the create dialog not writing through the repository, or the list not watching the stream.

- [ ] **Step 7: Full verification**

```bash
cd app && flutter analyze && flutter test && flutter build windows
```

Expected: analyze clean, all tests green, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add app/lib/main.dart app/lib/features/session/presentation app/lib/features/subjects/presentation app/test/features/subjects/subject_list_screen_test.dart
git commit -m "feat: session timer UI, subject list and history screens"
```

---

### Task 8: Manual verification (human at keyboard), changelog, PR

**Files:**
- Modify: `CHANGELOG.md`

Manual verification **cannot be delegated to an agent** (handoff gotcha) — the checklist below is executed by Isaac.

- [ ] **Step 1: Manual checklist — run by the human partner**

1. `cd app && flutter run -d windows` — the app launches.
2. Create subject "Physics" — it appears in the list.
3. Tap it — session screen shows a counting timer.
4. Pause; wait ~30s; confirm the timer holds still. Resume; confirm it continues from where it paused (not jumped forward).
5. End the session — history shows the session with a duration that matches what the timer displayed (±2s).
6. Close the app fully. Relaunch. Subject **and** history entry are still there.

- [ ] **Step 2: CHANGELOG entry**

Replace the empty `CHANGELOG.md` with:

```markdown
# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are release versions (SemVer), within build iteration V3.

## [Unreleased]

### Added

- Flutter Windows app scaffold with pinned toolchain (drift 2.34.0, Riverpod 3.3.2).
- Drift schema v1: seven locked tables with enforced foreign keys and partial indexes. Frozen at this merge; all later changes additive-only.
- Single local-user bootstrap (fixed UUIDv7, race-safe).
- Subjects: create and list.
- Study sessions: start, pause/resume, end — elapsed time computed from timestamps, persisted, with a session history list.
```

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for slice 1"
```

- [ ] **Step 3: PR**

```bash
git push -u origin feat/slice-1-usable-session
gh pr create --title "feat: slice 1 - usable study session" --body "First V3 slice: scaffold, schema v1 (frozen at merge), local-user bootstrap, subjects, session timer with pause, persistence, history. Manual checklist executed by Isaac. Design deviations from data-model.md documented in docs/superpowers/plans/2026-07-26-slice-1-usable-session.md (goal_id deferred to Phase 6; sentinel local-user fields)."
```

Squash-merge after checklist passes. Then update `docs/superpowers/HANDOFF.md` per the locked workflow.

---

## Deferred to the next slice ("harden") — deliberately not here

- CI on `windows-latest` (one command per step — pwsh exit-code gotcha).
- Migration harness + schema-v1 verification test (with `validateDropped: true` and the `git add --intent-to-add` dump guard — both V2 holes).
- One-button database backup.
- Docs hygiene: README roadmap rewrite (+ changelog row), MIT LICENSE, CONTRIBUTING.md, focus-enforcement.md §4 correction, masterplan §10 rows for this plan's design deviations.

### Review findings from the Tasks 2–3 checkpoint (applied in-slice or queued)

Applied before merge: survey rating CHECK constraints added in-schema (a plan defect — the
plan's own Step 1 listing omitted data-model.md §3.5's CHECKs, and SQLite cannot add one
post-freeze); a nine-FK freeze-guard test via `PRAGMA foreign_key_list`; exact-set table
assertion; non-partial assertions on the three full indexes.

Queued for the harden slice's masterplan §10 rows:
- `users.email` is TEXT UNIQUE (case-sensitive); spec says CITEXT. Decide `COLLATE NOCASE`
  vs app-layer dedup when auth nears.
- data-model.md §3.4's "only `ended_at`, `actual_duration_s`, `end_reason` are written after
  creation" needs rewording: pause bookkeeping also writes `paused_duration_s` and
  `updated_at` *while in progress*. The real invariant is "immutable once ended".
