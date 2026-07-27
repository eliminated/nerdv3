import { DomainStateError } from '../../errors.js';
import { newId } from '../../ids.js';
import type { ActiveSession } from '../../domain/active-session.js';
import { msToSeconds } from '../../time.js';
import type {
  HistoryEntry,
  InterruptionRepository,
  SessionDetailView,
  SessionRepository,
  SubjectRepository,
  SubjectRow,
  SurveyRepository,
} from '../ports.js';
import {
  assertDurationS,
  assertFocusRating,
  assertKind,
  assertRating,
  KIND_MANUAL_PAUSE,
  KIND_SELF_REPORTED,
  pauseSpanSeconds,
  SURVEYABLE_END_REASONS,
} from '../rules.js';

/**
 * In-memory implementations of the four ports, for `nerdyapp-test.exe`.
 *
 * That build **opens no database at all** (V3 spec §5): it runs on example data
 * so the whole UX can be walked and debugged without touching real study
 * history, and with no file to corrupt. These are also the natural test double
 * for `ui` component tests in V3-C.
 *
 * They share `../rules.js` with the SQLite binding rather than restating the
 * invariants, and `test/data/contract.test.ts` runs the same assertions against
 * both. That pairing is what keeps the two executables from drifting — which is
 * the failure the two-build design would otherwise invite.
 */

interface SessionRecord {
  id: string;
  subjectId: string;
  mode: string;
  startedAtS: number;
  endedAtS: number | null;
  actualDurationS: number | null;
  pausedDurationS: number;
  endReason: string | null;
  createdAtS: number;
  updatedAtS: number;
  deletedAtS: number | null;
}

interface SubjectRecord {
  id: string;
  name: string;
  color: string | null;
  source: string;
  sourceName: string | null;
  archived: boolean;
  createdAtS: number;
  updatedAtS: number;
  deletedAtS: number | null;
}

interface SurveyRecord {
  sessionId: string;
  focusRating: number;
  comprehensionRating: number | null;
  difficultyRating: number | null;
  note: string | null;
  deletedAtS: number | null;
}

interface InterruptionRecord {
  id: string;
  sessionId: string;
  kind: string;
  occurredAtS: number;
  durationS: number | null;
  blocked: boolean;
  deletedAtS: number | null;
}

/** Shared mutable store, so the four repositories see one another's writes. */
export interface FixtureStore {
  subjects: SubjectRecord[];
  sessions: SessionRecord[];
  surveys: SurveyRecord[];
  interruptions: InterruptionRecord[];
}

export function emptyStore(): FixtureStore {
  return { subjects: [], sessions: [], surveys: [], interruptions: [] };
}

const secs = (d: Date): number => Math.trunc(d.getTime() / 1000);
const toDate = (s: number): Date => new Date(s * 1000);

export class FixtureSubjectRepository implements SubjectRepository {
  constructor(
    private readonly store: FixtureStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(a: {
    name: string;
    color?: string | null;
    source?: string;
    sourceName?: string | null;
  }): Promise<string> {
    const id = newId();
    const ts = secs(this.now());
    this.store.subjects.push({
      id,
      name: a.name,
      color: a.color ?? null,
      source: a.source ?? 'self',
      sourceName: a.sourceName ?? null,
      archived: false,
      createdAtS: ts,
      updatedAtS: ts,
      deletedAtS: null,
    });
    return id;
  }

  async update(
    id: string,
    a: { name: string; color: string | null; source: string; sourceName: string | null },
  ): Promise<void> {
    const s = this.store.subjects.find((r) => r.id === id);
    if (s === undefined) return;
    s.name = a.name;
    s.color = a.color;
    s.source = a.source;
    s.sourceName = a.sourceName;
    s.updatedAtS = secs(this.now());
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    const s = this.store.subjects.find((r) => r.id === id);
    if (s === undefined) return;
    s.archived = archived;
    s.updatedAtS = secs(this.now());
  }

  async remove(id: string): Promise<void> {
    const s = this.store.subjects.find((r) => r.id === id);
    if (s === undefined) return;
    const ts = secs(this.now());
    s.deletedAtS = ts;
    s.updatedAtS = ts;
  }

  async list(opts: { archived?: boolean } = {}): Promise<SubjectRow[]> {
    const want = opts.archived === true;
    return this.store.subjects
      .filter((s) => s.deletedAtS === null && s.archived === want)
      .sort((x, y) => y.createdAtS - x.createdAtS || (y.id < x.id ? -1 : y.id > x.id ? 1 : 0))
      .map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        source: s.source,
        sourceName: s.sourceName,
        archived: s.archived,
        createdAt: toDate(s.createdAtS),
      }));
  }
}

export class FixtureSessionRepository implements SessionRepository {
  constructor(
    private readonly store: FixtureStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async insertStarted(s: ActiveSession): Promise<void> {
    const ts = secs(this.now());
    this.store.sessions.push({
      id: s.id,
      subjectId: s.subjectId,
      mode: s.mode,
      startedAtS: secs(s.startedAt),
      endedAtS: null,
      actualDurationS: null,
      pausedDurationS: 0,
      endReason: null,
      createdAtS: ts,
      updatedAtS: ts,
      deletedAtS: null,
    });
  }

  /** The `ended_at IS NULL` guard, in the shape this binding can express it. */
  private live(id: string): SessionRecord | undefined {
    const s = this.store.sessions.find((r) => r.id === id);
    return s !== undefined && s.endedAtS === null ? s : undefined;
  }

  async updatePausedDuration(id: string, totalPausedMs: number): Promise<void> {
    const s = this.live(id);
    if (s === undefined) return;
    s.pausedDurationS = msToSeconds(totalPausedMs);
    s.updatedAtS = secs(this.now());
  }

  async end(a: {
    id: string;
    endedAt: Date;
    actualDurationMs: number;
    totalPausedMs: number;
  }): Promise<void> {
    const s = this.live(a.id);
    if (s === undefined) return;
    s.endedAtS = secs(a.endedAt);
    s.actualDurationS = Math.max(0, msToSeconds(a.actualDurationMs));
    s.pausedDurationS = Math.max(0, msToSeconds(a.totalPausedMs));
    s.endReason = 'user_ended';
    s.updatedAtS = secs(this.now());
  }

  async recoverCrashedSessions(): Promise<number> {
    const open = this.store.sessions.filter((s) => s.endedAtS === null);
    const nowS = secs(this.now());
    for (const s of open) {
      const activeS = s.updatedAtS - s.startedAtS - s.pausedDurationS;
      s.endedAtS = s.updatedAtS;
      s.actualDurationS = Math.max(0, activeS);
      s.endReason = 'crashed';
      s.updatedAtS = nowS;
    }
    return open.length;
  }

  async listHistory(): Promise<HistoryEntry[]> {
    return this.store.sessions
      .filter((s) => s.deletedAtS === null && s.endedAtS !== null)
      .sort((x, y) => y.startedAtS - x.startedAtS || (y.id < x.id ? -1 : y.id > x.id ? 1 : 0))
      .map((s) => ({
        sessionId: s.id,
        // Deliberately NOT filtered on deletedAt: an archived or soft-deleted
        // subject must still name its sessions, same as the SQL join.
        subjectName: this.store.subjects.find((sub) => sub.id === s.subjectId)?.name ?? '',
        startedAt: toDate(s.startedAtS),
        actualDurationS: s.actualDurationS ?? 0,
        endReason: s.endReason,
      }));
  }

  async loadSessionDetail(sessionId: string): Promise<SessionDetailView> {
    const survey = this.store.surveys.find(
      (s) => s.sessionId === sessionId && s.deletedAtS === null,
    );
    const rows = this.store.interruptions
      .filter((i) => i.sessionId === sessionId && i.deletedAtS === null)
      .sort((x, y) => x.occurredAtS - y.occurredAtS || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    return {
      interruptions: rows.map((r) => ({
        kind: r.kind,
        occurredAt: toDate(r.occurredAtS),
        durationS: r.durationS,
      })),
      focusRating: survey?.focusRating ?? null,
      comprehensionRating: survey?.comprehensionRating ?? null,
      difficultyRating: survey?.difficultyRating ?? null,
      note: survey?.note ?? null,
      hasSurvey: survey !== undefined,
    };
  }
}

export class FixtureInterruptionRepository implements InterruptionRepository {
  constructor(private readonly store: FixtureStore) {}

  async logSessionEvent(a: {
    sessionId: string;
    kind: string;
    occurredAt: Date;
    durationS?: number | null;
    blocked?: boolean;
  }): Promise<void> {
    assertKind(a.kind);
    assertDurationS(a.durationS);
    // The foreign key is the last line of defence in SQL; this binding has to
    // state it, or the two would disagree about an unknown session id.
    if (!this.store.sessions.some((s) => s.id === a.sessionId)) {
      throw new DomainStateError(`FOREIGN KEY constraint failed: no session ${a.sessionId}`);
    }
    this.store.interruptions.push({
      id: newId(),
      sessionId: a.sessionId,
      kind: a.kind,
      occurredAtS: secs(a.occurredAt),
      durationS: a.durationS ?? null,
      blocked: a.blocked === true,
      deletedAtS: null,
    });
  }

  async logPause(a: { sessionId: string; pauseStartedAt: Date; resumedAt: Date }): Promise<void> {
    return this.logSessionEvent({
      sessionId: a.sessionId,
      kind: KIND_MANUAL_PAUSE,
      occurredAt: a.pauseStartedAt,
      durationS: pauseSpanSeconds(a.pauseStartedAt, a.resumedAt),
    });
  }

  async logSelfReport(a: { sessionId: string; occurredAt: Date }): Promise<void> {
    return this.logSessionEvent({
      sessionId: a.sessionId,
      kind: KIND_SELF_REPORTED,
      occurredAt: a.occurredAt,
    });
  }

  async countSelfReports(sessionId: string): Promise<number> {
    return this.store.interruptions.filter(
      (i) => i.sessionId === sessionId && i.kind === KIND_SELF_REPORTED && i.deletedAtS === null,
    ).length;
  }
}

export class FixtureSurveyRepository implements SurveyRepository {
  constructor(private readonly store: FixtureStore) {}

  async save(a: {
    sessionId: string;
    focusRating: number;
    comprehensionRating?: number | null;
    difficultyRating?: number | null;
    note?: string | null;
  }): Promise<void> {
    assertFocusRating(a.focusRating);
    assertRating('comprehensionRating', a.comprehensionRating ?? null);
    assertRating('difficultyRating', a.difficultyRating ?? null);
    const trimmed = a.note?.trim() ?? '';

    const session = this.store.sessions.find((s) => s.id === a.sessionId);
    if (
      session === undefined ||
      session.deletedAtS !== null ||
      session.endedAtS === null ||
      session.endReason === null ||
      !SURVEYABLE_END_REASONS.has(session.endReason)
    ) {
      const why =
        session === undefined
          ? 'no such session'
          : session.deletedAtS !== null
            ? 'session is deleted'
            : session.endedAtS === null
              ? 'session has not ended yet'
              : `end_reason: ${session.endReason ?? 'null'}`;
      throw new DomainStateError(
        `only a normally-ended session can be surveyed (${why}). A crashed session ` +
          `cannot be trusted and must never weight a qualified day (data-model.md §5.1).`,
      );
    }
    // Insert-only, mirroring the UNIQUE constraint on session_id.
    if (this.store.surveys.some((s) => s.sessionId === a.sessionId)) {
      throw new DomainStateError(`UNIQUE constraint failed: session ${a.sessionId} is already rated`);
    }
    this.store.surveys.push({
      sessionId: a.sessionId,
      focusRating: a.focusRating,
      comprehensionRating: a.comprehensionRating ?? null,
      difficultyRating: a.difficultyRating ?? null,
      note: trimmed === '' ? null : trimmed,
      deletedAtS: null,
    });
  }
}

export interface Repositories {
  subjects: SubjectRepository;
  sessions: SessionRepository;
  surveys: SurveyRepository;
  interruptions: InterruptionRepository;
}

export function createFixtureRepositories(now: () => Date = () => new Date()): Repositories & {
  store: FixtureStore;
} {
  const store = emptyStore();
  return {
    store,
    subjects: new FixtureSubjectRepository(store, now),
    sessions: new FixtureSessionRepository(store, now),
    surveys: new FixtureSurveyRepository(store),
    interruptions: new FixtureInterruptionRepository(store),
  };
}
