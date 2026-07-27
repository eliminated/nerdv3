-- NerdyApp schema v1 — FROZEN.
--
-- Transcribed verbatim from the shipped Flutter/drift database (read back out of
-- a live nerdyapp.db via sqlite_master on 2026-07-27), so an existing file opens
-- unchanged and this text is the ground truth rather than a re-derivation.
--
-- THE MIGRATION LAW (masterplan §5) STILL APPLIES: pre-1.0 changes are
-- additive-only — new tables, and new nullable or constant-defaulted columns.
-- No renames, no drops, no type changes, no NOT NULL without a default.
--
-- Notes carried across from the Dart implementation:
--   * Timestamps are INTEGER epoch SECONDS (drift's default). Sub-second
--     precision does not exist here; compare instants at second granularity.
--   * Booleans are INTEGER 0/1 with CHECK constraints.
--   * session_surveys.session_id is UNIQUE at column level, so SQLite's implicit
--     unique index counts tombstones: a soft-deleted survey would permanently
--     block re-rating that session. Surveys must never be soft-deleted.
--   * Every table carries the sync columns (created_at, updated_at, deleted_at,
--     sync_state); all reads filter deleted_at IS NULL.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "updated_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "deleted_at" INTEGER NULL,
  "sync_state" TEXT NOT NULL DEFAULT 'local',
  "email" TEXT NOT NULL UNIQUE,
  "password_hash" TEXT NOT NULL,
  "display_name" TEXT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "day_start_hour" INTEGER NOT NULL DEFAULT 4,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subjects" (
  "id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "updated_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "deleted_at" INTEGER NULL,
  "sync_state" TEXT NOT NULL DEFAULT 'local',
  "user_id" TEXT NOT NULL REFERENCES users (id),
  "name" TEXT NOT NULL,
  "color" TEXT NULL,
  "source" TEXT NOT NULL DEFAULT 'self',
  "source_name" TEXT NULL,
  "archived" INTEGER NOT NULL DEFAULT 0 CHECK ("archived" IN (0, 1)),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "topics" (
  "id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "updated_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "deleted_at" INTEGER NULL,
  "sync_state" TEXT NOT NULL DEFAULT 'local',
  "subject_id" TEXT NOT NULL REFERENCES subjects (id),
  "parent_topic_id" TEXT NULL REFERENCES topics (id),
  "name" TEXT NOT NULL,
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'not_started',
  PRIMARY KEY ("id")
);

-- goal_id is deliberately absent from v1: goals land in Phase 6, and SQLite can
-- add a nullable FK column via ALTER TABLE then — whereas a column created now
-- could never gain its foreign key.
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "updated_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "deleted_at" INTEGER NULL,
  "sync_state" TEXT NOT NULL DEFAULT 'local',
  "user_id" TEXT NOT NULL REFERENCES users (id),
  "subject_id" TEXT NOT NULL REFERENCES subjects (id),
  "topic_id" TEXT NULL REFERENCES topics (id),
  "mode" TEXT NOT NULL,
  "planned_duration_s" INTEGER NULL,
  "actual_duration_s" INTEGER NULL,
  "paused_duration_s" INTEGER NOT NULL DEFAULT 0,
  "started_at" INTEGER NOT NULL,
  "ended_at" INTEGER NULL,
  "end_reason" TEXT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "session_surveys" (
  "id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "updated_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "deleted_at" INTEGER NULL,
  "sync_state" TEXT NOT NULL DEFAULT 'local',
  "session_id" TEXT NOT NULL UNIQUE REFERENCES sessions (id),
  "focus_rating" INTEGER NOT NULL CHECK("focus_rating" BETWEEN 1 AND 5),
  "comprehension_rating" INTEGER NULL CHECK("comprehension_rating" BETWEEN 1 AND 5),
  "difficulty_rating" INTEGER NULL CHECK("difficulty_rating" BETWEEN 1 AND 5),
  "note" TEXT NULL,
  PRIMARY KEY ("id")
);

-- Append-only event log. PRIVACY (data-model.md §3.6): `detail` records the
-- KIND, never the IDENTITY. One repository writes this table and its API cannot
-- express an app name.
CREATE TABLE IF NOT EXISTS "interruptions" (
  "id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "updated_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "deleted_at" INTEGER NULL,
  "sync_state" TEXT NOT NULL DEFAULT 'local',
  "session_id" TEXT NOT NULL REFERENCES sessions (id),
  "kind" TEXT NOT NULL,
  "occurred_at" INTEGER NOT NULL,
  "duration_s" INTEGER NULL,
  "blocked" INTEGER NOT NULL DEFAULT 0 CHECK ("blocked" IN (0, 1)),
  "detail" TEXT NULL,
  PRIMARY KEY ("id")
);

-- Pure cache: fully recomputable from sessions + session_surveys, never synced.
-- The one table exempt from the migration law (data-model.md §4.1).
CREATE TABLE IF NOT EXISTS "daily_summaries" (
  "id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "updated_at" INTEGER NOT NULL DEFAULT (CAST(strftime('%s', CURRENT_TIMESTAMP) AS INTEGER)),
  "deleted_at" INTEGER NULL,
  "sync_state" TEXT NOT NULL DEFAULT 'local',
  "user_id" TEXT NOT NULL REFERENCES users (id),
  "local_date" TEXT NOT NULL,
  "total_seconds" INTEGER NOT NULL DEFAULT 0,
  "session_count" INTEGER NOT NULL DEFAULT 0,
  "avg_focus_rating" REAL NULL,
  "qualified" INTEGER NOT NULL DEFAULT 0 CHECK ("qualified" IN (0, 1)),
  PRIMARY KEY ("id"),
  UNIQUE ("user_id", "local_date")
);

CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics (subject_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topics_parent ON topics (parent_topic_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_time ON sessions (user_id, started_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_topic ON sessions (topic_id);
CREATE INDEX IF NOT EXISTS idx_interruptions_session ON interruptions (session_id);
