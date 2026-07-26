import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/ids.dart';
import '../../../core/providers.dart';
import '../domain/active_session.dart';

final sessionControllerProvider =
    NotifierProvider<SessionController, ActiveSession?>(SessionController.new);

class SessionController extends Notifier<ActiveSession?> {
  @override
  ActiveSession? build() => null;

  DateTime _now() => DateTime.now().toUtc();

  /// Returns the new session's id so the caller can attach a post-session
  /// survey after [end] has cleared controller state.
  Future<String> start(String subjectId, {String mode = 'plain'}) async {
    if (state != null) throw StateError('a session is already running');
    final session = ActiveSession.start(
        id: newId(), subjectId: subjectId, startedAt: _now(), mode: mode);
    await ref.read(sessionRepositoryProvider).insertStartedSession(session);
    state = session;
    return session.id;
  }

  Future<void> togglePause() async {
    final s = state;
    if (s == null) return;
    final now = _now();
    final next = s.isPaused ? s.resume(now) : s.pause(now);
    // Written on pause AND resume: every state change is persisted
    // (architecture.md §3.4). On pause the accumulated value is unchanged
    // but updated_at advances, which is what makes crash recovery's
    // last-write bound exact for a session that dies while paused.
    await ref
        .read(sessionRepositoryProvider)
        .updatePausedDuration(next.id, next.accumulatedPause);
    // A racing end() may have closed the session while we awaited; its
    // guarded write already no-oped in the DB — don't resurrect it here.
    if (!identical(state, s)) return;
    state = next;
    if (s.isPaused) {
      // This transition CLOSED a pause, so the event is complete: log it once
      // with the pause's own timestamps. An interruption row is append-only,
      // so it is never written until its duration is known.
      await ref.read(interruptionRepositoryProvider).logPause(
          sessionId: s.id, pauseStartedAt: s.pauseStartedAt!, resumedAt: now);
    }
  }

  Future<void> end() async {
    final s = state;
    if (s == null) return;
    final now = _now();
    await ref.read(sessionRepositoryProvider).endSession(
          id: s.id,
          endedAt: now,
          actualDuration: s.elapsed(now),
          totalPaused: s.totalPaused(now),
        );
    // Whether an open pause still needs logging is decided from LIVE state,
    // never from the snapshot captured before the await: a resume that won the
    // race has already logged this pause while `s.isPaused` still reads true,
    // which would append a duplicate row for one pause (spec §4.2).
    final live = state;
    if (live == null || live.id != s.id) return;
    if (live.isPaused) {
      await ref.read(interruptionRepositoryProvider).logPause(
          sessionId: s.id,
          pauseStartedAt: live.pauseStartedAt!,
          resumedAt: now);
    }
    state = null;
  }
}
