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
 * PRIVACY, stated precisely — an earlier version of this comment overclaimed.
 * What holds is narrower and is the thing that matters: no channel can put app
 * identity into the INTERRUPTION LOG. `logSelfReport` takes no argument, no
 * channel forwards a caller-supplied `kind`, and `detail` is written by nothing.
 * That is the guarantee of data-model.md §3.6, and it crosses the process
 * boundary here for the first time.
 *
 * `createSubject` DOES accept free text — it is a subject name the user types —
 * so it is validated and bounded in core's `rules.ts` rather than trusted.
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
