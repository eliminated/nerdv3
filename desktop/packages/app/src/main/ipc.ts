import type { Repositories } from '@nerdyapp/core';

import { channelName, CHANNELS, type Channel, type IpcResult } from '../shared/ipc.js';
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

    listHistory: () => repos.sessions.listHistory(),
    loadSessionDetail: (sessionId) => repos.sessions.loadSessionDetail(String(sessionId)),
  };

  // Driven off CHANNELS rather than off `handlers`, so a handler that is not on
  // the allowlist is simply never registered — the list is the authority.
  for (const channel of CHANNELS) {
    const handler = handlers[channel];
    reg.on(channelName(channel), (...args: unknown[]) => settle(() => handler(...args)));
  }
}
