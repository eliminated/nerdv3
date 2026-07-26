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

  Future<void> start(String subjectId, {String mode = 'plain'}) async {
    if (state != null) throw StateError('a session is already running');
    final session = ActiveSession.start(
        id: newId(), subjectId: subjectId, startedAt: _now(), mode: mode);
    await ref.read(sessionRepositoryProvider).insertStartedSession(session);
    state = session;
  }

  Future<void> togglePause() async {
    final s = state;
    if (s == null) return;
    final next = s.isPaused ? s.resume(_now()) : s.pause(_now());
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
    // A racing togglePause() may have swapped in a new state object for the
    // same session; the row is ended either way, so clear by id, not identity.
    if (state?.id == s.id) state = null;
  }
}
