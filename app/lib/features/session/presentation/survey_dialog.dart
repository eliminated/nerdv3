import 'package:flutter/material.dart';

import '../../../core/theme/modernist.dart';

/// Post-session survey shell (spec §1 decision 4, data-model.md §3.5 rules):
/// focus rating required, everything else optional; dismissible in ONE
/// interaction (Skip), two for the common path (rating → Save).
///
/// This slice renders and discards — persistence is Phase 2's exit
/// criterion, and the stamp below says so on screen.
class SurveyDialog extends StatefulWidget {
  const SurveyDialog({super.key});

  @override
  State<SurveyDialog> createState() => _SurveyDialogState();
}

class _SurveyDialogState extends State<SurveyDialog> {
  int? _focus;
  int? _comprehension;
  int? _difficulty;

  Widget _cells(int? selected, ValueChanged<int> onPick, {double size = 44}) {
    return Row(
      children: [
        for (var i = 1; i <= 5; i++) ...[
          InkWell(
            onTap: () => onPick(i),
            child: Container(
              width: size,
              height: size,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected == i ? naAccent : null,
                border: Border.all(
                    color: selected == i ? naAccent : naInk, width: 1.5),
              ),
              child: Text('$i',
                  style: headingStyle(size * .36).copyWith(
                      color: selected == i ? naGround : naInk)),
            ),
          ),
          if (i < 5) const SizedBox(width: 7),
        ],
      ],
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 7),
        child: Text(text.toUpperCase(),
            style: kickerStyle.copyWith(color: naFaint(.6))),
      );

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(22, 18, 22, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('RECORDS IN PHASE 2',
                        style: kickerStyle.copyWith(color: naAccent)),
                    const SizedBox(height: 5),
                    Text('How did it go?', style: headingStyle(22)),
                  ],
                ),
              ),
              Container(height: 2, color: naInk),
              Padding(
                padding: const EdgeInsets.fromLTRB(22, 18, 22, 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _label('Focus — were you actually present?'),
                    _cells(_focus, (v) => setState(() => _focus = v)),
                    const SizedBox(height: 18),
                    _label('Comprehension (optional)'),
                    _cells(_comprehension,
                        (v) => setState(() => _comprehension = v),
                        size: 34),
                    const SizedBox(height: 18),
                    _label('Difficulty (optional)'),
                    _cells(_difficulty, (v) => setState(() => _difficulty = v),
                        size: 34),
                    const SizedBox(height: 18),
                    const TextField(
                      decoration:
                          InputDecoration(labelText: 'Note (optional)'),
                    ),
                    const SizedBox(height: 6),
                  ],
                ),
              ),
              Container(height: 2, color: naInk),
              Padding(
                padding: const EdgeInsets.fromLTRB(22, 12, 22, 14),
                child: Row(
                  children: [
                    Expanded(
                      child: Text('One tap to skip. Skipped days never qualify for streaks.',
                          style:
                              TextStyle(fontSize: 11.5, color: naFaint(.5))),
                    ),
                    OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Skip'),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: _focus == null
                          ? null
                          : () => Navigator.of(context).pop(),
                      child: const Text('Save'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
