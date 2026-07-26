import 'package:drift/drift.dart';

import '../../../core/db/database.dart';
import '../../../core/ids.dart';
import '../domain/active_session.dart';

class HistoryEntry {
  const HistoryEntry({
    required this.sessionId,
    required this.subjectName,
    required this.startedAt,
    required this.actualDuration,
  });

  final String sessionId;
  final String subjectName;
  final DateTime startedAt;
  final Duration actualDuration;
}

class SessionRepository {
  SessionRepository(this._db);

  final AppDatabase _db;

  Future<void> insertStartedSession(ActiveSession s) async {
    await _db.into(_db.sessions).insert(SessionsCompanion.insert(
          id: s.id,
          userId: localUserId,
          subjectId: s.subjectId,
          mode: 'plain',
          startedAt: s.startedAt,
        ));
  }

  Future<void> updatePausedDuration(String id, Duration totalPaused) async {
    await (_db.update(_db.sessions)..where((t) => t.id.equals(id))).write(
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
    await (_db.update(_db.sessions)..where((t) => t.id.equals(id))).write(
      SessionsCompanion(
        endedAt: Value(endedAt),
        actualDurationS: Value(actualDuration.inSeconds),
        pausedDurationS: Value(totalPaused.inSeconds),
        endReason: const Value('user_ended'),
        updatedAt: Value(DateTime.now().toUtc()),
      ),
    );
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
          );
        }).toList());
  }
}
