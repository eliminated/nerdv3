import 'dart:io';

import 'database.dart';

/// Writes a consistent snapshot of the open database to [targetPath] using
/// SQLite's VACUUM INTO — safe while connections are open and WAL is active,
/// which a raw file copy is not. Overwrites any existing file at the target
/// (VACUUM INTO itself refuses to).
Future<void> backupDatabase(AppDatabase db, String targetPath) async {
  final existing = File(targetPath);
  if (existing.existsSync()) existing.deleteSync();
  await db.customStatement('VACUUM INTO ?', [targetPath]);
}
