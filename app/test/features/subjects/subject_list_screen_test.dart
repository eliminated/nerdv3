import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/providers.dart';
import 'package:nerdyapp/features/subjects/presentation/subject_list_screen.dart';

void main() {
  testWidgets('creating a subject shows it in the list', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await ensureLocalUser(db);

    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const MaterialApp(home: SubjectListScreen()),
    ));
    // Never pumpAndSettle while the loading spinner is up (V2-verified hang).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Create a subject to start studying'), findsOneWidget);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(TextField), 'Physics');
    await tester.tap(find.text('Create'));
    // Pump past the dialog's close transition so its TextField leaves the tree.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.widgetWithText(ListTile, 'Physics'), findsOneWidget);

    // Unmount the tree before framework teardown: disposing the drift-backed
    // StreamProvider schedules a close timer, which must fire inside the test
    // or the pending-timer invariant fails. The pump must advance the fake
    // clock (a plain pump() schedules a frame without elapsing time).
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
