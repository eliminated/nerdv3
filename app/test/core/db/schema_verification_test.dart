import 'package:drift/native.dart';
import 'package:drift_dev/api/migrations.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/db/database.dart';

import '../../generated/schema.dart';

void main() {
  late SchemaVerifier verifier;

  setUpAll(() => verifier = SchemaVerifier(GeneratedHelper()));

  test('onCreate from live table definitions matches the committed v1 snapshot',
      () async {
    // The database is FRESH: onCreate runs createAll() from the CURRENT code,
    // and the verifier compares that against the COMMITTED drift_schema_v1.json.
    // Never seed from the snapshot being validated (V2's self-comparison defect).
    // validateDropped: true is required or an added table/index passes green.
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await verifier.migrateAndValidate(db, 1, validateDropped: true);
  });
}
