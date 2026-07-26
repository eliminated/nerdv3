import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart' hide isNull;

import 'package:nerdyapp/core/db/database.dart';

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('all seven v1 tables exist', () async {
    final rows = await db
        .customSelect("SELECT name FROM sqlite_master WHERE type = 'table'")
        .get();
    final tables = rows.map((r) => r.read<String>('name')).toList();
    expect(
        tables,
        containsAll([
          'users',
          'subjects',
          'topics',
          'sessions',
          'session_surveys',
          'interruptions',
          'daily_summaries',
        ]));
  });

  test('the six v1 indexes exist, partial where data-model.md says so',
      () async {
    final rows = await db
        .customSelect(
            "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
        .get();
    final bySql = {
      for (final r in rows) r.read<String>('name'): r.read<String>('sql')
    };
    expect(
        bySql.keys,
        unorderedEquals([
          'idx_subjects_user',
          'idx_topics_subject',
          'idx_topics_parent',
          'idx_sessions_user_time',
          'idx_sessions_topic',
          'idx_interruptions_session',
        ]));
    for (final partial in [
      'idx_subjects_user',
      'idx_topics_subject',
      'idx_sessions_user_time'
    ]) {
      expect(bySql[partial], contains('WHERE deleted_at IS NULL'),
          reason: '$partial must be a partial index');
    }
  });

  test('foreign keys are enforced: subject with unknown user is rejected',
      () async {
    await expectLater(
        db.into(db.subjects).insert(SubjectsCompanion.insert(
            id: 'sub-1', userId: 'no-such-user', name: 'Physics')),
        throwsA(isA<SqliteException>()));
  });

  test('sessions.topic_id enforces its foreign key (V2 defect class)',
      () async {
    await db.into(db.users).insert(
        UsersCompanion.insert(id: 'u1', email: 'a@b.c', passwordHash: ''));
    await db.into(db.subjects).insert(
        SubjectsCompanion.insert(id: 's1', userId: 'u1', name: 'Maths'));
    await expectLater(
        db.into(db.sessions).insert(SessionsCompanion.insert(
              id: 'sess-1',
              userId: 'u1',
              subjectId: 's1',
              topicId: const Value('no-such-topic'),
              mode: 'plain',
              startedAt: DateTime.now().toUtc(),
            )),
        throwsA(isA<SqliteException>()));
  });

  test('DateTime round-trips as the same instant at second precision',
      () async {
    final written = DateTime.utc(2026, 7, 26, 13, 45, 12);
    await db.into(db.users).insert(UsersCompanion.insert(
        id: 'u1',
        email: 'a@b.c',
        passwordHash: '',
        createdAt: Value(written)));
    final read = (await db.select(db.users).getSingle()).createdAt;
    // Never assert read.isUtc — drift reads back local time. Compare instants.
    expect(read.toUtc().isAtSameMomentAs(written), isTrue);
  });

  test('daily_summaries rejects a duplicate (user_id, local_date)', () async {
    await db.into(db.users).insert(
        UsersCompanion.insert(id: 'u1', email: 'a@b.c', passwordHash: ''));
    await db.into(db.dailySummaries).insert(DailySummariesCompanion.insert(
        id: 'd1', userId: 'u1', localDate: '2026-07-26'));
    await expectLater(
        db.into(db.dailySummaries).insert(DailySummariesCompanion.insert(
            id: 'd2', userId: 'u1', localDate: '2026-07-26')),
        throwsA(isA<SqliteException>()));
  });
}
