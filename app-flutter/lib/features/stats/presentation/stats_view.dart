import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/mock/mock_data.dart';
import '../../../core/providers.dart';
import '../../../core/shell/mock_stamp.dart';
import '../../../core/theme/modernist.dart';
import '../../session/data/interruption_repository.dart';
import '../../session/data/session_repository.dart';
import '../../session/presentation/focus_bar.dart' show formatDuration;

final historyProvider = StreamProvider<List<HistoryEntry>>(
    (ref) => ref.watch(sessionRepositoryProvider).watchHistory());

/// Which history row is expanded, if any. A row expands in place rather than
/// pushing a route: a pushed full-window route would hide the sidebar, and
/// "shown in session detail" describes information, not a destination.
final expandedSessionProvider =
    NotifierProvider<ExpandedSession, String?>(ExpandedSession.new);

class ExpandedSession extends Notifier<String?> {
  @override
  String? build() => null;

  void toggle(String sessionId) =>
      state = state == sessionId ? null : sessionId;
}

String interruptionLabel(String kind) => switch (kind) {
      kindManualPause => 'Paused',
      kindSelfReported => 'Distraction',
      'app_switch' => 'Switched away',
      'exit_attempt' => 'Exit attempt',
      'idle_timeout' => 'Idle',
      'device_locked' => 'Screen locked',
      _ => kind,
    };

class StatsView extends ConsumerWidget {
  const StatsView({super.key});

  Widget _detail(BuildContext context, WidgetRef ref, String sessionId) {
    return FutureBuilder<SessionDetailView>(
      future: ref.read(sessionRepositoryProvider).loadSessionDetail(sessionId),
      builder: (context, snap) {
        final d = snap.data;
        if (d == null) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text('Loading…',
                style: TextStyle(fontSize: 12, color: naFaint(.5))),
          );
        }
        return Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
          color: naSurface,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('SURVEY', style: kickerStyle.copyWith(color: naFaint(.6))),
              const SizedBox(height: 6),
              if (!d.hasSurvey)
                // Never a zero: a 0 here would later read as a real bad rating.
                Text('No survey — this session cannot qualify a streak day.',
                    style: TextStyle(fontSize: 12.5, color: naFaint(.6)))
              else
                Wrap(spacing: 18, runSpacing: 4, children: [
                  Text('Focus ${d.focusRating}/5',
                      style: const TextStyle(
                          fontSize: 12.5, fontWeight: FontWeight.w600)),
                  if (d.comprehensionRating != null)
                    Text('Comprehension ${d.comprehensionRating}/5',
                        style: const TextStyle(fontSize: 12.5)),
                  if (d.difficultyRating != null)
                    Text('Difficulty ${d.difficultyRating}/5',
                        style: const TextStyle(fontSize: 12.5)),
                ]),
              if (d.note != null) ...[
                const SizedBox(height: 6),
                Text(d.note!,
                    style: TextStyle(
                        fontSize: 12.5,
                        color: naFaint(.75),
                        fontStyle: FontStyle.italic)),
              ],
              const SizedBox(height: 14),
              Text('INTERRUPTIONS',
                  style: kickerStyle.copyWith(color: naFaint(.6))),
              const SizedBox(height: 6),
              if (d.interruptions.isEmpty)
                Text('None logged.',
                    style: TextStyle(fontSize: 12.5, color: naFaint(.6)))
              else
                for (final i in d.interruptions)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 3),
                    child: Row(children: [
                      Container(width: 7, height: 7, color: naAccent),
                      const SizedBox(width: 10),
                      Expanded(
                          child: Text(interruptionLabel(i.kind),
                              style: const TextStyle(fontSize: 12.5))),
                      Text(
                        i.durationS == null
                            ? i.occurredAt.toLocal().toString().substring(11, 19)
                            : '${i.durationS}s',
                        style: TextStyle(fontSize: 11.5, color: naFaint(.55)),
                      ),
                    ]),
                  ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(historyProvider);
    final expanded = ref.watch(expandedSessionProvider);
    const maxHours = 6.0;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(36, 30, 36, 60),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            decoration: BoxDecoration(border: Border(bottom: naDivider2)),
            padding: const EdgeInsets.only(bottom: 14),
            width: double.infinity,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Stats & streaks', style: headingStyle(34)),
                const SizedBox(height: 4),
                Text(
                    'Sessions, surveys and interruptions are real — open a row '
                    'to see them. Streaks and aggregates arrive with Phase 5.',
                    style: TextStyle(fontSize: 13, color: naFaint(.55))),
              ],
            ),
          ),
          const SizedBox(height: 22),
          MockStamp(
            label: 'planned · phase 5',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  for (final s in mockStatsCells)
                    Expanded(
                      child: Container(
                        decoration: BoxDecoration(
                            border: Border(
                                right: s == mockStatsCells.last
                                    ? BorderSide.none
                                    : naDivider1)),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 4),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(s.label.toUpperCase(),
                                style: kickerStyle.copyWith(
                                    fontSize: 9, color: naFaint(.55))),
                            Text.rich(TextSpan(
                                text: s.value,
                                style: headingStyle(28),
                                children: [
                                  TextSpan(
                                      text: s.unit,
                                      style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w400))
                                ])),
                          ],
                        ),
                      ),
                    ),
                ]),
                const SizedBox(height: 26),
                Text('HOURS LOGGED — LAST 14 DAYS',
                    style: kickerStyle.copyWith(color: naFaint(.6))),
                const SizedBox(height: 12),
                SizedBox(
                  height: 140,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final c in mockChart) ...[
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              Container(
                                height: 120 * (c.hours / maxHours),
                                color: c.hours >= 4 ? naAccent : naInk,
                              ),
                              const SizedBox(height: 4),
                              Text(c.day,
                                  style: TextStyle(
                                      fontSize: 9, color: naFaint(.5))),
                            ],
                          ),
                        ),
                        const SizedBox(width: 6),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 26),
                Text('SPLIT BY SUBJECT — THIS MONTH',
                    style: kickerStyle.copyWith(color: naFaint(.6))),
                const SizedBox(height: 8),
                for (final r in mockSubjectSplit)
                  Container(
                    decoration: BoxDecoration(border: Border(top: naDivider1)),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(children: [
                      Expanded(
                          child: Text(r.name,
                              style: const TextStyle(
                                  fontSize: 13, fontWeight: FontWeight.w600))),
                      SizedBox(
                          width: 70,
                          child: Text('${r.hours}h',
                              style: const TextStyle(fontSize: 12.5))),
                      SizedBox(
                          width: 90,
                          child: Text('${r.count} sessions',
                              style: TextStyle(
                                  fontSize: 12, color: naFaint(.55)))),
                      Text('avg ${r.avg}',
                          style:
                              TextStyle(fontSize: 12, color: naFaint(.55))),
                    ]),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 30),
          Text('RECENT SESSIONS',
              style: kickerStyle.copyWith(color: naFaint(.6))),
          const SizedBox(height: 8),
          history.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Text('Error: $e'),
            data: (entries) => entries.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text('No sessions yet.',
                        style:
                            TextStyle(fontSize: 12.5, color: naFaint(.45))),
                  )
                : Column(
                    children: [
                      for (final e in entries)
                        Column(
                          children: [
                            InkWell(
                              key: Key('history-${e.sessionId}'),
                              onTap: () => ref
                                  .read(expandedSessionProvider.notifier)
                                  .toggle(e.sessionId),
                              child: Container(
                                decoration: BoxDecoration(
                                    border: Border(top: naDivider1)),
                                padding:
                                    const EdgeInsets.symmetric(vertical: 10),
                                child: Row(children: [
                                  Icon(
                                      expanded == e.sessionId
                                          ? Icons.expand_less
                                          : Icons.expand_more,
                                      size: 16,
                                      color: naFaint(.5)),
                                  const SizedBox(width: 8),
                                  Expanded(
                                      child: Text(e.subjectName,
                                          style: const TextStyle(
                                              fontSize: 13.5,
                                              fontWeight: FontWeight.w600))),
                                  Text(
                                    e.endReason == 'crashed'
                                        ? '${e.startedAt.toLocal()} · crashed'
                                        : e.startedAt.toLocal().toString(),
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: e.endReason == 'crashed'
                                            ? naAccent700
                                            : naFaint(.55)),
                                  ),
                                  const SizedBox(width: 18),
                                  Text(formatDuration(e.actualDuration),
                                      style: headingStyle(13)),
                                ]),
                              ),
                            ),
                            if (expanded == e.sessionId)
                              _detail(context, ref, e.sessionId),
                          ],
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
