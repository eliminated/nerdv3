/**
 * THE ALLOWLIST. Everything the renderer can ask the main process to do.
 *
 * There is deliberately no generic `invoke(name, args)` dispatcher (plan P31B,
 * decision B2): one would let a compromised renderer reach anything registered
 * in the main process, and it would make the privacy surface impossible to
 * review at a glance. Enumerating costs a few lines and puts every capability
 * in one file.
 *
 * Adding a capability means editing this list, which fails `ipc-surface.test.ts`
 * until the test is edited too — so it cannot happen quietly.
 *
 * NOTE what is absent and must stay absent: nothing here accepts free-form text
 * that could carry an application name or window title. The privacy line
 * (data-model.md §3.6) crosses the process boundary here for the first time.
 */
export const CHANNELS = [
  'backupDatabase',
  'createSubject',
  'endSession',
  'getActiveSession',
  'listHistory',
  'listSubjects',
  'loadSessionDetail',
  'logSelfReport',
  'startSession',
  'togglePause',
] as const;

export type Channel = (typeof CHANNELS)[number];

/** Prefixed so a channel can never collide with Electron's own. */
export const channelName = (c: Channel): string => `nerdy:${c}`;

/**
 * Errors cross the boundary as a VALUE, never as a thrown error (decision B6).
 *
 * Electron's IPC uses structured clone, which does not preserve error
 * subclasses — `DomainStateError` and `ValidationError` would both arrive as
 * plain `Error`, and the renderer could not tell "rating out of range" from
 * "that session already ended". The `kind` field carries what the class would
 * have.
 */
export type IpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly kind: string; readonly message: string };
