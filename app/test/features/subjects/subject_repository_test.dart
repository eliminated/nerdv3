import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/features/session/data/session_repository.dart';
import 'package:nerdyapp/features/session/domain/active_session.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

void main() {
  late AppDatabase db;
  late SubjectRepository repo;

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    await ensureLocalUser(db);
    repo = SubjectRepository(db);
  });
  tearDown(() => db.close());

  test('createSubject inserts a row visible to watchSubjects', () async {
    await repo.createSubject('Physics');
    final subjects = await repo.watchSubjects().first;
    expect(subjects, hasLength(1));
    expect(subjects.single.name, 'Physics');
  });

  test('watchSubjects excludes soft-deleted rows', () async {
    final id = await repo.createSubject('Old');
    await (db.update(db.subjects)..where((s) => s.id.equals(id))).write(
        SubjectsCompanion(deletedAt: Value(DateTime.now().toUtc())));
    final subjects = await repo.watchSubjects().first;
    expect(subjects, isEmpty);
  });

  test('create persists colour, source and source name; defaults are self/null',
      () async {
    final plainId = await repo.createSubject('Maths');
    final richId = await repo.createSubject('Flutter',
        color: '#42A5F5', source: 'course', sourceName: 'Udemy');
    final rows = await repo.watchSubjects().first;
    final plain = rows.singleWhere((s) => s.id == plainId);
    final rich = rows.singleWhere((s) => s.id == richId);
    expect((plain.color, plain.source, plain.sourceName), (null, 'self', null));
    expect((rich.color, rich.source, rich.sourceName),
        ('#42A5F5', 'course', 'Udemy'));
  });

  test('update rewrites all editable fields', () async {
    final id = await repo.createSubject('Chem',
        color: '#EF5350', source: 'school', sourceName: 'MRSM');
    await repo.updateSubject(id,
        name: 'Chemistry', color: null, source: 'self', sourceName: null);
    final s = (await repo.watchSubjects().first).single;
    expect((s.name, s.color, s.source, s.sourceName),
        ('Chemistry', null, 'self', null));
  });

  test('archiving removes from the active list but not from history joins',
      () async {
    final id = await repo.createSubject('Physics');
    // An ended session, so the history join has something to find.
    final session = ActiveSession.start(
        id: 'sess-arch', subjectId: id, startedAt: DateTime.utc(2026, 7, 26));
    final sessions = SessionRepository(db);
    await sessions.insertStartedSession(session);
    await sessions.endSession(
      id: session.id,
      endedAt: session.startedAt.add(const Duration(minutes: 30)),
      actualDuration: const Duration(minutes: 30),
      totalPaused: Duration.zero,
    );

    await repo.setArchived(id, archived: true);
    expect(await repo.watchSubjects().first, isEmpty);
    expect((await repo.watchSubjects(archived: true).first).single.name,
        'Physics');
    expect(
        (await sessions.watchHistory().first).single.subjectName, 'Physics');

    await repo.setArchived(id, archived: false);
    expect((await repo.watchSubjects().first).single.name, 'Physics');
  });

  test('delete is soft: gone from both lists, history keeps the name',
      () async {
    final id = await repo.createSubject('Physics');
    final session = ActiveSession.start(
        id: 'sess-del', subjectId: id, startedAt: DateTime.utc(2026, 7, 26));
    final sessions = SessionRepository(db);
    await sessions.insertStartedSession(session);
    await sessions.endSession(
      id: session.id,
      endedAt: session.startedAt.add(const Duration(minutes: 30)),
      actualDuration: const Duration(minutes: 30),
      totalPaused: Duration.zero,
    );

    await repo.deleteSubject(id);
    expect(await repo.watchSubjects().first, isEmpty);
    expect(await repo.watchSubjects(archived: true).first, isEmpty);
    final row = await db.select(db.subjects).getSingle();
    expect(row.deletedAt, isNotNull); // soft, not DELETE
    expect(
        (await sessions.watchHistory().first).single.subjectName, 'Physics');
  });
}
