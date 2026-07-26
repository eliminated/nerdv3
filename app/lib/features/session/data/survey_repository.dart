import 'package:drift/drift.dart';

import '../../../core/db/database.dart';
import '../../../core/ids.dart';

/// Writes the post-session survey — the app's core signal (data-model.md §3.5).
///
/// INSERT-ONLY, and two verified one-way doors under the frozen schema explain
/// why there is no upsert and no soft delete:
///
///  * drift 2.34.0 defaults an upsert's conflict target to the PRIMARY KEY, and
///    every attempt carries a fresh [newId], so `insertOnConflictUpdate` could
///    never fire on `session_id` — the UNIQUE constraint would still throw. A
///    future backfill must pass an explicit `target: [sessionId]`.
///  * `session_id` is UNIQUE at column level, so SQLite's implicit unique index
///    counts tombstones: a soft-deleted survey would permanently block
///    re-rating that session, and the freeze forbids dropping the constraint.
///    Surveys must therefore never be soft-deleted.
class SurveyRepository {
  SurveyRepository(this._db);

  final AppDatabase _db;

  static const _surveyableEndReasons = ['completed', 'user_ended'];

  Future<void> saveSurvey({
    required String sessionId,
    required int focusRating,
    int? comprehensionRating,
    int? difficultyRating,
    String? note,
  }) async {
    _checkRange('focusRating', focusRating);
    _checkRange('comprehensionRating', comprehensionRating);
    _checkRange('difficultyRating', difficultyRating);
    final trimmed = note?.trim();

    await _db.transaction(() async {
      // Read inside the transaction so this cannot race recoverCrashedSessions.
      final session = await (_db.select(_db.sessions)
            ..where((t) => t.id.equals(sessionId)))
          .getSingleOrNull();
      if (session == null ||
          session.deletedAt != null ||
          session.endedAt == null ||
          !_surveyableEndReasons.contains(session.endReason)) {
        throw StateError(
            'only a normally-ended session can be surveyed (end_reason: '
            '${session?.endReason ?? 'no such session'}). A crashed session '
            'cannot be trusted and must never weight a qualified day '
            '(data-model.md §5.1).');
      }
      await _db.into(_db.sessionSurveys).insert(SessionSurveysCompanion.insert(
            id: newId(),
            sessionId: sessionId,
            focusRating: focusRating,
            comprehensionRating: Value(comprehensionRating),
            difficultyRating: Value(difficultyRating),
            note: Value(
                trimmed == null || trimmed.isEmpty ? null : trimmed),
          ));
    });
  }

  /// Validated in Dart rather than relying on the CHECK constraints: production
  /// opens the database with `NativeDatabase.createInBackground`, which surfaces
  /// constraint failures as `DriftRemoteException`, while every test uses
  /// `NativeDatabase.memory()` and sees a raw `SqliteException`.
  void _checkRange(String name, int? value) {
    if (value == null) return;
    if (value < 1 || value > 5) {
      throw RangeError.value(value, name, 'a rating must be 1..5');
    }
  }
}
