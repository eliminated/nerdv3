import { ActiveSession, createFixtureRepositories, type Repositories } from '@nerdyapp/core';

/**
 * `nerdyapp-test.exe` — the demo/debug build.
 *
 * **Opens no database.** Nothing in this file touches the filesystem, which is
 * the property that makes the build safe to experiment in: every UX experiment
 * would otherwise write to the same real database the user's streak depends on
 * (V3 spec §5).
 *
 * The example data below is the natural home for what `mock_data.dart` held in
 * the Flutter app, and the honesty rule carries over: anything the fixtures show
 * that the product cannot yet do must stay visibly stamped in the UI. V3-C owns
 * that stamping when the real views land.
 */
export function createFixtureBinding(): { repositories: Repositories; close: () => void } {
  const repos = createFixtureRepositories();

  // Not fire-and-forget: a throwing seed previously left the store half
  // populated — three subjects, one ended session, no surveys — and became an
  // unhandled rejection, which Node turns into an uncaught exception. The demo
  // build showing a silently incomplete dataset is worse than it failing loudly.
  void seed(repos).catch((error: unknown) => {
    console.error('[nerdyapp-test] example data failed to load:', error);
  });

  return { repositories: repos, close: () => undefined };
}

async function seed(r: Repositories): Promise<void> {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const physics = await r.subjects.create({ name: 'Physics', color: '#EC3013', source: 'self' });
  const maths = await r.subjects.create({
    name: 'Further Maths',
    color: '#201E1D',
    source: 'course',
    sourceName: 'Example Course',
  });
  await r.subjects.create({ name: 'Retired Subject', source: 'self' });

  // Two ended sessions with surveys, and one interruption, so every read path
  // in the renderer has something to show.
  const cases: { id: string; subjectId: string; startedAgoDays: number; minutes: number; focus: number }[] = [
    { id: 'demo-1', subjectId: physics, startedAgoDays: 1, minutes: 50, focus: 4 },
    { id: 'demo-2', subjectId: maths, startedAgoDays: 2, minutes: 35, focus: 3 },
  ];

  for (const c of cases) {
    const startedAt = new Date(now - c.startedAgoDays * day);
    const endedAt = new Date(startedAt.getTime() + c.minutes * 60_000);
    const s = ActiveSession.start({ id: c.id, subjectId: c.subjectId, startedAt });
    await r.sessions.insertStarted(s);
    await r.sessions.end({
      id: s.id,
      endedAt,
      actualDurationMs: c.minutes * 60_000,
      totalPausedMs: 0,
    });
    await r.surveys.save({
      sessionId: s.id,
      focusRating: c.focus,
      comprehensionRating: c.focus,
      note: 'Example data — this build has no database.',
    });
  }

  await r.interruptions.logSelfReport({
    sessionId: 'demo-1',
    occurredAt: new Date(now - day + 10 * 60_000),
  });
}
