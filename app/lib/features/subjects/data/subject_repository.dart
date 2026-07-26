import 'package:drift/drift.dart';

import '../../../core/db/database.dart';
import '../../../core/ids.dart';

class SubjectRepository {
  SubjectRepository(this._db);

  final AppDatabase _db;

  Future<String> createSubject(
    String name, {
    String? color,
    String source = 'self',
    String? sourceName,
  }) async {
    final id = newId();
    await _db.into(_db.subjects).insert(SubjectsCompanion.insert(
          id: id,
          userId: localUserId,
          name: name,
          color: Value(color),
          source: Value(source),
          sourceName: Value(sourceName),
        ));
    return id;
  }

  /// Writes all editable fields; null clears colour / source name.
  Future<void> updateSubject(
    String id, {
    required String name,
    String? color,
    required String source,
    String? sourceName,
  }) async {
    await (_db.update(_db.subjects)..where((s) => s.id.equals(id))).write(
      SubjectsCompanion(
        name: Value(name),
        color: Value(color),
        source: Value(source),
        sourceName: Value(sourceName),
        updatedAt: Value(DateTime.now().toUtc()),
      ),
    );
  }

  Future<void> setArchived(String id, {required bool archived}) async {
    await (_db.update(_db.subjects)..where((s) => s.id.equals(id))).write(
      SubjectsCompanion(
        archived: Value(archived),
        updatedAt: Value(DateTime.now().toUtc()),
      ),
    );
  }

  /// Soft delete (data-model.md §2) — history joins keep the name.
  Future<void> deleteSubject(String id) async {
    final now = DateTime.now().toUtc();
    await (_db.update(_db.subjects)..where((s) => s.id.equals(id))).write(
      SubjectsCompanion(deletedAt: Value(now), updatedAt: Value(now)),
    );
  }

  Stream<List<Subject>> watchSubjects({bool archived = false}) {
    return (_db.select(_db.subjects)
          ..where((s) => s.deletedAt.isNull() & s.archived.equals(archived))
          ..orderBy([(s) => OrderingTerm.desc(s.createdAt)]))
        .watch();
  }
}
