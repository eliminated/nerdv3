import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/mock/mock_data.dart';
import '../../../core/providers.dart';
import '../../../core/shell/mock_stamp.dart';
import '../../../core/theme/modernist.dart';
import 'session_controller.dart';

String formatDuration(Duration d) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.inHours)}:${two(d.inMinutes % 60)}:${two(d.inSeconds % 60)}';
}

/// The in-session screen, in the design's focus-bar arrangement: large
/// tabular timer, subject line, actions. Elapsed time always comes from
/// timestamps; the ticker only repaints (architecture.md §3.4).
class FocusBarScreen extends ConsumerStatefulWidget {
  const FocusBarScreen({super.key, required this.subjectName});

  final String subjectName;

  @override
  ConsumerState<FocusBarScreen> createState() => _FocusBarScreenState();
}

class _FocusBarScreenState extends ConsumerState<FocusBarScreen> {
  late final Timer _ticker;

  /// Created once: the ticker rebuilds this widget every second, and building a
  /// fresh drift stream per rebuild would leak a subscription each time.
  Stream<int>? _selfReports;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider);
    if (session == null) {
      return const Scaffold(body: Center(child: Text('No active session')));
    }
    final now = DateTime.now().toUtc();
    final elapsed = session.elapsed(now);
    final isFocus = session.mode == 'focused';
    _selfReports ??= ref
        .read(interruptionRepositoryProvider)
        .watchSelfReportCount(session.id);

    return Scaffold(
      body: Column(
        children: [
          Expanded(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 900),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 40),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Container(width: 11, height: 11, color: naAccent),
                        const SizedBox(width: 10),
                        Text(widget.subjectName.toUpperCase(),
                            style: kickerStyle.copyWith(fontSize: 11)),
                        const SizedBox(width: 10),
                        if (isFocus)
                          Container(
                            color: naAccent,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 7, vertical: 2),
                            child: Text('FOCUS',
                                style: kickerStyle.copyWith(
                                    color: naGround, fontSize: 9)),
                          ),
                        if (session.isPaused) ...[
                          const SizedBox(width: 10),
                          Container(
                            color: naInk,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 7, vertical: 2),
                            child: Text('PAUSED',
                                style: kickerStyle.copyWith(
                                    color: naGround, fontSize: 9)),
                          ),
                        ],
                      ]),
                      const SizedBox(height: 18),
                      Text(
                        formatDuration(elapsed),
                        key: const Key('focus-timer'),
                        style: headingStyle(96).copyWith(
                            letterSpacing: -2,
                            fontFeatures: const [FontFeature.tabularFigures()]),
                      ),
                      const SizedBox(height: 10),
                      Container(height: 2, color: naInk),
                      const SizedBox(height: 6),
                      Text(
                        'Paused so far ${formatDuration(session.totalPaused(now))}',
                        style: TextStyle(fontSize: 11.5, color: naFaint(.5)),
                      ),
                      const SizedBox(height: 28),
                      // Wrap, not Row: the action set must survive a narrow
                      // window without clipping a control.
                      Wrap(
                          spacing: 12,
                          runSpacing: 10,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                        OutlinedButton(
                          onPressed: () => ref
                              .read(sessionControllerProvider.notifier)
                              .togglePause(),
                          child:
                              Text(session.isPaused ? 'Resume' : 'Pause'),
                        ),
                        FilledButton(
                          onPressed: () async {
                            await ref
                                .read(sessionControllerProvider.notifier)
                                .end();
                            if (context.mounted) {
                              Navigator.of(context).pop();
                            }
                          },
                          child: const Text('End session'),
                        ),
                        // One tap, no chooser and no free text: the log records
                        // that a distraction happened, never what it was
                        // (data-model.md §3.6). R3's desktop mitigation.
                        OutlinedButton(
                          key: const Key('self-report'),
                          onPressed: () => ref
                              .read(interruptionRepositoryProvider)
                              .logSelfReport(
                                  sessionId: session.id,
                                  occurredAt: DateTime.now().toUtc()),
                          child: const Text('I got distracted'),
                        ),
                        StreamBuilder<int>(
                          stream: _selfReports,
                          builder: (context, snap) {
                            final n = snap.data ?? 0;
                            return Text(n == 0 ? '' : 'logged ×$n',
                                key: const Key('self-report-count'),
                                style: TextStyle(
                                    fontSize: 11.5, color: naFaint(.5)));
                          },
                        ),
                      ]),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 18),
            child: MockStamp(
              label: 'planned · phase 3',
              child: Wrap(
                spacing: 14,
                runSpacing: 6,
                children: [
                  const Text('Held back so far:',
                      style: TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w600)),
                  for (final m in mockHeldBack)
                    Text('${m.kind} · ${m.count}',
                        style: TextStyle(fontSize: 12, color: naFaint(.6))),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
