import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/providers.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';
import 'package:nerdyapp/features/subjects/presentation/subjects_view.dart';

void main() {
  Future<AppDatabase> pumpApp(WidgetTester tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await ensureLocalUser(db);
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const MaterialApp(home: Scaffold(body: SubjectsView())),
    ));
    // Never pumpAndSettle while the loading spinner is up (V2-verified hang).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    return db;
  }

  // Unmount before framework teardown: drift-backed StreamProvider disposal
  // schedules a close timer that must fire inside the test.
  Future<void> unmount(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  }

  testWidgets('creating a subject shows a card in the grid', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.text('New subject'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(
        find.ancestor(of: find.text('Name'), matching: find.byType(TextField)),
        'Physics');
    await tester.tap(find.text('Create'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Physics'), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('editing a subject renames its card', (tester) async {
    final db = await pumpApp(tester);
    await SubjectRepository(db).createSubject('Chem');
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Edit'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.enterText(find.widgetWithText(TextField, 'Chem'), 'Chemistry');
    await tester.tap(find.text('Save'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Chemistry'), findsOneWidget);
    expect(find.text('Chem'), findsNothing);
    await unmount(tester);
  });

  testWidgets('archive moves a subject to the archived table; restore returns it',
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

    // Card gone from the grid; row present in Archived with a Restore action.
    expect(find.text('Restore'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Start session…'), findsNothing);

    await tester.tap(find.text('Restore'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Restore'), findsNothing);
    expect(find.text('Old semester'), findsOneWidget);
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

    expect(find.text('Mistake'), findsNothing);
    await unmount(tester);
  });
}
