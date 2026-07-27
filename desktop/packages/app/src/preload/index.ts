import { contextBridge, ipcRenderer } from 'electron';

import { createApi } from './api.js';

/**
 * The only place the renderer is handed anything.
 *
 * `contextIsolation` is on and `sandbox` is on, so this bridge is the entire
 * attack surface between a web page and the user's study database. The object
 * is built in `./api.ts`, which is plain and testable — `ipc-surface.test.ts`
 * asserts its keys are exactly the allowlist in `../shared/ipc.ts`.
 *
 * Note this file exposes no `ipcRenderer`, no `require`, and no generic invoke.
 */
contextBridge.exposeInMainWorld(
  'nerdy',
  createApi((channel, ...args) => ipcRenderer.invoke(channel, ...args)),
);
