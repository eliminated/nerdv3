# Phase 2 — The Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the post-session survey and write the interruption log (`manual_pause`, `self_reported`), read both back inline in Stats, and satisfy masterplan §7 Phase 2's three exit criteria with tests that can actually fail.

**Spec:** `docs/superpowers/specs/2026-07-26-phase-2-signal-design.md` — binding. It records the decisions, the eight corrections applied to the winning design pass, and the doc edits. Read §4.2 and §7 before touching the controller.

**Architecture:** Two new repositories (`SurveyRepository`, `InterruptionRepository`) registered in `core/providers.dart`; the survey dialog pops a value and `startSessionFlow` writes it; `manual_pause` is written once per *completed* pause from the two places a pause can close (resume leg of `togglePause`, and `end()` when live state is still paused); a generic `logSessionEvent` keeps `blocked` load-bearing for Phase 3. Reads go through one new projection consumed by an inline expansion in Stats. **No schema change; `schemaVersion` stays 1.**

**Tech Stack:** unchanged. No new packages.

**Execution:** inline, TDD. Dedicated independent review before PR on the controller write path (§4.2) and the three exit-criterion tests.

**Branch:** `feat/phase-2-signal`, squash-merged when CI is green.

## Global Constraints

- All prior constraints hold: drift/drift_dev pinned exactly 2.34.0; timestamps written `.toUtc()`; compare **instants** (`toUtc().isAtSameMomentAs`), never `isUtc`; never `git add -A`; never `pumpAndSettle` while a spinner is on screen; end widget tests with `pumpWidget(SizedBox())` + `pump(Duration(seconds: 1))`; desktop views need `tester.view.physicalSize = Size(1600,1000)` + `addTearDown(tester.view.reset)`; **never run two `flutter test` invocations concurrently**; use `--timeout 60s` while iterating; import drift in tests with `hide isNull, isNotNull`; restore phantom CRLF diffs on `app/windows/flutter/generated_*` before committing.
- **Zero schema changes.** No edit to `app/drift_schemas/`, `app/test/generated/schema*.dart`, or `schemaVersion`. A diff touching them is a stop.
- **`interruption_repository.dart` must never contain the string `detail`.** No public method takes a `detail` parameter.
- **Every test states what would make it fail**, and the two source-scan/counter guards must be *seen red once* before being trusted.
- Do not touch `active_session.dart` (must keep zero imports), the three `AND ended_at IS NULL` guards, or `endSession`'s signature.

## File Structure

```
app/lib/features/session/data/survey_repository.dart          # new
app/lib/features/session/data/interruption_repository.dart    # new (never contains "detail")
app/lib/features/session/data/session_repository.dart         # + SessionDetailView, loadSessionDetail
app/lib/features/session/presentation/session_controller.dart # start() -> Future<String>; pause logging
app/lib/features/session/presentation/session_flow.dart       # capture id, guard, write survey, catch
app/lib/features/session/presentation/survey_dialog.dart      # SurveyResult, note controller, latch, keys
app/lib/features/session/presentation/focus_bar.dart          # self-report button + live count
app/lib/features/stats/presentation/stats_view.dart           # inline expansion + honest header
app/lib/core/providers.dart                                   # two providers
app/lib/core/mock/mock_data.dart                               # mockMutedApps -> mockHeldBack
app/lib/features/today/presentation/today_view.dart            # held-back render site
app/test/support/interaction_counter.dart                      # new harness
app/test/support/interaction_counter_probe_test.dart            # new probe (run first)
app/test/features/session/interruption_repository_test.dart     # new
app/test/features/session/survey_repository_test.dart           # new
app/test/features/session/survey_flow_test.dart                 # new
app/test/features/session/focus_bar_test.dart                   # new
app/test/core/db/write_confinement_test.dart                    # new (privacy)
app/test/features/session/session_controller_test.dart          # + pause logging cases
app/test/features/session/session_flow_test.dart                # rewrite the PHASE 2 stamp assertion
app/test/features/stats/stats_view_test.dart                    # + expansion, ordering, negative test
```

---

### Task 1: Interaction-counter harness, probed first

**Files:** Create `app/test/support/interaction_counter.dart`, `app/test/support/interaction_counter_probe_test.dart`

**Interfaces:** Produces `InteractionCounter` with `attach()` (registers), `reset()`, `count`; used by Tasks 6–7. `attach` must be paired with `addTearDown(counter.detach)`.

- [ ] **Step 1: Write the harness**

```dart
import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Counts user interactions mechanically (spec §4.6): pointer-downs seen by the
/// global router plus hardware key-downs. A hand-counted budget test is just a
/// restatement of its own taps; this sees every event the binding dispatches,
/// including inside a route pushed above a wrapper.
class InteractionCounter {
  int _count = 0;
  int get count => _count;

  void _onPointer(PointerEvent e) {
    if (e is PointerDownEvent) _count++;
  }

  bool _onKey(KeyEvent e) {
    if (e is KeyDownEvent) _count++;
    return false; // never swallow: the app must still receive it
  }

  void attach() {
    GestureBinding.instance.pointerRouter.addGlobalRoute(_onPointer);
    HardwareKeyboard.instance.addHandler(_onKey);
  }

  void detach() {
    GestureBinding.instance.pointerRouter.removeGlobalRoute(_onPointer);
    HardwareKeyboard.instance.removeHandler(_onKey);
  }

  void reset() => _count = 0;
}
```

- [ ] **Step 2: Write the probe test** — it must use `sendKeyEvent`, NOT `enterText` (verified: `enterText` dispatches neither a pointer nor a key event, spec §4.6)

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/interaction_counter.dart';

void main() {
  testWidgets('the interaction counter observes taps and keystrokes',
      (tester) async {
    final counter = InteractionCounter()..attach();
    addTearDown(counter.detach);

    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Center(
                child: TextButton(onPressed: () {}, child: const Text('x'))))));

    await tester.tap(find.text('x'));
    await tester.pump();
    await tester.tap(find.text('x'));
    await tester.pump();
    expect(counter.count, 2, reason: 'pointer-downs must be observed');

    await tester.sendKeyEvent(LogicalKeyboardKey.digit4);
    await tester.pump();
    expect(counter.count, 3, reason: 'key-downs must be observed');

    counter.reset();
    expect(counter.count, 0);
  });
}
```

Fails if: the global route is registered on the wrong binding, or the `HardwareKeyboard` handler is omitted (count stays 2), or `reset()` does not clear. Without this probe a silently-zero counter makes every budget test in Task 6 vacuously green — V2's exact failure class.

- [ ] **Step 3: Run it** — `cd app && flutter test test/support/interaction_counter_probe_test.dart --timeout 60s`. Expected PASS. If it fails, fix the harness before anything else depends on it.

- [ ] **Step 4: Commit** — `git commit -m "test: mechanical interaction counter with a probe"`

---

### Task 2: InterruptionRepository

**Files:** Create `app/lib/features/session/data/interruption_repository.dart`, `app/test/features/session/interruption_repository_test.dart`; modify `app/lib/core/providers.dart`

**Interfaces:** Produces
```dart
class InterruptionEntry { final String kind; final DateTime occurredAt; final int? durationS; }
class InterruptionRepository {
  InterruptionRepository(AppDatabase db);
  Future<void> logSessionEvent({required String sessionId, required String kind,
      required DateTime occurredAt, int? durationS, bool blocked = false});
  Future<void> logPause({required String sessionId, required DateTime pauseStartedAt, required DateTime resumedAt});
  Future<void> logSelfReport({required String sessionId, required DateTime occurredAt});
  Stream<int> watchSelfReportCount(String sessionId);
}
const kindManualPause = 'manual_pause';
const kindSelfReported = 'self_reported';
```
plus `interruptionRepositoryProvider`. Consumed by Tasks 3, 7, 8.

- [ ] **Step 1: Write the failing tests**

```dart
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/features/session/data/interruption_repository.dart';
import 'package:nerdyapp/features/session/data/session_repository.dart';
import 'package:nerdyapp/features/session/domain/active_session.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

void main() {
  late AppDatabase db;
  late InterruptionRepository repo;
  late String sessionId;
  final t0 = DateTime.utc(2026, 7, 26, 9);

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    await ensureLocalUser(db);
    final subjectId = await SubjectRepository(db).createSubject('Physics');
    final s = ActiveSession.start(
        id: 'sess-1', subjectId: subjectId, startedAt: t0, mode: 'plain');
    await SessionRepository(db).insertStartedSession(s);
    sessionId = s.id;
    repo = InterruptionRepository(db);
  });
  tearDown(() => db.close());

  test('logPause writes one manual_pause at the pause moment, blocked false',
      () async {
    await repo.logPause(
      sessionId: sessionId,
      pauseStartedAt: t0.add(const Duration(minutes: 10)),
      resumedAt: t0.add(const Duration(minutes: 12)),
    );
    final rows = await db.select(db.interruptions).get();
    expect(rows, hasLength(1));
    final r = rows.single;
    expect(r.kind, 'manual_pause'); // exact wire value; a rename is a data break
    expect(r.blocked, isFalse);
    expect(r.detail, isNull);
    expect(r.durationS, 120);
    expect(
        r.occurredAt
            .toUtc()
            .isAtSameMomentAs(t0.add(const Duration(minutes: 10))),
        isTrue,
        reason: 'occurred_at is when the pause STARTED, not when it ended');
  });

  test('logPause clamps a negative span to zero', () async {
    await repo.logPause(
      sessionId: sessionId,
      pauseStartedAt: t0.add(const Duration(minutes: 12)),
      resumedAt: t0.add(const Duration(minutes: 10)), // clock stepped back
    );
    expect((await db.select(db.interruptions).getSingle()).durationS, 0);
  });

  test('logSelfReport writes one self_reported row with no duration', () async {
    await repo.logSelfReport(sessionId: sessionId, occurredAt: t0);
    final r = await db.select(db.interruptions).getSingle();
    expect(r.kind, 'self_reported');
    expect(r.durationS, isNull);
    expect(r.blocked, isFalse);
    expect(r.detail, isNull);
  });

  test('blocked is carried by production code, not by the column default',
      () async {
    // Exit criterion 2 says rows carry the CORRECT blocked value. Asserting
    // only `false` passes even if the writer never mentions the column
    // (tables.dart:105 defaults it false), so pin the true branch too.
    await repo.logSessionEvent(
        sessionId: sessionId,
        kind: 'exit_attempt',
        occurredAt: t0,
        blocked: true);
    expect((await db.select(db.interruptions).getSingle()).blocked, isTrue);
  });

  test('watchSelfReportCount counts only this session\'s self reports',
      () async {
    expect(await repo.watchSelfReportCount(sessionId).first, 0);
    await repo.logSelfReport(sessionId: sessionId, occurredAt: t0);
    await repo.logPause(
        sessionId: sessionId, pauseStartedAt: t0, resumedAt: t0);
    expect(await repo.watchSelfReportCount(sessionId).first, 1);
  });
}
```

Fails if: kind strings drift (`'pause'`, `'manual-pause'`, `'distraction'`); `occurred_at` timestamped at resume instead of pause start; the clamp is dropped; `blocked` hard-coded true (a copy-paste from the `exit_attempt` row of the same doc table); `blocked` never passed through (the true case goes red); the count stream includes pauses.

- [ ] **Step 2: Run, verify RED** (compile error: file missing).

- [ ] **Step 3: Implement**

```dart
import 'package:drift/drift.dart';

import '../../../core/db/database.dart';
import '../../../core/ids.dart';

/// Wire values for `interruptions.kind`. The column has no CHECK (schema v1),
/// so these strings ARE the contract — renaming one silently orphans history.
const kindManualPause = 'manual_pause';
const kindSelfReported = 'self_reported';

/// Read projection for the Stats inline expansion.
class InterruptionEntry {
  const InterruptionEntry(
      {required this.kind, required this.occurredAt, this.durationS});

  final String kind;
  final DateTime occurredAt;
  final int? durationS;
}

/// The ONLY writer of the interruptions table (enforced by
/// test/core/db/write_confinement_test.dart).
///
/// PRIVACY (data-model.md §3.6, focus-enforcement.md §7): log the KIND, never
/// the IDENTITY. No method here takes a context/annotation parameter, so app
/// identity is unrepresentable through this API — Phase 3's first such write
/// must widen a signature in this file deliberately.
class InterruptionRepository {
  InterruptionRepository(this._db);

  final AppDatabase _db;

  Future<void> logSessionEvent({
    required String sessionId,
    required String kind,
    required DateTime occurredAt,
    int? durationS,
    bool blocked = false,
  }) async {
    await _db.into(_db.interruptions).insert(InterruptionsCompanion.insert(
          id: newId(),
          sessionId: sessionId,
          kind: kind,
          occurredAt: occurredAt.toUtc(),
          durationS: Value(durationS),
          blocked: Value(blocked),
        ));
  }

  /// One append-only row per COMPLETED pause: occurred_at is when the pause
  /// began, duration_s how long it lasted. Clamped because DateTime.now() is
  /// not monotonic (same convention as crash recovery).
  Future<void> logPause({
    required String sessionId,
    required DateTime pauseStartedAt,
    required DateTime resumedAt,
  }) async {
    final span = resumedAt.difference(pauseStartedAt).inSeconds;
    await logSessionEvent(
      sessionId: sessionId,
      kind: kindManualPause,
      occurredAt: pauseStartedAt,
      durationS: span < 0 ? 0 : span,
    );
  }

  Future<void> logSelfReport({
    required String sessionId,
    required DateTime occurredAt,
  }) =>
      logSessionEvent(
          sessionId: sessionId, kind: kindSelfReported, occurredAt: occurredAt);

  Stream<int> watchSelfReportCount(String sessionId) {
    final q = _db.selectOnly(_db.interruptions)
      ..addColumns([_db.interruptions.id.count()])
      ..where(_db.interruptions.sessionId.equals(sessionId) &
          _db.interruptions.kind.equals(kindSelfReported) &
          _db.interruptions.deletedAt.isNull());
    return q
        .map((row) => row.read(_db.interruptions.id.count()) ?? 0)
        .watchSingle();
  }
}
```

Register in `core/providers.dart` in the existing one-liner shape:

```dart
final interruptionRepositoryProvider = Provider<InterruptionRepository>(
  (ref) => InterruptionRepository(ref.watch(databaseProvider)),
);
```

- [ ] **Step 4: Run the file, then `flutter analyze`.** Expected: PASS / clean.
- [ ] **Step 5: Commit** — `git commit -m "feat: interruption repository (manual_pause, self_reported) with no detail parameter"`

---

### Task 3: Controller writes exactly one row per completed pause

**Files:** Modify `app/lib/features/session/presentation/session_controller.dart`; Test `app/test/features/session/session_controller_test.dart`

**Interfaces:** `start` becomes `Future<String> start(String subjectId, {String mode = 'plain'})` returning the new session id (consumed by Task 6). Read spec §4.2 first — the placement is load-bearing.

- [ ] **Step 1: Write the failing tests** (append to the existing file, which already has the ProviderContainer harness)

```dart
  test('pausing logs nothing; resuming logs one manual_pause at the pause moment',
      () async {
    final c = container.read(sessionControllerProvider.notifier);
    await c.start(subjectId);
    await c.togglePause(); // pause
    expect(await db.select(db.interruptions).get(), isEmpty,
        reason: 'an open pause is not yet an event');
    final pausedAt = container.read(sessionControllerProvider)!.pauseStartedAt!;
    await Future<void>.delayed(const Duration(seconds: 1));
    await c.togglePause(); // resume

    final rows = await db.select(db.interruptions).get();
    expect(rows, hasLength(1));
    expect(rows.single.kind, 'manual_pause');
    expect(rows.single.occurredAt.toUtc().isAtSameMomentAs(pausedAt), isTrue);
    expect(rows.single.durationS, greaterThanOrEqualTo(1));
  });

  test('ending while paused logs the open pause exactly once', () async {
    final c = container.read(sessionControllerProvider.notifier);
    await c.start(subjectId);
    await c.togglePause(); // pause
    final pausedAt = container.read(sessionControllerProvider)!.pauseStartedAt!;
    await c.end();         // never resumed

    final rows = await db.select(db.interruptions).get();
    expect(rows, hasLength(1));
    expect(rows.single.occurredAt.toUtc().isAtSameMomentAs(pausedAt), isTrue);
  });

  test('a resume racing an end logs exactly one manual_pause', () async {
    final c = container.read(sessionControllerProvider.notifier);
    await c.start(subjectId);
    await c.togglePause(); // pause, awaited
    // Resume enqueued FIRST so its write resolves first: this is the ordering
    // in which a stale-snapshot guard in end() logs a second row (spec §4.2).
    final resuming = c.togglePause();
    final ending = c.end();
    await Future.wait([resuming, ending]);

    expect(await db.select(db.interruptions).get(), hasLength(1),
        reason: 'one pause is one event, however the two calls interleave');
  });

  test('a pause that lost the race to end() logs nothing', () async {
    final c = container.read(sessionControllerProvider.notifier);
    await c.start(subjectId);
    final ending = c.end();
    final pausing = c.togglePause();
    await Future.wait([ending, pausing]);
    expect(await db.select(db.interruptions).get(), isEmpty);
  });
```

Fails if: the row is written on the pause leg (first test: count 2 by the end of a cycle, and the isEmpty assert red); `occurred_at` taken at resume (instant assert red); `end()` does not log an open pause (second test: zero rows — the session would claim paused time with no matching event); **`end()` gates its log on the pre-await snapshot `s.isPaused` instead of live state (third test: two rows — the verified bug from the design pass)**; the resume log is placed above the `identical(state, s)` recheck (fourth test: a row for an already-ended session).

- [ ] **Step 2: Run, verify RED.**

- [ ] **Step 3: Implement** — replace `start`, `togglePause`, `end`:

```dart
  Future<String> start(String subjectId, {String mode = 'plain'}) async {
    if (state != null) throw StateError('a session is already running');
    final session = ActiveSession.start(
        id: newId(), subjectId: subjectId, startedAt: _now(), mode: mode);
    await ref.read(sessionRepositoryProvider).insertStartedSession(session);
    state = session;
    return session.id;
  }

  Future<void> togglePause() async {
    final s = state;
    if (s == null) return;
    final now = _now();
    final next = s.isPaused ? s.resume(now) : s.pause(now);
    // Written on pause AND resume: every state change is persisted
    // (architecture.md §3.4).
    await ref
        .read(sessionRepositoryProvider)
        .updatePausedDuration(next.id, next.accumulatedPause);
    // A racing end() may have closed the session while we awaited; its
    // guarded write already no-oped in the DB — don't resurrect it here.
    if (!identical(state, s)) return;
    state = next;
    if (s.isPaused) {
      // This transition CLOSED a pause: log it once, with its own timestamps.
      await ref.read(interruptionRepositoryProvider).logPause(
          sessionId: s.id, pauseStartedAt: s.pauseStartedAt!, resumedAt: now);
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
    // Decide from LIVE state, never the pre-await snapshot: a resume that won
    // the race has already logged this pause, and s.isPaused would still read
    // true, producing a duplicate row (spec §4.2).
    final live = state;
    if (live == null || live.id != s.id) return;
    if (live.isPaused) {
      await ref.read(interruptionRepositoryProvider).logPause(
          sessionId: s.id,
          pauseStartedAt: live.pauseStartedAt!,
          resumedAt: now);
    }
    state = null;
  }
```

- [ ] **Step 4: Run the whole session test directory + analyze.** Existing tests (immutability, recovery, real-clock, mode) must stay green.
- [ ] **Step 5: Commit** — `git commit -m "feat: log one manual_pause per completed pause, resolved from live state"`

---

### Task 4: Privacy — write confinement (exit criterion 3)

**Files:** Create `app/test/core/db/write_confinement_test.dart`

- [ ] **Step 1: Write the test**

```dart
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

// data-model.md §3.6 / focus-enforcement.md §7:
//   "detail records *kind*, never *identity*. Store `app_switch`, not the name
//    of the app switched to. Recording which apps a student opens is
//    surveillance."
// Exit criterion 3 cannot be met by asserting rows have detail == null: Phase 2
// has no identity source, so that passes on code which could not leak and never
// runs the Phase 3 writer that could. Instead: one writer, and identity is not
// representable in its API.
void main() {
  test('only InterruptionRepository writes interruptions, and it never mentions detail',
      () {
    const owner = 'interruption_repository.dart';
    final writes = RegExp(
        r'InterruptionsCompanion|(?:into|update|delete)\(\s*_?db\.interruptions');
    final offenders = <String>[];
    var scanned = 0;

    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      if (f.path.endsWith('.g.dart')) continue;
      scanned++;
      final src = f.readAsStringSync();
      if (f.path.endsWith(owner)) {
        expect(src.contains('detail'), isFalse,
            reason: 'adding a detail parameter must be a deliberate edit here');
        continue;
      }
      if (writes.hasMatch(src)) offenders.add(f.path);
    }

    expect(offenders, isEmpty,
        reason: 'interruption writes must go through $owner');
    // Anti-vacuity: a wrong cwd would make the scan pass having read nothing.
    // app/lib holds 27 .dart files today; the floor only has to prove the walk ran.
    expect(scanned, greaterThan(20));
  });
}
```

Fails if: any file under `lib/` gains an `InterruptionsCompanion` insert (that one line is how a Phase 3 focus watcher leaks identity while every other assertion stays green); the repository gains a `detail` parameter; the working directory is wrong (the floor catches it).

- [ ] **Step 2: Run — expected PASS.**
- [ ] **Step 3: SEE IT RED (mandatory).** Temporarily add to `stats_view.dart`:
  `// ignore: unused_local_variable` + `final leak = InterruptionsCompanion.insert(id: 'x', sessionId: 'y', kind: 'z', occurredAt: DateTime.now(), detail: const Value('Discord'));`
  Run → red, naming stats_view.dart as an offender. Then also temporarily add `// detail` inside `interruption_repository.dart` → red on the second assertion. Revert both, re-run green. Capture both red outputs for the PR.
- [ ] **Step 4: Commit** — `git commit -m "test: confine interruption writes and make app identity unrepresentable"`

---

### Task 5: SurveyRepository

**Files:** Create `app/lib/features/session/data/survey_repository.dart`, `app/test/features/session/survey_repository_test.dart`; modify `core/providers.dart`

**Interfaces:** `Future<void> saveSurvey({required String sessionId, required int focusRating, int? comprehensionRating, int? difficultyRating, String? note})`; `surveyRepositoryProvider`.

- [ ] **Step 1: Failing tests**

```dart
  test('a saved survey round-trips every field and leaves the session row identical',
      () async {
    final before = await db.select(db.sessions).getSingle();
    await repo.saveSurvey(
        sessionId: sessionId,
        focusRating: 4,
        comprehensionRating: 2,
        difficultyRating: 5,
        note: 'derivations were slow');
    final s = await db.select(db.sessionSurveys).getSingle();
    // Asymmetric values on purpose: 3/3/3 could not catch a swapped column.
    expect((s.focusRating, s.comprehensionRating, s.difficultyRating), (4, 2, 5));
    expect(s.note, 'derivations were slow');
    expect(s.sessionId, sessionId);
    expect(s.deletedAt, isNull);
    // Writing a survey must not touch the session — updated_at is the
    // crash-recovery watermark.
    expect(await db.select(db.sessions).getSingle(), before);
  });

  test('a blank or whitespace note is stored as null', () async {
    await repo.saveSurvey(sessionId: sessionId, focusRating: 3, note: '   ');
    expect((await db.select(db.sessionSurveys).getSingle()).note, isNull);
  });

  test('refuses a survey for a crashed session and writes nothing', () async {
    // Reopen the session, then let recovery close it as crashed.
    await db.into(db.sessions).insert(SessionsCompanion.insert(
        id: 'open-1', userId: localUserId, subjectId: subjectId,
        mode: 'plain', startedAt: t0,
        updatedAt: Value(t0.add(const Duration(minutes: 5)))));
    await SessionRepository(db).recoverCrashedSessions();
    await expectLater(
        repo.saveSurvey(sessionId: 'open-1', focusRating: 5), throwsStateError);
    expect(await db.select(db.sessionSurveys).get(), isEmpty);
  });

  test('refuses a survey for a session that has not ended', () async {
    await expectLater(
        repo.saveSurvey(sessionId: unendedId, focusRating: 5), throwsStateError);
    expect(await db.select(db.sessionSurveys).get(), isEmpty);
  });

  test('refuses an out-of-range focus rating', () async {
    await expectLater(
        repo.saveSurvey(sessionId: sessionId, focusRating: 0), throwsRangeError);
    await expectLater(
        repo.saveSurvey(sessionId: sessionId, focusRating: 6), throwsRangeError);
    expect(await db.select(db.sessionSurveys).get(), isEmpty);
  });
```

Fails if: columns are swapped (asymmetric values catch it); the raw `.text` is passed through (blank-note case red — every two-tap session would otherwise store a fake empty note); the save bumps `sessions.updated_at` (column-equality red); the guard is missing (crashed/unended cases red — and a crashed-session survey could drag a qualified day below 3.0 in Phase 5); Dart-side range validation is omitted and the CHECK is relied on instead (the thrown type differs between `NativeDatabase.memory` and production's `createInBackground`).

- [ ] **Step 2: RED. Step 3: Implement**

```dart
  Future<void> saveSurvey({
    required String sessionId,
    required int focusRating,
    int? comprehensionRating,
    int? difficultyRating,
    String? note,
  }) async {
    void checkRange(String name, int? v) {
      if (v == null) return;
      if (v < 1 || v > 5) throw RangeError.value(v, name, 'must be 1..5');
    }
    checkRange('focusRating', focusRating);
    checkRange('comprehensionRating', comprehensionRating);
    checkRange('difficultyRating', difficultyRating);
    final trimmed = note?.trim();

    await _db.transaction(() async {
      // Read inside the transaction so this cannot race recoverCrashedSessions.
      final session = await (_db.select(_db.sessions)
            ..where((t) => t.id.equals(sessionId)))
          .getSingleOrNull();
      if (session == null ||
          session.deletedAt != null ||
          session.endedAt == null ||
          !const ['completed', 'user_ended'].contains(session.endReason)) {
        throw StateError(
            'only a normally-ended session can be surveyed (got '
            '${session?.endReason ?? 'no row'}) — a crashed session must never '
            'weight a qualified day (data-model.md §5.1)');
      }
      await _db.into(_db.sessionSurveys).insert(SessionSurveysCompanion.insert(
            id: newId(),
            sessionId: sessionId,
            focusRating: focusRating,
            comprehensionRating: Value(comprehensionRating),
            difficultyRating: Value(difficultyRating),
            note: Value(trimmed == null || trimmed.isEmpty ? null : trimmed),
          ));
    });
  }
```

File-level comment must record the two one-way doors from spec §4.1 (upsert conflict target defaults to the PK; a soft-deleted survey permanently blocks re-rating).

- [ ] **Step 4: Run + analyze. Step 5: Commit** — `git commit -m "feat: survey repository with a normally-ended-session guard"`

---

### Task 6: Wire the survey — dialog, flow, budget tests

**Files:** Modify `survey_dialog.dart`, `session_flow.dart`; Test `app/test/features/session/survey_flow_test.dart`, rewrite `session_flow_test.dart:62`

Dialog changes: `class SurveyResult {focusRating, comprehensionRating, difficultyRating, note}`; a real `TextEditingController _note` (+ `dispose`) with `Key('survey-note')` and its own `FocusNode`; `bool _saving` latch disabling both buttons; **delete** the `RECORDS IN PHASE 2` kicker; correct the skip line to `'A day with no survey never qualifies for a streak.'`; `Focus(autofocus: true)` root handling digits 1–5 / Enter / Escape, returning `KeyEventResult.ignored` while `_noteFocus.hasFocus`; Save pops a `SurveyResult`, Skip pops null.

Flow changes: capture `final sessionId = await start(...)`; `if (ref.read(sessionControllerProvider) != null) return;` before `showDialog<SurveyResult>`; on non-null result write via `surveyRepositoryProvider` inside `try { } catch (Object e) { ScaffoldMessenger... }` (untyped catch — production raises `DriftRemoteException`, tests raise `SqliteException`; a typed catch passes the suite and red-screens the app).

- [ ] **Step 1: Failing tests** — the four budget/flow cases plus the double-tap and decoy cases (spec §4.1, §4.6):
  1. `the common survey path costs exactly two interactions and records the survey` — reset the counter when the dialog is visible, tap rating `4`, tap `Save`; assert `counter.count == 2` **exactly**, one row with focus 4 and the other three fields null, dialog gone.
  2. `ending a session opens the survey with no further interaction` — after End + reset: dialog present, `counter.count == 0` (pins the left edge of the window so a required tap cannot be pushed outside it).
  3. `the survey is dismissible in exactly one interaction and records nothing` — tap `Skip`: `count == 1`, `session_surveys` **empty**, `interruptions` empty, session still `user_ended`, back home. (The empty-table assert is the only thing standing between strict streaks and a neutral-3.0 sentinel row.)
  4. `the survey is written against the session that just ended` — pre-seed a decoy ended session with BOTH a later `started_at` and a lexically larger id; assert the survey's `sessionId` is the flow's, not the decoy's (kills `ORDER BY started_at DESC` / `ORDER BY id DESC` implementations).
  5. `a double-tapped Save writes one row and leaves the caller's route mounted` — two taps in one frame: one row, no exception, `find.text('launch')` findsOneWidget.
  6. `keyboard: digit sets the rating, Enter saves, and typing in the note does not set the rating` — `sendKeyEvent(digit4)` + `sendKeyEvent(enter)` → one row focus 4, `count == 2`; then a second run focusing the note first and sending `digit4` → the persisted rating is the pointer-chosen value, not 4.
- [ ] **Step 2: RED. Step 3: Implement. Step 4: Run + analyze.**
- [ ] **Step 5:** rewrite `session_flow_test.dart:62` (`find.textContaining('RECORDS IN PHASE 2')`) into an assertion that the survey dialog is present and, after Skip, no row exists — do not delete it.
- [ ] **Step 6: Commit** — `git commit -m "feat: persist the post-session survey; two-tap budget enforced mechanically"`

---

### Task 7: Self-report button

**Files:** Modify `focus_bar.dart`, `mock_data.dart`, `today_view.dart`; Test `app/test/features/session/focus_bar_test.dart`

- [ ] **Step 1: Failing test** — pump the flow to `FocusBarScreen` (arrival by `Key('focus-timer')`), reset the counter, tap `Key('self-report')`: `counter.count == 1`; exactly one row `self_reported`, `blocked` false, `durationS` null, `detail` null, sessionId matching; tap again → exactly two rows; the live count renders "2"; a sessions-row column-equality snapshot proves logging does not touch `sessions`. Fails if: implemented as a toggle/debounce (second tap adds nothing); a chooser is introduced (no row until a second tap, so both asserts cannot hold); kind emitted as `'distraction'`. Find by Key, never by text — mock content renders in the same subtree.
- [ ] **Step 2: RED. Step 3: Implement** the button + `StreamBuilder` count in the action row; reshape `mockMutedApps` → `mockHeldBack` (`kind`+`count`, e.g. `notifications · 13`) and update **both** render sites (focus_bar.dart:148 and today_view.dart:295-313 — `m.app`/`m.count` must both change or the build breaks).
- [ ] **Step 4: Run the full suite + analyze. Step 5: Commit** — `git commit -m "feat: one-tap self-reported distraction; identity-free held-back mock"`

---

### Task 8: Read it back — inline expansion in Stats

**Files:** Modify `session_repository.dart` (+`SessionDetailView`, `loadSessionDetail`), `stats_view.dart`; Test `app/test/features/stats/stats_view_test.dart`

- [ ] **Step 1: Failing tests**
  1. `expanding a history row shows its interruptions and survey` — seed an ended session + survey (focus 4, comprehension 2) + two interruptions (a `manual_pause` with duration, a `self_reported` without); tap the row by Key, `pump()` + `pump(200ms)`; assert both interruptions render with human labels (`Paused`, `Distraction`), both survey values render, and none of the mock app-name literals appear.
  2. `a session with no survey shows an explicit no-survey state` — renders `No survey`, never a `0` (a zero would later read as a real bad rating).
  3. `same-second interruptions are ordered by id` — seed two rows with the **same** `occurred_at`, inserted in reverse id order; assert ascending id order deterministically (never rely on an intermittent red).
  4. `Phase 2 computes nothing` — after the full flow, `db.select(db.dailySummaries).get()` is **empty** and the Stats aggregate block is still wrapped in `MockStamp`. Fails the moment anyone wires streak/average computation or promotes the mocked "Focus quality" cell.
- [ ] **Step 2: RED. Step 3: Implement** — `loadSessionDetail` ordered `occurred_at ASC, id ASC`; `FutureBuilder` on first expand (no `FutureProvider.family`); update the honest header at `stats_view.dart:36` since surveys and interruptions are now real.
- [ ] **Step 4: Run + analyze. Step 5: Commit** — `git commit -m "feat: expand a Stats row to its survey and interruptions"`

---

### Task 9: Docs

- [ ] **Step 1:** apply every edit in spec §8 — masterplan (§7 ×4, §9 D5, §10 ×4 rows, §12 row 1.2), data-model (§3.5 one-way doors, §3.6 self_reported + crash-while-paused + retention rule with the injected-cutoff note, §5.1/§5.2 blockquotes deleted and replaced by the strict rule), focus-enforcement §7, architecture §5.2, the shell spec's stale claims, CHANGELOG, README (+ **required** changelog row 1.4).
- [ ] **Step 2: Commit** — `git commit -m "docs: phase 2 doc law - deferrals owned, contradictions resolved, retention rule recorded"`

---

### Task 10: Independent review, verify, PR, merge, handoff

- [ ] **Step 1:** dispatch a dedicated reviewer over `main..HEAD` focused on the controller write path (spec §4.2), the three exit-criterion tests, and every `whatWouldMakeItFail` claim — instructing it to verify each claim against the real code rather than trusting the plan.
- [ ] **Step 2:** fix Critical/Important findings; probe each fix red where a test changed.
- [ ] **Step 3: Full verification, output seen:** `flutter analyze`; `flutter test --timeout 60s`; `flutter build windows --release`.
- [ ] **Step 4: PR** via `--body-file`: scope, the three exit criteria with the test that proves each, the guards-seen-red evidence (write confinement ×2, interaction probe, duplicate-pause), the deferral table with owners, and the manual checklist from spec §9.
- [ ] **Step 5:** CI green → squash merge → update HANDOFF.md (now tracked) with a new LATEST block and the still-owed manual checks.
