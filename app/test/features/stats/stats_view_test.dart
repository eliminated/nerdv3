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
import 'package:nerdyapp/features/session/data/session_repository.dart';
import 'package:nerdyapp/features/stats/presentation/stats_view.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

void main() {
  testWidgets('stats shows real recent sessions incl. crashed marker',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await ensureLocalUser(db);
    final subjectId = await SubjectRepository(db).createSubject('Physics');
    final t0 = DateTime.utc(2026, 7, 26, 9);
    // A crashed session (recovered) — real repository paths.
    await db.into(db.sessions).insert(SessionsCompanion.insert(
          id: 'open-1',
          userId: localUserId,
          subjectId: subjectId,
          mode: 'plain',
          startedAt: t0,
          updatedAt: Value(t0.add(const Duration(minutes: 15))),
        ));
    await SessionRepository(db).recoverCrashedSessions();

    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const MaterialApp(home: Scaffold(body: StatsView())),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Physics'), findsOneWidget);
    expect(find.textContaining('· crashed'), findsOneWidget);
    expect(find.byType(MockStamp), findsWidgets);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
