import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/features/session/domain/active_session.dart';

void main() {
  final t0 = DateTime.utc(2026, 7, 26, 10);
  DateTime at(int minutes) => t0.add(Duration(minutes: minutes));
  ActiveSession started() =>
      ActiveSession.start(id: 'id', subjectId: 'subj', startedAt: t0);

  test('elapsed tracks wall clock while running', () {
    expect(started().elapsed(at(5)), const Duration(minutes: 5));
  });

  test('a pause/resume cycle is excluded from elapsed', () {
    final s = started().pause(at(10)).resume(at(15));
    expect(s.elapsed(at(20)), const Duration(minutes: 15));
    expect(s.totalPaused(at(20)), const Duration(minutes: 5));
  });

  test('elapsed freezes during an in-flight pause', () {
    final s = started().pause(at(10));
    expect(s.elapsed(at(25)), const Duration(minutes: 10));
    expect(s.totalPaused(at(25)), const Duration(minutes: 15));
  });

  test('multiple pause cycles accumulate', () {
    final s = started()
        .pause(at(10))
        .resume(at(12))
        .pause(at(20))
        .resume(at(25));
    expect(s.elapsed(at(30)), const Duration(minutes: 23));
    expect(s.totalPaused(at(30)), const Duration(minutes: 7));
  });

  test('pause while paused throws', () {
    expect(() => started().pause(at(1)).pause(at(2)), throwsStateError);
  });

  test('resume while running throws', () {
    expect(() => started().resume(at(1)), throwsStateError);
  });
}
