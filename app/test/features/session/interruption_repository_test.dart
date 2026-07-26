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
    // Exact wire value: the column has no CHECK, so this string IS the contract.
    expect(r.kind, 'manual_pause');
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
    expect(r.occurredAt.toUtc().isAtSameMomentAs(t0), isTrue);
  });

  test('blocked is carried by production code, not by the column default',
      () async {
    // Exit criterion 2 requires the CORRECT blocked value. Asserting only
    // `false` passes even if the writer never mentions the column (it defaults
    // to false in schema v1), so the true branch has to be pinned as well.
    await repo.logSessionEvent(
      sessionId: sessionId,
      kind: 'exit_attempt',
      occurredAt: t0,
      blocked: true,
    );
    expect((await db.select(db.interruptions).getSingle()).blocked, isTrue);
  });

  test("watchSelfReportCount counts only this session's self reports",
      () async {
    expect(await repo.watchSelfReportCount(sessionId).first, 0);
    await repo.logSelfReport(sessionId: sessionId, occurredAt: t0);
    await repo.logPause(
        sessionId: sessionId, pauseStartedAt: t0, resumedAt: t0);
    expect(await repo.watchSelfReportCount(sessionId).first, 1,
        reason: 'a pause is not a self-reported distraction');
  });
}
