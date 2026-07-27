import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

import 'package:nerdyapp/core/db/backup.dart';
import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/features/subjects/data/subject_repository.dart';

void main() {
  test('backup produces a valid SQLite database containing the data',
      () async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await ensureLocalUser(db);
    await SubjectRepository(db).createSubject('Physics');

    final dir = await Directory.systemTemp.createTemp('nerdyapp_backup_test');
    addTearDown(() => dir.delete(recursive: true));
    final target = p.join(dir.path, 'backup.db');

    await backupDatabase(db, target);

    expect(File(target).existsSync(), isTrue);
    // The backup must open as a real database and contain the rows.
    final copy = AppDatabase(NativeDatabase(File(target)));
    addTearDown(copy.close);
    final subjects = await copy.select(copy.subjects).get();
    expect(subjects.map((s) => s.name), ['Physics']);
  });

  test('backup overwrites an existing file at the target path', () async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await ensureLocalUser(db);

    final dir = await Directory.systemTemp.createTemp('nerdyapp_backup_test');
    addTearDown(() => dir.delete(recursive: true));
    final target = p.join(dir.path, 'backup.db');
    File(target).writeAsStringSync('not a database');

    await backupDatabase(db, target);

    final copy = AppDatabase(NativeDatabase(File(target)));
    addTearDown(copy.close);
    expect(await copy.select(copy.users).get(), hasLength(1));
  });
}
