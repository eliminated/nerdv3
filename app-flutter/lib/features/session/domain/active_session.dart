/// Pure-Dart session timing state machine (architecture.md §3.4).
/// Elapsed time is always computed from timestamps — never a tick counter.
class ActiveSession {
  const ActiveSession._({
    required this.id,
    required this.subjectId,
    required this.mode,
    required this.startedAt,
    required this.accumulatedPause,
    required this.pauseStartedAt,
  });

  factory ActiveSession.start({
    required String id,
    required String subjectId,
    required DateTime startedAt,
    String mode = 'plain',
  }) =>
      ActiveSession._(
        id: id,
        subjectId: subjectId,
        mode: mode,
        startedAt: startedAt,
        accumulatedPause: Duration.zero,
        pauseStartedAt: null,
      );

  final String id;
  final String subjectId;

  /// 'plain' | 'focused' — chosen at start, immutable for the session's life.
  final String mode;
  final DateTime startedAt;
  final Duration accumulatedPause;
  final DateTime? pauseStartedAt;

  bool get isPaused => pauseStartedAt != null;

  ActiveSession pause(DateTime now) {
    if (isPaused) throw StateError('already paused');
    return ActiveSession._(
      id: id,
      subjectId: subjectId,
      mode: mode,
      startedAt: startedAt,
      accumulatedPause: accumulatedPause,
      pauseStartedAt: now,
    );
  }

  ActiveSession resume(DateTime now) {
    if (!isPaused) throw StateError('not paused');
    return ActiveSession._(
      id: id,
      subjectId: subjectId,
      mode: mode,
      startedAt: startedAt,
      accumulatedPause: accumulatedPause + now.difference(pauseStartedAt!),
      pauseStartedAt: null,
    );
  }

  Duration totalPaused(DateTime now) =>
      accumulatedPause +
      (isPaused ? now.difference(pauseStartedAt!) : Duration.zero);

  Duration elapsed(DateTime now) => now.difference(startedAt) - totalPaused(now);
}
