import { DomainStateError } from '../errors.js';

/**
 * Turns SQLite constraint failures into the same typed errors the fixture
 * binding throws.
 *
 * Without this the two bindings disagree about error IDENTITY, and that
 * disagreement crosses the IPC boundary: `ipc.ts` puts `error.name` into
 * `IpcResult.kind`, and the renderer branches on it. A refusal that arrives as
 * `DomainStateError` when debugged on `nerdyapp-test.exe` arrives as a bare
 * `Error` from `nerdyapp.exe`, so a branch written against the test build
 * silently falls through in the product — which is exactly the
 * "teaches the wrong behaviour" failure the two-build design has to avoid.
 *
 * The message is preserved verbatim, because tests and users both key on the
 * constraint that actually failed.
 */
export function translateSqliteError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/constraint failed/i.test(message)) {
    throw new DomainStateError(message);
  }
  throw error;
}

/** Runs `work`, translating any constraint failure. */
export function withTranslatedErrors<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    return translateSqliteError(error);
  }
}
