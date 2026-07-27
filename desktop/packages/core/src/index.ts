/**
 * The public surface of `@nerdyapp/core`.
 *
 * Pure TypeScript: nothing here imports Electron or Vue (V3 spec §3, restating
 * architecture.md §3.1). That is what keeps the correctness-critical logic
 * testable without a window, and what would let a future Tauri move reuse it
 * unchanged.
 */

export { ActiveSession } from './domain/active-session.js';
export { DomainStateError, ValidationError } from './errors.js';
export { localUserId, newId } from './ids.js';
export { fromEpochSeconds, msToSeconds, toEpochSeconds } from './time.js';

export { openDatabase, readSchemaSql, type Database } from './db/connection.js';
export {
  nodeSqliteDriver,
  type BindValue,
  type SqliteDriver,
  type SqliteStatement,
} from './db/driver.js';
export { ensureLocalUser } from './db/local-user.js';

export type {
  HistoryEntry,
  InterruptionEntry,
  InterruptionRepository,
  SessionDetailView,
  SessionRepository,
  SubjectRepository,
  SubjectRow,
  SurveyRepository,
} from './data/ports.js';

export { SqliteSubjectRepository } from './data/subject-repository.js';
export { SqliteSessionRepository } from './data/session-repository.js';
export {
  KIND_MANUAL_PAUSE,
  KIND_SELF_REPORTED,
  SqliteInterruptionRepository,
} from './data/interruption-repository.js';
export { SqliteSurveyRepository } from './data/survey-repository.js';

/**
 * The in-memory binding for `nerdyapp-test.exe`, which opens no database at all
 * (V3 spec §5). One contract suite runs against this and the SQLite binding
 * both, so the two executables cannot drift apart.
 */
export {
  createFixtureRepositories,
  emptyStore,
  FixtureInterruptionRepository,
  FixtureSessionRepository,
  FixtureSubjectRepository,
  FixtureSurveyRepository,
  type FixtureStore,
  type Repositories,
} from './data/fixtures/index.js';

/** The invariants both bindings share — one copy, deliberately. */
export { KINDS, SURVEYABLE_END_REASONS } from './data/rules.js';
