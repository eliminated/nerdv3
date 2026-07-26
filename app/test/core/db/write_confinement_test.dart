import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

// data-model.md §3.6 / focus-enforcement.md §7:
//   "detail records *kind*, never *identity*. Store `app_switch`, not the name
//    of the app switched to. Recording which apps a student opens is
//    surveillance, and it would also make an Accessibility Service permission
//    far harder to justify."
//
// Exit criterion 3 ("a test asserts detail never records app identity") cannot
// honestly be met by asserting rows have detail == null: Phase 2 has no window
// title to record, so such an assertion passes on code that COULD NOT leak and
// never exercises the Phase 3 app_switch writer that actually risks it — the
// unfailable-test class the V2 post-mortem calls its most expensive lesson.
//
// Instead: one writer, and identity is not representable in its API. Adding a
// context parameter, or writing the table from anywhere else, turns this red.
void main() {
  test(
      'only InterruptionRepository writes interruptions, and it never mentions detail',
      () {
    const owner = 'interruption_repository.dart';
    // Writes only — the Stats reader's select over db.interruptions is legal.
    final writes = RegExp(
        r'InterruptionsCompanion|(?:into|update|delete)\(\s*_?db\.interruptions');
    final offenders = <String>[];
    var scanned = 0;
    var ownerSeen = false;

    for (final entity in Directory('lib').listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      if (entity.path.endsWith('.g.dart')) continue; // generated
      scanned++;
      final source = entity.readAsStringSync();
      if (entity.path.endsWith(owner)) {
        ownerSeen = true;
        expect(source.contains('detail'), isFalse,
            reason: 'app identity must stay unrepresentable in $owner — '
                'adding it has to be a deliberate edit to this named test');
        continue;
      }
      if (writes.hasMatch(source)) offenders.add(entity.path);
    }

    expect(offenders, isEmpty,
        reason: 'every interruption write must go through $owner');
    expect(ownerSeen, isTrue, reason: '$owner must exist and have been scanned');
    // Anti-vacuity: a wrong working directory would make the scan pass having
    // read nothing at all. app/lib holds 27 .dart files today (26 non-generated);
    // this floor only has to prove the walk actually ran.
    expect(scanned, greaterThan(20));
  });
}
