import { contextBridge } from 'electron';

/**
 * THE REVIEWABLE SURFACE.
 *
 * Everything the renderer can do lives in this one file, enumerated by hand.
 * There is deliberately no generic `invoke(name, args)`: a dispatcher would let
 * a compromised renderer reach anything registered in the main process, and it
 * would make the privacy surface impossible to review at a glance
 * (plan P31B, decision B2).
 *
 * Task 4 fills this with the ten allowlisted operations, each pinned by a
 * surface test that fails when an eleventh appears.
 */
const api = {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
} as const;

export type NerdyApi = typeof api;

contextBridge.exposeInMainWorld('nerdy', api);
