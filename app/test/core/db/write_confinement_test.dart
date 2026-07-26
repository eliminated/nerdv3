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
// Instead this test confines the table: exactly one file may reach it to write,
// one may read it, and the writer's API cannot express identity (no `detail`
// parameter, and `kind` is validated as a bare token in the repository itself).
//
// It forbids REACHING the table rather than enumerating write syntaxes, because
// drift offers several — generated managers, companions, aliases, batches — and
// raw `customStatement` SQL bypasses all of them. Every route must name the
// table somewhere, so this is syntax-agnostic.
void main() {
  test('only InterruptionRepository reaches the interruptions table to write',
      () {
    const owner = 'lib/features/session/data/interruption_repository.dart';
    // The one legal reader: SessionRepository.loadSessionDetail selects the log
    // for the Stats expansion. An exact path, not a pattern — a new reader has
    // to be added here deliberately, in front of a reviewer.
    const readers = {'lib/features/session/data/session_repository.dart'};

    // Any route to the drift TABLE object, plus any raw SQL naming the table.
    // Anchored on a `…db`/`database`/`managers` receiver so it does not fire on
    // plain projections (SessionDetailView.interruptions is a List, not a table).
    // Known limit, and why the spec calls this guarantee procedural: aliasing
    // the database to a name not ending in "db" would slip past the scan.
    final reaches = RegExp(
        r'(?:\w*[dD]b|database|managers)\.interruptions\b'
        r'|Interruptions(?:Companion|Table|Data)\b');
    // Raw SQL touching the table, wherever the statement is built — a probe
    // proved that anchoring on `customStatement(` misses SQL held in a variable.
    // Matches SQL-shaped proximity, so ordinary prose mentioning the log (e.g.
    // the Stats header copy) does not trip it.
    final rawSql = RegExp(
        r'(?:insert|update|delete|replace|into|from)\b[^;]{0,120}?interruptions',
        caseSensitive: false);

    final offenders = <String>[];
    var scanned = 0;
    var ownerSeen = false;

    for (final entity in Directory('lib').listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      if (entity.path.endsWith('.g.dart')) continue; // generated
      scanned++;
      final source = entity.readAsStringSync();
      final relative = entity.path.replaceAll(r'\', '/');

      if (relative.endsWith(owner)) {
        ownerSeen = true;
        expect(source.contains('detail'), isFalse,
            reason: 'app identity must stay unrepresentable in $owner — '
                'adding it has to be a deliberate edit to this named test');
        continue;
      }
      if (readers.any(relative.endsWith)) continue;
      if (reaches.hasMatch(source) || rawSql.hasMatch(source)) {
        offenders.add(relative);
      }
    }

    expect(offenders, isEmpty,
        reason: 'the interruptions table may only be reached by $owner '
            '(writes) and $readers (reads)');
    expect(ownerSeen, isTrue, reason: '$owner must exist and have been scanned');
    // Anti-vacuity: a wrong working directory would make the scan pass having
    // read nothing at all. The floor sits far below the real file count on
    // purpose — it only has to prove the walk ran, so adding files under lib/
    // must never require touching this number.
    expect(scanned, greaterThan(20));
  });
}
