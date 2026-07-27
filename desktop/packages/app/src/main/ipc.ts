import { DomainStateError, type Repositories } from '@nerdyapp/core';

import { channelName, type Channel, type IpcResult } from '../shared/ipc.js';
import type { SessionController } from './session-controller.js';

/**
 * `ipcMain.handle`, injected rather than imported.
 *
 * That is what lets `ipc-surface.test.ts` assert the registered set without an
 * Electron runtime — the surface is only reviewable if it is checkable.
 */
export interface IpcRegistrar {
  on: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => void;
  repositories: Repositories;
  controller: SessionController;
  /**
   * Shows a save dialog and writes a snapshot, returning the chosen path or
   * null if cancelled. Injected because it needs Electron's dialog — and
   * because the TEST build has no database to back up, so it passes null and
   * the channel refuses.
   */
  backup: (() => Promise<string | null>) | null;
}

/**
 * Errors become VALUES here (plan P31B, decision B6). `kind` carries what the
 * error class would have, because structured clone does not preserve subclasses
 * and the renderer must still tell a bad rating from an ended session.
 */
async function settle<T>(work: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    const e = error as { name?: unknown; message?: unknown };
    return {
      ok: false,
      kind: typeof e.name === 'string' ? e.name : 'Error',
      message: typeof e.message === 'string' ? e.message : String(error),
    };
  }
}

export function registerIpc(reg: IpcRegistrar): void {
  const { repositories: repos, controller } = reg;

  const handlers: Record<Channel, (...args: unknown[]) => Promise<unknown>> = {
    listSubjects: () => repos.subjects.list(),
    createSubject: (name) => repos.subjects.create({ name: String(name) }),

    getActiveSession: () => Promise.resolve(controller.snapshot()),
    startSession: (subjectId, mode) =>
      controller.start(String(subjectId), mode === 'focused' ? 'focused' : 'plain'),
    togglePause: () => controller.togglePause(),
    endSession: () => controller.end(),
    // Takes no argument at all: the renderer may say THAT the user was
    // distracted, and has no way to say by what.
    logSelfReport: () => controller.logSelfReport(),

    backupDatabase: async () => {
      if (reg.backup === null) {
        throw new DomainStateError('this build has no database to back up');
      }
      return reg.backup();
    },

    listHistory: () => repos.sessions.listHistory(),
    loadSessionDetail: (sessionId) => repos.sessions.loadSessionDetail(String(sessionId)),
  };

  // Driven off `handlers`, NOT off CHANNELS.
  //
  // Iterating CHANNELS made the surface test unfalsifiable: `registered` was
  // then `CHANNELS.map(channelName)` by construction, so deleting a handler
  // left the test green and the channel merely threw "handler is not a
  // function" at runtime. Driving off the object means a missing handler is a
  // missing registration, which the test can actually see.
  //
  // `Record<Channel, …>` still makes an unlisted key a compile error, so the
  // allowlist remains the authority on what MAY exist.
  for (const channel of Object.keys(handlers) as Channel[]) {
    const handler = handlers[channel];
    reg.on(channelName(channel), (...args: unknown[]) => settle(() => handler(...args)));
  }
}
