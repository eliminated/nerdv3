import 'package:drift/drift.dart';

import '../../../core/db/database.dart';
import '../../../core/ids.dart';

/// Wire values for `interruptions.kind`. The column has no CHECK in schema v1,
/// so these strings ARE the contract — renaming one silently orphans history.
const kindManualPause = 'manual_pause';
const kindSelfReported = 'self_reported';

/// Read projection for the Stats inline expansion.
class InterruptionEntry {
  const InterruptionEntry({
    required this.kind,
    required this.occurredAt,
    this.durationS,
  });

  final String kind;
  final DateTime occurredAt;
  final int? durationS;
}

/// The ONLY writer of the interruptions table — enforced by
/// `test/core/db/write_confinement_test.dart`.
///
/// PRIVACY (data-model.md §3.6, focus-enforcement.md §7): log the *kind*, never
/// the *identity*. Record that an app switch happened, not which app was
/// opened. No method here accepts free-form context, so app identity is not
/// representable through this API; Phase 3's first such write has to widen a
/// signature in this file deliberately, in front of a reviewer.
class InterruptionRepository {
  InterruptionRepository(this._db);

  final AppDatabase _db;

  /// The single write path. `blocked` is explicit rather than left to the
  /// column default so that production code — not the schema — decides it.
  Future<void> logSessionEvent({
    required String sessionId,
    required String kind,
    required DateTime occurredAt,
    int? durationS,
    bool blocked = false,
  }) async {
    // focus-enforcement.md §7's vocabulary is bare tokens. Without this, the
    // discriminator itself could smuggle identity ('app_switch:chrome.exe') —
    // the one free-text column left on this write path. A thrown error, not an
    // assert: asserts are stripped in release builds.
    if (!RegExp(r'^[a-z_]+$').hasMatch(kind)) {
      throw ArgumentError.value(kind, 'kind',
          'must be a bare token — the log records the kind, never the identity');
    }
    await _db.into(_db.interruptions).insert(InterruptionsCompanion.insert(
          id: newId(),
          sessionId: sessionId,
          kind: kind,
          occurredAt: occurredAt.toUtc(),
          durationS: Value(durationS),
          blocked: Value(blocked),
        ));
  }

  /// One append-only row per COMPLETED pause: `occurred_at` is when the pause
  /// began, `duration_s` how long it lasted. The span is clamped because
  /// DateTime.now() is not monotonic — an NTP correction mid-pause would
  /// otherwise store a negative duration (same convention as crash recovery).
  Future<void> logPause({
    required String sessionId,
    required DateTime pauseStartedAt,
    required DateTime resumedAt,
  }) {
    final span = resumedAt.difference(pauseStartedAt).inSeconds;
    return logSessionEvent(
      sessionId: sessionId,
      kind: kindManualPause,
      occurredAt: pauseStartedAt,
      durationS: span < 0 ? 0 : span,
    );
  }

  /// The one-tap distraction button (masterplan §7 Phase 2, R3). Records only
  /// that the user was distracted — never by what.
  Future<void> logSelfReport({
    required String sessionId,
    required DateTime occurredAt,
  }) =>
      logSessionEvent(
        sessionId: sessionId,
        kind: kindSelfReported,
        occurredAt: occurredAt,
      );

  /// Live count of this session's self-reports, for in-session feedback.
  Stream<int> watchSelfReportCount(String sessionId) {
    final count = _db.interruptions.id.count();
    final query = _db.selectOnly(_db.interruptions)
      ..addColumns([count])
      ..where(_db.interruptions.sessionId.equals(sessionId) &
          _db.interruptions.kind.equals(kindSelfReported) &
          _db.interruptions.deletedAt.isNull());
    return query.map((row) => row.read(count) ?? 0).watchSingle();
  }
}
