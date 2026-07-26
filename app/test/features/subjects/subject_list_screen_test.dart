import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/providers.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';
import 'package:nerdyapp/features/subjects/presentation/subject_list_screen.dart';

void main() {
  Future<AppDatabase> pumpApp(WidgetTester tester) async {
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
    return db;
  }

  // Unmount the tree before framework teardown: disposing the drift-backed
  // StreamProvider schedules a close timer, which must fire inside the test
  // or the pending-timer invariant fails. The pump must advance the fake
  // clock (a plain pump() schedules a frame without elapsing time).
  Future<void> unmount(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  }

  testWidgets('creating a subject shows it in the list', (tester) async {
    await pumpApp(tester);
    expect(find.text('Create a subject to start studying'), findsOneWidget);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(
        find.ancestor(of: find.text('Name'), matching: find.byType(TextField)),
        'Physics');
    await tester.tap(find.text('Create'));
    // Pump past the dialog's close transition so its TextField leaves the tree.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.widgetWithText(ListTile, 'Physics'), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('editing a subject renames it in the list', (tester) async {
    final db = await pumpApp(tester);
    await SubjectRepository(db).createSubject('Chem');
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Edit'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.enterText(
        find.widgetWithText(TextField, 'Chem'), 'Chemistry');
    await tester.tap(find.text('Save'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.widgetWithText(ListTile, 'Chemistry'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Chem'), findsNothing);
    await unmount(tester);
  });

  testWidgets('archiving moves a subject to the archived view',
      (tester) async {
    final db = await pumpApp(tester);
    await SubjectRepository(db).createSubject('Old semester');
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Archive'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.widgetWithText(ListTile, 'Old semester'), findsNothing);

    await tester.tap(find.byIcon(Icons.inventory_2_outlined));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.widgetWithText(ListTile, 'Old semester'), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('deleting a subject removes it after confirmation',
      (tester) async {
    final db = await pumpApp(tester);
    await SubjectRepository(db).createSubject('Mistake');
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Delete'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Delete').last); // confirm dialog action
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.widgetWithText(ListTile, 'Mistake'), findsNothing);
    await unmount(tester);
  });
}
