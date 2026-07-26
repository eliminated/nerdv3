import 'package:drift/drift.dart';

import '../../../core/db/database.dart';
import '../../../core/ids.dart';

class SubjectRepository {
  SubjectRepository(this._db);

  final AppDatabase _db;

  Future<String> createSubject(String name) async {
    final id = newId();
    await _db.into(_db.subjects).insert(SubjectsCompanion.insert(
          id: id,
          userId: localUserId,
          name: name,
        ));
    return id;
  }

  Stream<List<Subject>> watchSubjects() {
    return (_db.select(_db.subjects)
          ..where((s) => s.deletedAt.isNull())
          ..orderBy([(s) => OrderingTerm.desc(s.createdAt)]))
        .watch();
  }
}
