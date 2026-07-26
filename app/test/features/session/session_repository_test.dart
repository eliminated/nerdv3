import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/ids.dart';
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
    await repo.recoverCrashedSessions();

    // Drift data classes implement ==; this compares every column.
    expect(await db.select(db.sessions).getSingle(), before);
  });

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
}
