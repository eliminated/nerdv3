import type {
  ActiveSessionSnapshot,
  HistoryEntry,
  SessionDetailView,
  SubjectRow,
} from '@nerdyapp/core';

import { channelName, type Channel, type IpcResult } from '../shared/ipc.js';

export type Invoke = (channel: string, ...args: unknown[]) => Promise<IpcResult<unknown>>;

/**
 * An error carrying the `kind` the class would have had, since structured clone
 * collapses subclasses (decision B6). The renderer catches this and can still
 * distinguish `ValidationError` from `DomainStateError`.
 */
export class IpcError extends Error {
  constructor(
    override readonly message: string,
    readonly kind: string,
  ) {
    super(message);
    this.name = 'IpcError';
  }
}

/**
 * The preload surface, built as a plain object so it is testable without an
 * Electron runtime — `ipc-surface.test.ts` asserts its keys are exactly the
 * allowlist. Enumerated by hand: no generic dispatcher (decision B2).
 */
export function createApi(invoke: Invoke) {
  const call = async <T>(channel: Channel, ...args: unknown[]): Promise<T> => {
    const r = (await invoke(channelName(channel), ...args)) as IpcResult<T>;
    if (!r.ok) throw new IpcError(r.message, r.kind);
    return r.value;
  };

  return {
    listSubjects: (): Promise<SubjectRow[]> => call('listSubjects'),
    createSubject: (name: string): Promise<string> => call('createSubject', name),

    getActiveSession: (): Promise<ActiveSessionSnapshot | null> => call('getActiveSession'),
    startSession: (subjectId: string, mode?: 'plain' | 'focused'): Promise<ActiveSessionSnapshot> =>
      call('startSession', subjectId, mode ?? 'plain'),
    togglePause: (): Promise<ActiveSessionSnapshot | null> => call('togglePause'),
    endSession: (): Promise<void> => call('endSession'),
    /** No argument, deliberately: THAT a distraction happened, never by what. */
    logSelfReport: (): Promise<void> => call('logSelfReport'),

    listHistory: (): Promise<HistoryEntry[]> => call('listHistory'),
    loadSessionDetail: (sessionId: string): Promise<SessionDetailView> =>
      call('loadSessionDetail', sessionId),
  };
}

export type NerdyApi = ReturnType<typeof createApi>;
