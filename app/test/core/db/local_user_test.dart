import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';
import 'package:nerdyapp/core/db/local_user.dart';
import 'package:nerdyapp/core/ids.dart';

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('ensureLocalUser seeds exactly one row with the fixed id', () async {
    await ensureLocalUser(db);
    final users = await db.select(db.users).get();
    expect(users, hasLength(1));
    expect(users.single.id, localUserId);
  });

  test('ensureLocalUser is idempotent and race-safe', () async {
    // V2's defect was read-then-insert with no transaction: concurrent
    // callers either duplicated the row or threw on the PK collision.
    await Future.wait(List.generate(100, (_) => ensureLocalUser(db)));
    final users = await db.select(db.users).get();
    expect(users, hasLength(1));
  });
}
