import 'package:drift/drift.dart';

import '../ids.dart';
import 'database.dart';

/// Seeds the single local user row (masterplan locked decision 4).
/// insertOrIgnore on the primary key makes this atomic and idempotent —
/// no read-then-insert race (V2 post-mortem defect 4).
Future<void> ensureLocalUser(AppDatabase db) async {
  await db.into(db.users).insert(
        UsersCompanion.insert(
          id: localUserId,
          email: 'local@device.invalid',
          passwordHash: '',
        ),
        mode: InsertMode.insertOrIgnore,
      );
}
