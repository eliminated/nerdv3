import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/providers.dart';
import 'package:nerdyapp/features/session/presentation/focus_bar.dart';
import 'package:nerdyapp/features/session/presentation/session_controller.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

import '../../support/interaction_counter.dart';

void main() {
  testWidgets('the distraction button logs one self_reported row per tap',
      (tester) async {
    tester.view.physicalSize = const Size(1600, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await ensureLocalUser(db);
    final subjectId = await SubjectRepository(db).createSubject('Physics');

    final container = ProviderContainer(
        overrides: [databaseProvider.overrideWithValue(db)]);
    addTearDown(container.dispose);
    await container
        .read(sessionControllerProvider.notifier)
        .start(subjectId, mode: 'focused');

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: FocusBarScreen(subjectName: 'Physics')),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byKey(const Key('focus-timer')), findsOneWidget);

    final before = await db.select(db.sessions).getSingle();
    final counter = InteractionCounter()..attach();
    addTearDown(counter.detach);

    // Found by Key, never by text: mock content renders in the same subtree.
    await tester.tap(find.byKey(const Key('self-report')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(counter.count, 1, reason: 'one tap, no chooser');
    var rows = await db.select(db.interruptions).get();
    expect(rows, hasLength(1));
    expect(rows.single.kind, 'self_reported');
    expect(rows.single.blocked, isFalse);
    expect(rows.single.durationS, isNull);
    expect(rows.single.detail, isNull);
    expect(find.text('logged ×1'), findsOneWidget);

    await tester.tap(find.byKey(const Key('self-report')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    rows = await db.select(db.interruptions).get();
    expect(rows, hasLength(2),
        reason: 'it is a counter, not a toggle or a debounced flag');
    expect(find.text('logged ×2'), findsOneWidget);

    // Logging a distraction must not touch the session row.
    expect(await db.select(db.sessions).getSingle(), before);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
