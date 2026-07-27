import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
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
  // Captured here because end() clears controller state before the survey is
  // answered — the survey must attach to THIS session, not the newest row.
  final sessionId = await ref
      .read(sessionControllerProvider.notifier)
      .start(subjectId, mode: mode);
  if (!context.mounted) return;
  await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => FocusBarScreen(subjectName: subjectName)));
  if (!context.mounted) return;
  // The route can also be popped by a system back gesture without the session
  // ending; surveying a still-running session would attach a rating to a row
  // that later recovers as 'crashed'.
  if (ref.read(sessionControllerProvider) != null) return;

  final result = await showDialog<SurveyResult>(
      context: context, builder: (_) => const SurveyDialog());
  if (result == null) return; // skipped: no row, by design
  try {
    await ref.read(surveyRepositoryProvider).saveSurvey(
          sessionId: sessionId,
          focusRating: result.focusRating,
          comprehensionRating: result.comprehensionRating,
          difficultyRating: result.difficultyRating,
          note: result.note,
        );
  } catch (e) {
    // Deliberately untyped: production opens the database with
    // NativeDatabase.createInBackground and surfaces DriftRemoteException,
    // while tests use NativeDatabase.memory() and see raw SqliteException — a
    // typed catch would pass the whole suite and red-screen the real app.
    // Both call sites of this function are fire-and-forget, so without this the
    // user would lose a rating silently.
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text("Couldn't save that rating — the session is unrated")));
    }
  }
}
