import 'package:flutter/material.dart';

import '../../../core/theme/modernist.dart';

/// Per-session mode chooser (design "Start-session prompt"). Returns
/// 'plain' | 'focused' | null (cancelled). Ultra renders as designed but is
/// disabled — Tier 1 is the v1.0 ceiling (masterplan decision 6), and the UI
/// never claims capability the app lacks (spec §1 decision 3).
class ModePromptDialog extends StatelessWidget {
  const ModePromptDialog({super.key, required this.subjectName});

  final String subjectName;

  Widget _row(
    BuildContext context, {
    required Key key,
    required String name,
    required String desc,
    String? plannedTag,
    VoidCallback? onTap,
  }) {
    final disabled = onTap == null;
    return InkWell(
      key: key,
      onTap: onTap,
      child: Opacity(
        opacity: disabled ? .45 : 1,
        child: Container(
          decoration: BoxDecoration(border: Border(top: naDivider1)),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 15),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                  width: 11,
                  height: 11,
                  margin: const EdgeInsets.only(top: 5),
                  color: disabled ? naFaint(.4) : naAccent),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Text(name, style: headingStyle(17)),
                      if (plannedTag != null) ...[
                        const SizedBox(width: 9),
                        Container(
                          color: naInk.withValues(alpha: .78),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 7, vertical: 2),
                          child: Text(plannedTag,
                              style: kickerStyle.copyWith(
                                  color: naGround, fontSize: 9)),
                        ),
                      ],
                    ]),
                    const SizedBox(height: 4),
                    Text(desc,
                        style: TextStyle(fontSize: 12.5, color: naFaint(.6))),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 18, 22, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('STARTING NOW',
                      style: kickerStyle.copyWith(color: naAccent)),
                  const SizedBox(height: 5),
                  Text(subjectName, style: headingStyle(22)),
                  const SizedBox(height: 4),
                  Text('How do you want to run it?',
                      style: TextStyle(fontSize: 12.5, color: naFaint(.6))),
                ],
              ),
            ),
            Container(height: 2, color: naInk),
            _row(
              context,
              key: const Key('mode-normal'),
              name: 'Normal',
              desc: 'A plain timed session. Pause and end freely.',
              onTap: () => Navigator.of(context).pop('plain'),
            ),
            _row(
              context,
              key: const Key('mode-focus'),
              name: 'Focus',
              desc:
                  'Distraction-reduced session view. The app stays quiet; escapes will be logged once Phase 3 lands.',
              onTap: () => Navigator.of(context).pop('focused'),
            ),
            _row(
              context,
              key: const Key('mode-ultra'),
              name: 'Ultra',
              desc:
                  'Hard lockdown is a post-1.0 experiment. Tier 1 (fullscreen + friction + logged escapes) ships first.',
              plannedTag: 'PLANNED',
              onTap: null,
            ),
            Container(height: 2, color: naInk),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 12, 22, 14),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                        'Asked every time — the mode is a choice per session, not a setting.',
                        style: TextStyle(fontSize: 11.5, color: naFaint(.5))),
                  ),
                  OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Not now'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
