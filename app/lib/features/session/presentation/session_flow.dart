import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'focus_bar.dart';
import 'mode_prompt.dart';
import 'session_controller.dart';
import 'survey_dialog.dart';

/// The one entry point for starting a study session from anywhere in the
/// shell: mode prompt → real session on the focus-bar screen → post-session
/// survey (spec §6).
Future<void> startSessionFlow(BuildContext context, WidgetRef ref,
    {required String subjectId, required String subjectName}) async {
  final mode = await showDialog<String>(
    context: context,
    builder: (_) => ModePromptDialog(subjectName: subjectName),
  );
  if (mode == null) return;
  await ref
      .read(sessionControllerProvider.notifier)
      .start(subjectId, mode: mode);
  if (!context.mounted) return;
  await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => FocusBarScreen(subjectName: subjectName)));
  if (!context.mounted) return;
  await showDialog<void>(
      context: context, builder: (_) => const SurveyDialog());
}
