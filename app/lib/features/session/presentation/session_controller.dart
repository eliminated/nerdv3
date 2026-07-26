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

  Future<void> start(String subjectId) async {
    if (state != null) throw StateError('a session is already running');
    final session = ActiveSession.start(
        id: newId(), subjectId: subjectId, startedAt: _now());
    await ref.read(sessionRepositoryProvider).insertStartedSession(session);
    state = session;
  }

  Future<void> togglePause() async {
    final s = state;
    if (s == null) return;
    if (s.isPaused) {
      final resumed = s.resume(_now());
      await ref
          .read(sessionRepositoryProvider)
          .updatePausedDuration(resumed.id, resumed.accumulatedPause);
      state = resumed;
    } else {
      state = s.pause(_now());
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
    state = null;
  }
}
