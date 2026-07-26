import 'package:drift/drift.dart' hide isNull, isNotNull;
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

  test('start records the chosen mode and pause preserves it', () async {
    final controller = container.read(sessionControllerProvider.notifier);
    await controller.start(subjectId, mode: 'focused');
    await controller.togglePause();
    expect(container.read(sessionControllerProvider)!.mode, 'focused');
    final row = await db.select(db.sessions).getSingle();
    expect(row.mode, 'focused');
  });

  test('pausing logs nothing; resuming logs one manual_pause at the pause moment',
      () async {
    final c = container.read(sessionControllerProvider.notifier);
    await c.start(subjectId);
    await c.togglePause(); // pause
    expect(await db.select(db.interruptions).get(), isEmpty,
        reason: 'an open pause is not yet a completed event');
    final pausedAt = container.read(sessionControllerProvider)!.pauseStartedAt!;
    // 2s so the pause moment and the resume moment are distinguishable at the
    // one-second precision drift stores DateTime with.
    await Future<void>.delayed(const Duration(seconds: 2));
    await c.togglePause(); // resume

    final rows = await db.select(db.interruptions).get();
    expect(rows, hasLength(1));
    expect(rows.single.kind, 'manual_pause');
    expect(rows.single.occurredAt.toUtc().difference(pausedAt).abs(),
        lessThan(const Duration(seconds: 1)),
        reason: 'the event began when the pause began, not when it ended');
    expect(rows.single.durationS, greaterThanOrEqualTo(2));
  });

  test('ending while paused logs the open pause exactly once', () async {
    final c = container.read(sessionControllerProvider.notifier);
    await c.start(subjectId);
    await c.togglePause(); // pause
    final pausedAt = container.read(sessionControllerProvider)!.pauseStartedAt!;
    await Future<void>.delayed(const Duration(seconds: 2));
    await c.end(); // never resumed

    final rows = await db.select(db.interruptions).get();
    expect(rows, hasLength(1),
        reason: 'the session claims paused time, so the log must show it');
    expect(rows.single.occurredAt.toUtc().difference(pausedAt).abs(),
        lessThan(const Duration(seconds: 1)),
        reason: 'timestamped at the pause start, not at session end');
    expect(rows.single.durationS, greaterThanOrEqualTo(2));
  });

  test('a resume racing an end logs exactly one manual_pause', () async {
    final c = container.read(sessionControllerProvider.notifier);
    await c.start(subjectId);
    await c.togglePause(); // pause, awaited
    // Resume is enqueued FIRST so its write resolves first: this is the exact
    // ordering in which gating end()'s log on the pre-await snapshot writes a
    // second row for one pause (spec §4.2).
    final resuming = c.togglePause();
    final ending = c.end();
    await Future.wait([resuming, ending]);

    expect(await db.select(db.interruptions).get(), hasLength(1),
        reason: 'one pause is one event, however the two calls interleave');
  });

  test('an end racing a resume logs exactly one manual_pause', () async {
    final c = container.read(sessionControllerProvider.notifier);
    await c.start(subjectId);
    await c.togglePause(); // pause, awaited
    // The MIRROR of the test above: end is enqueued first, so its own log runs
    // last. If end() cleared state only after awaiting that log, the racing
    // resume would still see a paused session and log the pause a second time.
    final ending = c.end();
    final resuming = c.togglePause();
    await Future.wait([ending, resuming]);

    expect(await db.select(db.interruptions).get(), hasLength(1));
  });

  test('two ends racing while paused log exactly one manual_pause', () async {
    final c = container.read(sessionControllerProvider.notifier);
    await c.start(subjectId);
    await c.togglePause(); // pause, awaited
    final first = c.end();
    final second = c.end(); // double-click / key autorepeat
    await Future.wait([first, second]);

    expect(await db.select(db.interruptions).get(), hasLength(1));
    expect(container.read(sessionControllerProvider), isNull);
  });

  test('a pause that lost the race to end() logs nothing', () async {
    final c = container.read(sessionControllerProvider.notifier);
    await c.start(subjectId);
    final ending = c.end();
    final pausing = c.togglePause();
    await Future.wait([ending, pausing]);
    expect(await db.select(db.interruptions).get(), isEmpty,
        reason: 'a pause that never took effect is not an event');
  });

  test('a pause racing an end cannot resurrect an ended session', () async {
    final controller = container.read(sessionControllerProvider.notifier);
    await controller.start(subjectId);

    // Fire both without awaiting in between, as two quick taps would.
    final ending = controller.end();
    final pausing = controller.togglePause();
    await Future.wait([ending, pausing]);

    expect(container.read(sessionControllerProvider), isNull,
        reason: 'the ended session must not survive as controller state');
    final row = await db.select(db.sessions).getSingle();
    expect(row.endReason, 'user_ended');
  });

  test('real-clock session records wall time, active vs paused split',
      () async {
    final controller = container.read(sessionControllerProvider.notifier);
    await controller.start(subjectId);
    await Future<void>.delayed(const Duration(seconds: 2));
    await controller.togglePause(); // pause
    // The pause window is 3s so that a regression folding paused time into
    // active time (≥7s wall, truncated to ≥7) must exceed the [3, 6] bound.
    await Future<void>.delayed(const Duration(seconds: 3));
    await controller.togglePause(); // resume
    await Future<void>.delayed(const Duration(seconds: 2));
    await controller.end();

    final row = await db.select(db.sessions).getSingle();
    // ~4s active, ~3s paused; generous bounds for scheduler jitter.
    expect(row.actualDurationS, inInclusiveRange(3, 6));
    expect(row.pausedDurationS, inInclusiveRange(2, 5));
    expect(row.endReason, 'user_ended');
    expect(row.endedAt, isNotNull);
  });
}
