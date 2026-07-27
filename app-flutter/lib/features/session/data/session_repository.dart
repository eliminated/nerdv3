import 'package:drift/drift.dart';

import '../../../core/db/database.dart';
import '../../../core/ids.dart';
import '../domain/active_session.dart';
import 'interruption_repository.dart';

class HistoryEntry {
  const HistoryEntry({
    required this.sessionId,
    required this.subjectName,
    required this.startedAt,
    required this.actualDuration,
    this.endReason,
  });

  final String sessionId;
  final String subjectName;
  final DateTime startedAt;
  final Duration actualDuration;
  final String? endReason;
}

/// Everything the Stats inline expansion shows for one session: its survey (if
/// it was rated) and its interruption log.
class SessionDetailView {
  const SessionDetailView({
    required this.interruptions,
    this.focusRating,
    this.comprehensionRating,
    this.difficultyRating,
    this.note,
  });

  final List<InterruptionEntry> interruptions;
  final int? focusRating;
  final int? comprehensionRating;
  final int? difficultyRating;
  final String? note;

  bool get hasSurvey => focusRating != null;
}

class SessionRepository {
  SessionRepository(this._db);

  final AppDatabase _db;

  Future<SessionDetailView> loadSessionDetail(String sessionId) async {
    final survey = await (_db.select(_db.sessionSurveys)
          ..where((t) => t.sessionId.equals(sessionId) & t.deletedAt.isNull()))
        .getSingleOrNull();
    // Ordered by id as well as time: drift stores DateTime as epoch SECONDS, so
    // two events in the same second would otherwise sort arbitrarily between
    // runs. newId() is UUIDv7, which is lexicographically time-ordered.
    final rows = await (_db.select(_db.interruptions)
          ..where((t) => t.sessionId.equals(sessionId) & t.deletedAt.isNull())
          ..orderBy([
            (t) => OrderingTerm.asc(t.occurredAt),
            (t) => OrderingTerm.asc(t.id),
          ]))
        .get();
    return SessionDetailView(
      interruptions: [
        for (final r in rows)
          InterruptionEntry(
              kind: r.kind, occurredAt: r.occurredAt, durationS: r.durationS),
      ],
      focusRating: survey?.focusRating,
      comprehensionRating: survey?.comprehensionRating,
      difficultyRating: survey?.difficultyRating,
      note: survey?.note,
    );
  }

  Future<void> insertStartedSession(ActiveSession s) async {
    await _db.into(_db.sessions).insert(SessionsCompanion.insert(
          id: s.id,
          userId: localUserId,
          subjectId: s.subjectId,
          mode: s.mode,
          startedAt: s.startedAt,
        ));
  }

  Future<void> updatePausedDuration(String id, Duration totalPaused) async {
    // Guarded: an ended session is immutable (data-model.md §3.4).
    await (_db.update(_db.sessions)
          ..where((t) => t.id.equals(id) & t.endedAt.isNull()))
        .write(
      SessionsCompanion(
        pausedDurationS: Value(totalPaused.inSeconds),
        updatedAt: Value(DateTime.now().toUtc()),
      ),
    );
  }

  Future<void> endSession({
    required String id,
    required DateTime endedAt,
    required Duration actualDuration,
    required Duration totalPaused,
  }) async {
    // Guarded: ending is a one-shot closing write (data-model.md §3.4).
    await (_db.update(_db.sessions)
          ..where((t) => t.id.equals(id) & t.endedAt.isNull()))
        .write(
      SessionsCompanion(
        endedAt: Value(endedAt),
        actualDurationS: Value(actualDuration.inSeconds),
        pausedDurationS: Value(totalPaused.inSeconds),
        endReason: const Value('user_ended'),
        updatedAt: Value(DateTime.now().toUtc()),
      ),
    );
  }

  /// Closes out sessions left open by a crash (architecture.md §3.4).
  /// ended_at is the row's last persisted write — an honest lower bound —
  /// and end_reason 'crashed' is the key streak inputs will exclude on.
  /// Returns the number of sessions recovered.
  Future<int> recoverCrashedSessions() async {
    return _db.transaction(() async {
      final open = await (_db.select(_db.sessions)
            ..where((t) => t.endedAt.isNull()))
          .get();
      for (final row in open) {
        final active = row.updatedAt.difference(row.startedAt).inSeconds -
            row.pausedDurationS;
        // The isNull guard is redundant inside this transaction; it keeps the
        // write safe if this loop ever runs outside one.
        await (_db.update(_db.sessions)
              ..where((t) => t.id.equals(row.id) & t.endedAt.isNull()))
            .write(
          SessionsCompanion(
            endedAt: Value(row.updatedAt),
            actualDurationS: Value(active < 0 ? 0 : active),
            endReason: const Value('crashed'),
            updatedAt: Value(DateTime.now().toUtc()),
          ),
        );
      }
      return open.length;
    });
  }

  Stream<List<HistoryEntry>> watchHistory() {
    final query = _db.select(_db.sessions).join([
      innerJoin(
          _db.subjects, _db.subjects.id.equalsExp(_db.sessions.subjectId)),
    ])
      ..where(
          _db.sessions.deletedAt.isNull() & _db.sessions.endedAt.isNotNull())
      ..orderBy([OrderingTerm.desc(_db.sessions.startedAt)]);
    return query.watch().map((rows) => rows.map((row) {
          final session = row.readTable(_db.sessions);
          final subject = row.readTable(_db.subjects);
          return HistoryEntry(
            sessionId: session.id,
            subjectName: subject.name,
            startedAt: session.startedAt,
            actualDuration: Duration(seconds: session.actualDurationS ?? 0),
            endReason: session.endReason,
          );
        }).toList());
  }
}
