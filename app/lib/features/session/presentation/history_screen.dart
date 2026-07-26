import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/session_repository.dart';
import 'session_screen.dart' show formatDuration;

final historyProvider = StreamProvider<List<HistoryEntry>>(
    (ref) => ref.watch(sessionRepositoryProvider).watchHistory());

class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(historyProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('History')),
      body: history.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (entries) => entries.isEmpty
            ? const Center(child: Text('No sessions yet'))
            : ListView.builder(
                itemCount: entries.length,
                itemBuilder: (context, i) {
                  final e = entries[i];
                  return ListTile(
                    title: Text(e.subjectName),
                    subtitle: Text(e.endReason == 'crashed'
                        ? '${e.startedAt.toLocal()} · crashed'
                        : e.startedAt.toLocal().toString()),
                    trailing: Text(formatDuration(e.actualDuration)),
                  );
                },
              ),
      ),
    );
  }
}
