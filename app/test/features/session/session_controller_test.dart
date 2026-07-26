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
