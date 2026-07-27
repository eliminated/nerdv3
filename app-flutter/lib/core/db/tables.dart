// Drift's documented CHECK pattern references the column getter inside its
// own definition, which trips this lint; the getters are built lazily and do
// not actually recurse.
// ignore_for_file: recursive_getters

import 'package:drift/drift.dart';

/// Sync + soft-delete columns carried by every table (data-model.md §2).
/// sync_state is device-only and never transmitted.
mixin SyncColumns on Table {
  TextColumn get id => text()();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
  DateTimeColumn get updatedAt => dateTime().withDefault(currentDateAndTime)();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  TextColumn get syncState => text().withDefault(const Constant('local'))();
}

class Users extends Table with SyncColumns {
  TextColumn get email => text().unique()();
  TextColumn get passwordHash => text()();
  TextColumn get displayName => text().nullable()();
  TextColumn get timezone => text().withDefault(const Constant('UTC'))();
  IntColumn get dayStartHour => integer().withDefault(const Constant(4))();

  @override
  Set<Column> get primaryKey => {id};
}

@TableIndex.sql(
    'CREATE INDEX idx_subjects_user ON subjects (user_id) WHERE deleted_at IS NULL;')
class Subjects extends Table with SyncColumns {
  TextColumn get userId => text().references(Users, #id)();
  TextColumn get name => text()();
  TextColumn get color => text().nullable()();
  TextColumn get source => text().withDefault(const Constant('self'))();
  TextColumn get sourceName => text().nullable()();
  BoolColumn get archived => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

@TableIndex.sql(
    'CREATE INDEX idx_topics_subject ON topics (subject_id) WHERE deleted_at IS NULL;')
@TableIndex.sql('CREATE INDEX idx_topics_parent ON topics (parent_topic_id);')
class Topics extends Table with SyncColumns {
  TextColumn get subjectId => text().references(Subjects, #id)();
  TextColumn get parentTopicId => text().nullable().references(Topics, #id)();
  TextColumn get name => text()();
  IntColumn get orderIndex => integer().withDefault(const Constant(0))();
  TextColumn get status => text().withDefault(const Constant('not_started'))();

  @override
  Set<Column> get primaryKey => {id};
}

// goal_id is deliberately absent from schema v1: goals lands in Phase 6, and
// SQLite supports adding a nullable FK column via ALTER TABLE then — whereas a
// column created now could never gain its FK (V2 defect class). See the slice-1
// plan, "Design decisions" §1.
@TableIndex.sql(
    'CREATE INDEX idx_sessions_user_time ON sessions (user_id, started_at DESC) WHERE deleted_at IS NULL;')
@TableIndex.sql('CREATE INDEX idx_sessions_topic ON sessions (topic_id);')
class Sessions extends Table with SyncColumns {
  TextColumn get userId => text().references(Users, #id)();
  TextColumn get subjectId => text().references(Subjects, #id)();
  TextColumn get topicId => text().nullable().references(Topics, #id)();
  TextColumn get mode => text()(); // 'plain'|'focused'|'ultra_focus'
  IntColumn get plannedDurationS => integer().nullable()();
  IntColumn get actualDurationS => integer().nullable()();
  IntColumn get pausedDurationS => integer().withDefault(const Constant(0))();
  DateTimeColumn get startedAt => dateTime()();
  DateTimeColumn get endedAt => dateTime().nullable()();
  TextColumn get endReason => text().nullable()();
  // 'completed'|'user_ended'|'abandoned'|'crashed'

  @override
  Set<Column> get primaryKey => {id};
}

class SessionSurveys extends Table with SyncColumns {
  TextColumn get sessionId => text().references(Sessions, #id).unique()();
  // CHECKs mirror data-model.md §3.5 and must land before the v1 freeze —
  // SQLite cannot add a CHECK to an existing table without a rebuild.
  IntColumn get focusRating =>
      integer().check(focusRating.isBetweenValues(1, 5))();
  IntColumn get comprehensionRating => integer()
      .nullable()
      .check(comprehensionRating.isBetweenValues(1, 5))();
  IntColumn get difficultyRating =>
      integer().nullable().check(difficultyRating.isBetweenValues(1, 5))();
  TextColumn get note => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

@TableIndex.sql(
    'CREATE INDEX idx_interruptions_session ON interruptions (session_id);')
class Interruptions extends Table with SyncColumns {
  TextColumn get sessionId => text().references(Sessions, #id)();
  TextColumn get kind => text()();
  DateTimeColumn get occurredAt => dateTime()();
  IntColumn get durationS => integer().nullable()();
  BoolColumn get blocked => boolean().withDefault(const Constant(false))();
  TextColumn get detail => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class DailySummaries extends Table with SyncColumns {
  TextColumn get userId => text().references(Users, #id)();
  TextColumn get localDate => text()(); // 'YYYY-MM-DD', frozen at write time
  IntColumn get totalSeconds => integer().withDefault(const Constant(0))();
  IntColumn get sessionCount => integer().withDefault(const Constant(0))();
  RealColumn get avgFocusRating => real().nullable()();
  BoolColumn get qualified => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<Set<Column>> get uniqueKeys => [
        {userId, localDate},
      ];
}
