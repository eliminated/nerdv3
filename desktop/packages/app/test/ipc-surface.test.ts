import { expect, test } from 'vitest';

import { createFixtureRepositories } from '@nerdyapp/core';

import { registerIpc } from '../src/main/ipc.js';
import { createApi } from '../src/preload/api.js';
import { CHANNELS, channelName } from '../src/shared/ipc.js';
import { SessionController } from '../src/main/session-controller.js';

/**
 * The reviewable surface, pinned three ways.
 *
 * A capability can only reach the renderer if it appears in ALL THREE places —
 * the allowlist, a main-process handler, and the preload object. Asserting they
 * are the same set is what makes an accidental widening impossible: registering
 * a handler without exposing it leaves a reachable-but-undeclared channel, and
 * exposing without registering leaves a method that fails at runtime.
 */

test('the allowlist is exactly the operations this build supports', () => {
  // Hand-written, sorted. An eleventh capability fails here until someone
  // deliberately edits this list — in front of a reviewer.
  expect([...CHANNELS]).toEqual([
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
  ]);
});

test('main registers a handler for exactly the allowlisted channels', () => {
  const registered: string[] = [];
  const repos = createFixtureRepositories();
  registerIpc({
    on: (channel) => {
      registered.push(channel);
    },
    repositories: repos,
    controller: new SessionController(repos),
    backup: null,
  });
  expect(registered.sort()).toEqual(CHANNELS.map(channelName).sort());
});

test('the preload object exposes exactly the allowlisted operations', () => {
  const api = createApi(() => Promise.resolve({ ok: true, value: null }));
  expect(Object.keys(api).sort()).toEqual([...CHANNELS].sort());
});

test('no channel name accepts a free-text field that could carry app identity', async () => {
  // The privacy line crosses the process boundary here for the first time
  // (data-model.md §3.6). The renderer may say THAT the user was distracted;
  // it has no way to say by what — `logSelfReport` takes no argument at all,
  // and no channel forwards a caller-supplied `kind`.
  // Behavioural, not `Function.length`: a rest-parameter refactor
  // (`(...args) => call('logSelfReport', ...args)`) has length 0 and would have
  // left the previous version of this test green while forwarding anything.
  const seen: unknown[][] = [];
  const api = createApi((channel, ...args) => {
    seen.push([channel, ...args]);
    return Promise.resolve({ ok: true, value: null });
  });
  // Cast the FUNCTION, not the argument: the signature already takes none, and
  // the point is to prove that even a caller who forces one through cannot get
  // it forwarded.
  const forced: (...a: unknown[]) => Promise<void> = api.logSelfReport;
  await forced('app_switch_chrome');
  expect(seen[0], 'nothing may ride along with a self report').toEqual(['nerdy:logSelfReport']);
  expect(CHANNELS).not.toContain('logSessionEvent');
  expect(CHANNELS).not.toContain('logAppSwitch');
});

test('a rejected operation surfaces its kind, not a collapsed Error', () => {
  // Structured clone does not preserve error subclasses, so the renderer must
  // still be able to tell a validation failure from a state failure.
  const api = createApi(() =>
    Promise.resolve({ ok: false, kind: 'ValidationError', message: 'rating must be 1..5' }),
  );
  return expect(api.listSubjects()).rejects.toMatchObject({
    kind: 'ValidationError',
    message: 'rating must be 1..5',
  });
});
