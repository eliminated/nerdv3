import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/ids.dart';
import 'package:nerdyapp/core/providers.dart';
import 'package:nerdyapp/core/shell/mock_stamp.dart';
import 'package:nerdyapp/features/session/data/interruption_repository.dart';
import 'package:nerdyapp/features/session/data/session_repository.dart';
import 'package:nerdyapp/features/session/data/survey_repository.dart';
import 'package:nerdyapp/features/session/domain/active_session.dart';
import 'package:nerdyapp/features/stats/presentation/stats_view.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

void main() {
  late AppDatabase db;
  late String subjectId;
  final t0 = DateTime.utc(2026, 7, 26, 9);

  Future<String> seedEndedSession(String id) async {
    final sessions = SessionRepository(db);
    final s = ActiveSession.start(
        id: id, subjectId: subjectId, startedAt: t0, mode: 'plain');
    await sessions.insertStartedSession(s);
    await sessions.endSession(
      id: id,
      endedAt: t0.add(const Duration(minutes: 30)),
      actualDuration: const Duration(minutes: 30),
      totalPaused: Duration.zero,
    );
    return id;
  }

  Future<void> pumpStats(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1600, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const MaterialApp(home: Scaffold(body: StatsView())),
    ));
    // Never pumpAndSettle while the loading spinner is up.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
  }

  Future<void> unmount(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  }

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    await ensureLocalUser(db);
    subjectId = await SubjectRepository(db).createSubject('Physics');
  });
  tearDown(() => db.close());

  testWidgets('stats shows real recent sessions incl. crashed marker',
      (tester) async {
    await db.into(db.sessions).insert(SessionsCompanion.insert(
          id: 'open-1',
          userId: localUserId,
          subjectId: subjectId,
          mode: 'plain',
          startedAt: t0,
          updatedAt: Value(t0.add(const Duration(minutes: 15))),
        ));
    await SessionRepository(db).recoverCrashedSessions();

    await pumpStats(tester);
    expect(find.text('Physics'), findsOneWidget);
    expect(find.textContaining('· crashed'), findsOneWidget);
    expect(find.byType(MockStamp), findsWidgets);
    await unmount(tester);
  });

  testWidgets('expanding a row shows its survey and interruptions',
      (tester) async {
    final id = await seedEndedSession('sess-1');
    await SurveyRepository(db).saveSurvey(
        sessionId: id,
        focusRating: 4,
        comprehensionRating: 2,
        note: 'good session');
    final interruptions = InterruptionRepository(db);
    await interruptions.logPause(
        sessionId: id,
        pauseStartedAt: t0.add(const Duration(minutes: 5)),
        resumedAt: t0.add(const Duration(minutes: 7)));
    await interruptions.logSelfReport(
        sessionId: id, occurredAt: t0.add(const Duration(minutes: 12)));

    await pumpStats(tester);
    await tester.tap(find.byKey(Key('history-$id')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Focus 4/5'), findsOneWidget);
    expect(find.text('Comprehension 2/5'), findsOneWidget);
    expect(find.text('good session'), findsOneWidget);
    // Human labels, not raw wire values.
    expect(find.text('Paused'), findsOneWidget);
    expect(find.text('Distraction'), findsOneWidget);
    expect(find.text('120s'), findsOneWidget);
    // Privacy: no app identity anywhere on screen.
    expect(find.textContaining('Slack'), findsNothing);
    expect(find.textContaining('Discord'), findsNothing);
    await unmount(tester);
  });

  testWidgets('a session with no survey says so instead of showing a zero',
      (tester) async {
    final id = await seedEndedSession('sess-2');
    await pumpStats(tester);
    await tester.tap(find.byKey(Key('history-$id')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.textContaining('No survey'), findsOneWidget);
    expect(find.text('Focus 0/5'), findsNothing);
    expect(find.text('None logged.'), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('same-second interruptions are ordered by id, deterministically',
      (tester) async {
    final id = await seedEndedSession('sess-3');
    final sameMoment = t0.add(const Duration(minutes: 3));
    // Inserted in REVERSE id order, with one identical occurred_at: drift
    // stores DateTime as epoch seconds, so only the id tiebreak can order these.
    await db.into(db.interruptions).insert(InterruptionsCompanion.insert(
          id: 'bbbb',
          sessionId: id,
          kind: kindSelfReported,
          occurredAt: sameMoment,
        ));
    await db.into(db.interruptions).insert(InterruptionsCompanion.insert(
          id: 'aaaa',
          sessionId: id,
          kind: kindManualPause,
          occurredAt: sameMoment,
          durationS: const Value(30),
        ));

    final detail = await SessionRepository(db).loadSessionDetail(id);
    expect(detail.interruptions.map((i) => i.kind).toList(),
        [kindManualPause, kindSelfReported],
        reason: 'ascending id breaks the same-second tie every run');
    await unmount(tester);
  });

  testWidgets('Phase 2 computes nothing: no daily summaries, aggregates stamped',
      (tester) async {
    final id = await seedEndedSession('sess-4');
    await SurveyRepository(db).saveSurvey(sessionId: id, focusRating: 5);

    await pumpStats(tester);
    // Phase 5 owns streaks, averages and qualification. Nothing but discipline
    // stops this slice writing them, so pin it: this goes red the moment
    // anyone wires recomputeSummaries or promotes the mocked aggregate cells.
    expect(await db.select(db.dailySummaries).get(), isEmpty);
    expect(find.byType(MockStamp), findsWidgets);
    await unmount(tester);
  });
}
