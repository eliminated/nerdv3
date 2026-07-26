import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/providers.dart';
import 'package:nerdyapp/core/shell/app_shell.dart';
import 'package:nerdyapp/core/shell/mock_stamp.dart';
import 'package:nerdyapp/features/goals/presentation/goals_view.dart';
import 'package:nerdyapp/features/library/presentation/library_view.dart';
import 'package:nerdyapp/features/schedule/presentation/schedule_view.dart';
import 'package:nerdyapp/features/settings/presentation/settings_view.dart';
import 'package:nerdyapp/features/stats/presentation/stats_view.dart';
import 'package:nerdyapp/features/subjects/presentation/subjects_view.dart';
import 'package:nerdyapp/features/today/presentation/today_view.dart';

void main() {
  testWidgets('sidebar reaches every view; mocks are stamped', (tester) async {
    tester.view.physicalSize = const Size(1600, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await ensureLocalUser(db);

    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const MaterialApp(home: AppShell()),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(TodayView), findsOneWidget);

    for (final (label, viewFinder) in [
      ('Schedule', find.byType(ScheduleView)),
      ('Subjects', find.byType(SubjectsView)),
      ('Goals', find.byType(GoalsView)),
      ('Stats & Streaks', find.byType(StatsView)),
      ('Library', find.byType(LibraryView)),
      ('Settings', find.byType(SettingsView)),
    ]) {
      await tester.tap(find.text(label));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(viewFinder, findsOneWidget, reason: 'sidebar "$label" routes');
    }
    // Settings (current view) carries stamped mock regions.
    expect(find.byType(MockStamp), findsWidgets);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
