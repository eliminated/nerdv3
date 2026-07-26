import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/providers.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';
import 'package:nerdyapp/features/today/presentation/today_view.dart';

void main() {
  testWidgets('today can start a session: prompt opens with modes',
      (tester) async {
    // Desktop-sized surface — the today layout is a two-column desktop view.
    tester.view.physicalSize = const Size(1600, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await ensureLocalUser(db);
    await SubjectRepository(db).createSubject('Physics');

    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const MaterialApp(home: Scaffold(body: TodayView())),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.text('Start session…'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byKey(const Key('mode-focus')), findsOneWidget);
    expect(find.byKey(const Key('mode-ultra')), findsOneWidget);

    await tester.tap(find.text('Not now'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
