import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/providers.dart';
import 'package:nerdyapp/features/session/data/session_repository.dart';
import 'package:nerdyapp/features/session/domain/active_session.dart';
import 'package:nerdyapp/features/session/presentation/session_flow.dart';
import 'package:nerdyapp/features/session/presentation/survey_dialog.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

import '../../support/interaction_counter.dart';

class _Launcher extends ConsumerWidget {
  const _Launcher({required this.subjectId});

  final String subjectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: Center(
        child: TextButton(
          onPressed: () => startSessionFlow(context, ref,
              subjectId: subjectId, subjectName: 'Physics'),
          child: const Text('launch'),
        ),
      ),
    );
  }
}

void main() {
  late AppDatabase db;
  late String subjectId;

  Future<void> pumpFlowToSurvey(WidgetTester tester,
      {bool endSession = true}) async {
    // The launcher is PUSHED, not the root route: Flutter refuses to pop a root
    // route, which would make a stray second pop unobservable and the
    // double-tap test unfailable.
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => _Launcher(subjectId: subjectId))),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.pump();
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('launch'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.byKey(const Key('mode-focus')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    if (!endSession) return;
    await tester.tap(find.text('End session'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
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

  testWidgets('ending a session opens the survey with no further interaction',
      (tester) async {
    final counter = InteractionCounter();
    addTearDown(counter.detach);
    await pumpFlowToSurvey(tester);
    counter.attach(); // window opens once the dialog is up
    await tester.pump();

    expect(find.byType(SurveyDialog), findsOneWidget);
    // Pins the LEFT EDGE of the counting window: without this, the two-tap
    // budget could be met by pushing a required tap outside the window.
    expect(counter.count, 0);
    await unmount(tester);
  });

  testWidgets('the common survey path costs exactly two interactions and records it',
      (tester) async {
    final counter = InteractionCounter();
    addTearDown(counter.detach);
    await pumpFlowToSurvey(tester);
    counter.attach();

    await tester.tap(find.byKey(const Key('focus-4')));
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(counter.count, 2, reason: 'exactly two, never "at most"');
    final s = await db.select(db.sessionSurveys).getSingle();
    expect(s.focusRating, 4);
    expect(s.comprehensionRating, isNull);
    expect(s.difficultyRating, isNull);
    expect(s.note, isNull);
    expect(find.byType(SurveyDialog), findsNothing);
    await unmount(tester);
  });

  testWidgets('the survey is dismissible in exactly one interaction and records nothing',
      (tester) async {
    final counter = InteractionCounter();
    addTearDown(counter.detach);
    await pumpFlowToSurvey(tester);
    counter.attach();

    await tester.tap(find.text('Skip'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(counter.count, 1);
    // The only thing standing between strict streaks and a neutral-3.0
    // sentinel row that would quietly qualify every day.
    expect(await db.select(db.sessionSurveys).get(), isEmpty);
    expect(await db.select(db.interruptions).get(), isEmpty,
        reason: 'skipping is not an interruption, and no pause occurred');
    final session = await db.select(db.sessions).getSingle();
    expect(session.endReason, 'user_ended');
    expect(session.endedAt, isNotNull);
    expect(find.text('launch'), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('the survey is written against the session that just ended',
      (tester) async {
    // Decoy with BOTH a later started_at and a lexically larger id, so no
    // accidental "newest row" ordering can pass.
    final decoy = ActiveSession.start(
        id: 'zzzz-decoy',
        subjectId: subjectId,
        startedAt: DateTime.now().toUtc().add(const Duration(hours: 5)),
        mode: 'plain');
    await SessionRepository(db).insertStartedSession(decoy);
    await SessionRepository(db).endSession(
      id: decoy.id,
      endedAt: decoy.startedAt.add(const Duration(minutes: 5)),
      actualDuration: const Duration(minutes: 5),
      totalPaused: Duration.zero,
    );

    await pumpFlowToSurvey(tester);
    await tester.tap(find.byKey(const Key('focus-3')));
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    final s = await db.select(db.sessionSurveys).getSingle();
    expect(s.sessionId, isNot(decoy.id));
    final flowSession = await (db.select(db.sessions)
          ..where((t) => t.id.isNotValue(decoy.id)))
        .getSingle();
    expect(s.sessionId, flowSession.id);
    await unmount(tester);
  });

  // Constrains "one popped result == one write": if the dialog ever wrote to
  // the repository itself instead of popping a SurveyResult, two taps in one
  // frame would attempt two inserts and hit the session_id UNIQUE constraint.
  // (Probed: it does NOT constrain the _closing latch — with this route stack a
  // stray second pop is a no-op, so the latch is documented as defensive.)
  testWidgets('a double-tapped Save writes exactly one row', (tester) async {
    await pumpFlowToSurvey(tester);
    await tester.tap(find.byKey(const Key('focus-5')));
    await tester.pump();
    // Two taps inside one frame — no pump between.
    await tester.tap(find.text('Save'));
    await tester.tap(find.text('Save'), warnIfMissed: false);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(await db.select(db.sessionSurveys).get(), hasLength(1));
    expect(find.text('launch'), findsOneWidget,
        reason: 'a second pop must not unwind the route beneath the dialog');
    await unmount(tester);
  });

  testWidgets('keyboard: a digit rates and Enter saves, in two interactions',
      (tester) async {
    final counter = InteractionCounter();
    addTearDown(counter.detach);
    await pumpFlowToSurvey(tester);
    counter.attach();

    await tester.sendKeyEvent(LogicalKeyboardKey.digit4);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(counter.count, 2);
    expect((await db.select(db.sessionSurveys).getSingle()).focusRating, 4);
    await unmount(tester);
  });

  testWidgets('typing a digit into the note does not set the rating',
      (tester) async {
    await pumpFlowToSurvey(tester);
    await tester.tap(find.byKey(const Key('focus-2'))); // chosen by pointer
    await tester.pump();
    await tester.tap(find.byKey(const Key('survey-note')));
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.digit4); // must be ignored
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect((await db.select(db.sessionSurveys).getSingle()).focusRating, 2,
        reason: 'a keystroke in the note must not overwrite the rating');
    await unmount(tester);
  });
}
