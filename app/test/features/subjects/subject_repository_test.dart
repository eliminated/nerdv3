import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
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
}
