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
