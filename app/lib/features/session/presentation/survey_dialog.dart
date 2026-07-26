import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/modernist.dart';

/// What the dialog hands back to the flow. Null instead means "skipped".
class SurveyResult {
  const SurveyResult({
    required this.focusRating,
    this.comprehensionRating,
    this.difficultyRating,
    this.note,
  });

  final int focusRating;
  final int? comprehensionRating;
  final int? difficultyRating;
  final String? note;
}

/// Post-session survey (data-model.md §3.5): only `focus_rating` is mandatory,
/// dismissible in ONE interaction, two for the common path. A survey that feels
/// like homework gets skipped, and once skipped it stops being data.
///
/// The dialog owns no repository — it pops a [SurveyResult] and the flow writes
/// it, matching ModePromptDialog and SubjectsView.
class SurveyDialog extends StatefulWidget {
  const SurveyDialog({super.key});

  @override
  State<SurveyDialog> createState() => _SurveyDialogState();
}

class _SurveyDialogState extends State<SurveyDialog> {
  final TextEditingController _note = TextEditingController();
  final FocusNode _noteFocus = FocusNode();
  int? _focus;
  int? _comprehension;
  int? _difficulty;

  /// Defensive only: two taps inside one frame each call [_save]. Verified by
  /// probe that with the current route stack a second `pop` does not unwind the
  /// caller, so NO test constrains this latch — it is kept because a future
  /// caller (a survey shown from a deeper route) would make that reachable.
  bool _closing = false;

  // Not const: LogicalKeyboardKey overrides ==, so it cannot key a const map.
  static final Map<LogicalKeyboardKey, int> _digitKeys = {
    LogicalKeyboardKey.digit1: 1,
    LogicalKeyboardKey.digit2: 2,
    LogicalKeyboardKey.digit3: 3,
    LogicalKeyboardKey.digit4: 4,
    LogicalKeyboardKey.digit5: 5,
  };

  @override
  void dispose() {
    _note.dispose();
    _noteFocus.dispose();
    super.dispose();
  }

  void _save() {
    if (_closing || _focus == null) return;
    _closing = true;
    Navigator.of(context).pop(SurveyResult(
      focusRating: _focus!,
      comprehensionRating: _comprehension,
      difficultyRating: _difficulty,
      note: _note.text,
    ));
  }

  void _skip() {
    if (_closing) return;
    _closing = true;
    Navigator.of(context).pop();
  }

  /// Digits 1–5 rate, Enter saves, Escape skips — so the common path costs two
  /// keystrokes and no mouse journey. Ignored while the note has focus: raw key
  /// events still reach ancestor handlers while a text field is being typed in,
  /// so an ungated handler would let a '4' typed into the note silently set the
  /// mandatory rating.
  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    if (_noteFocus.hasFocus) return KeyEventResult.ignored;
    // Only act when no descendant control holds focus: otherwise Enter would
    // both activate the focused button (Skip) and run the shortcut here, so a
    // deliberate skip could save instead.
    if (!node.hasPrimaryFocus) return KeyEventResult.ignored;
    final digit = _digitKeys[event.logicalKey];
    if (digit != null) {
      setState(() => _focus = digit);
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.enter ||
        event.logicalKey == LogicalKeyboardKey.numpadEnter) {
      _save();
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.escape) {
      _skip();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  Widget _cells(int? selected, ValueChanged<int> onPick,
      {double size = 44, required String keyPrefix}) {
    return Row(
      children: [
        for (var i = 1; i <= 5; i++) ...[
          InkWell(
            key: Key('$keyPrefix-$i'),
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
                  style: headingStyle(size * .36)
                      .copyWith(color: selected == i ? naGround : naInk)),
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
    return Focus(
      autofocus: true,
      onKeyEvent: _onKey,
      child: Dialog(
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
                      Text('POST-SESSION',
                          style: kickerStyle.copyWith(color: naAccent)),
                      const SizedBox(height: 5),
                      Text('How did it go?', style: headingStyle(22)),
                      const SizedBox(height: 4),
                      Text('Press 1–5, then Enter. Escape skips.',
                          style:
                              TextStyle(fontSize: 12, color: naFaint(.5))),
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
                      _cells(_focus, (v) => setState(() => _focus = v),
                          keyPrefix: 'focus'),
                      const SizedBox(height: 18),
                      _label('Comprehension (optional)'),
                      _cells(_comprehension,
                          (v) => setState(() => _comprehension = v),
                          size: 34, keyPrefix: 'comprehension'),
                      const SizedBox(height: 18),
                      _label('Difficulty (optional)'),
                      _cells(_difficulty, (v) => setState(() => _difficulty = v),
                          size: 34, keyPrefix: 'difficulty'),
                      const SizedBox(height: 18),
                      TextField(
                        key: const Key('survey-note'),
                        controller: _note,
                        focusNode: _noteFocus,
                        decoration:
                            const InputDecoration(labelText: 'Note (optional)'),
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
                        child: Text(
                            'A day with no survey never qualifies for a streak.',
                            style:
                                TextStyle(fontSize: 11.5, color: naFaint(.5))),
                      ),
                      OutlinedButton(
                        onPressed: _skip,
                        child: const Text('Skip'),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: _focus == null ? null : _save,
                        child: const Text('Save'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
