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
