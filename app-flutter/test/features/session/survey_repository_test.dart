import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/ids.dart';
import 'package:nerdyapp/features/session/data/session_repository.dart';
import 'package:nerdyapp/features/session/data/survey_repository.dart';
import 'package:nerdyapp/features/session/domain/active_session.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

void main() {
  late AppDatabase db;
  late SurveyRepository repo;
  late String subjectId;
  late String endedId;
  late String runningId;
  final t0 = DateTime.utc(2026, 7, 26, 9);

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    await ensureLocalUser(db);
    subjectId = await SubjectRepository(db).createSubject('Physics');
    final sessions = SessionRepository(db);

    final ended = ActiveSession.start(
        id: 'ended-1', subjectId: subjectId, startedAt: t0, mode: 'plain');
    await sessions.insertStartedSession(ended);
    await sessions.endSession(
      id: ended.id,
      endedAt: t0.add(const Duration(minutes: 30)),
      actualDuration: const Duration(minutes: 30),
      totalPaused: Duration.zero,
    );
    endedId = ended.id;

    final running = ActiveSession.start(
        id: 'running-1', subjectId: subjectId, startedAt: t0, mode: 'plain');
    await sessions.insertStartedSession(running);
    runningId = running.id;

    repo = SurveyRepository(db);
  });
  tearDown(() => db.close());

  test('a saved survey round-trips every field and leaves the session identical',
      () async {
    final before = await (db.select(db.sessions)
          ..where((t) => t.id.equals(endedId)))
        .getSingle();

    await repo.saveSurvey(
      sessionId: endedId,
      focusRating: 4,
      comprehensionRating: 2,
      difficultyRating: 5,
      note: 'derivations were slow',
    );

    final s = await db.select(db.sessionSurveys).getSingle();
    // Asymmetric on purpose: 3/3/3 could not catch two swapped columns.
    expect(
        (s.focusRating, s.comprehensionRating, s.difficultyRating), (4, 2, 5));
    expect(s.note, 'derivations were slow');
    expect(s.sessionId, endedId);
    expect(s.deletedAt, isNull);
    expect(s.createdAt.toUtc().difference(DateTime.now().toUtc()).abs(),
        lessThan(const Duration(minutes: 1)));
    // A survey must not touch the session: updated_at is the crash-recovery
    // watermark, and an ended session is immutable.
    expect(
        await (db.select(db.sessions)..where((t) => t.id.equals(endedId)))
            .getSingle(),
        before);
  });

  test('optional ratings and a blank note are stored as null', () async {
    await repo.saveSurvey(sessionId: endedId, focusRating: 3, note: '   ');
    final s = await db.select(db.sessionSurveys).getSingle();
    expect(s.note, isNull,
        reason: 'an untouched field yields "", which must not become a note');
    expect(s.comprehensionRating, isNull);
    expect(s.difficultyRating, isNull);
  });

  test('refuses a survey for a recovered crashed session, writing nothing',
      () async {
    await db.into(db.sessions).insert(SessionsCompanion.insert(
          id: 'open-1',
          userId: localUserId,
          subjectId: subjectId,
          mode: 'plain',
          startedAt: t0,
          updatedAt: Value(t0.add(const Duration(minutes: 5))),
        ));
    await SessionRepository(db).recoverCrashedSessions();

    await expectLater(
        repo.saveSurvey(sessionId: 'open-1', focusRating: 5), throwsStateError);
    expect(await db.select(db.sessionSurveys).get(), isEmpty,
        reason: 'a crashed session must never weight a qualified day');
  });

  test('refuses a survey for a session that has not ended', () async {
    await expectLater(
        repo.saveSurvey(sessionId: runningId, focusRating: 5), throwsStateError);
    expect(await db.select(db.sessionSurveys).get(), isEmpty);
  });

  test('refuses a survey for an unknown session', () async {
    await expectLater(
        repo.saveSurvey(sessionId: 'nope', focusRating: 5), throwsStateError);
    expect(await db.select(db.sessionSurveys).get(), isEmpty);
  });

  test('refuses out-of-range ratings before touching the database', () async {
    // Validated in Dart, not left to the CHECK: production surfaces constraint
    // errors as DriftRemoteException while tests see raw SqliteException.
    await expectLater(
        repo.saveSurvey(sessionId: endedId, focusRating: 0), throwsRangeError);
    await expectLater(
        repo.saveSurvey(sessionId: endedId, focusRating: 6), throwsRangeError);
    await expectLater(
        repo.saveSurvey(
            sessionId: endedId, focusRating: 3, comprehensionRating: 9),
        throwsRangeError);
    expect(await db.select(db.sessionSurveys).get(), isEmpty);
  });
}
