import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/providers.dart';
import 'package:nerdyapp/features/session/presentation/session_flow.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

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
  testWidgets('mode prompt → focus session → end → survey skip',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await ensureLocalUser(db);
    final subjectId = await SubjectRepository(db).createSubject('Physics');

    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: MaterialApp(home: _Launcher(subjectId: subjectId)),
    ));
    await tester.pump();

    await tester.tap(find.text('launch'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    // Ultra renders but is disabled — stamped planned, never tappable.
    expect(find.text('Ultra'), findsOneWidget);
    final ultra = tester.widget<InkWell>(find.byKey(const Key('mode-ultra')));
    expect(ultra.onTap, isNull);

    await tester.tap(find.text('Focus'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const Key('focus-timer')), findsOneWidget);

    await tester.tap(find.text('End session'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.textContaining('RECORDS IN PHASE 2'), findsOneWidget);

    await tester.tap(find.text('Skip')); // one-tap dismissal
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('launch'), findsOneWidget); // back home

    final row = await db.select(db.sessions).getSingle();
    expect(row.mode, 'focused');
    expect(row.endReason, 'user_ended');

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
