import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/db/backup.dart';
import '../../../core/db/database.dart';
import '../../../core/providers.dart';
import '../../session/presentation/history_screen.dart';
import '../../session/presentation/session_controller.dart';
import '../../session/presentation/session_screen.dart';

final subjectsProvider = StreamProvider<List<Subject>>(
    (ref) => ref.watch(subjectRepositoryProvider).watchSubjects());

class SubjectListScreen extends ConsumerWidget {
  const SubjectListScreen({super.key});

  Future<void> _createSubject(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New subject'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Name'),
          onSubmitted: (v) => Navigator.of(context).pop(v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (name != null && name.trim().isNotEmpty) {
      await ref.read(subjectRepositoryProvider).createSubject(name.trim());
    }
  }

  Future<void> _startSession(
      BuildContext context, WidgetRef ref, String subjectId) async {
    await ref.read(sessionControllerProvider.notifier).start(subjectId);
    if (context.mounted) {
      await Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => const SessionScreen()));
    }
  }

  Future<void> _backup(BuildContext context, WidgetRef ref) async {
    final now = DateTime.now();
    final stamp = '${now.year}-${now.month.toString().padLeft(2, '0')}-'
        '${now.day.toString().padLeft(2, '0')}';
    final location = await getSaveLocation(
      suggestedName: 'nerdyapp-backup-$stamp.db',
      acceptedTypeGroups: const [
        XTypeGroup(label: 'SQLite database', extensions: ['db'])
      ],
    );
    if (location == null) return;
    try {
      await backupDatabase(ref.read(databaseProvider), location.path);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Backed up to ${location.path}')));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Backup failed: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subjects = ref.watch(subjectsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('NerdyApp'),
        actions: [
          IconButton(
            icon: const Icon(Icons.save_alt),
            tooltip: 'Back up database',
            onPressed: () => _backup(context, ref),
          ),
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: 'History',
            onPressed: () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const HistoryScreen())),
          ),
        ],
      ),
      body: subjects.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (list) => list.isEmpty
            ? const Center(child: Text('Create a subject to start studying'))
            : ListView.builder(
                itemCount: list.length,
                itemBuilder: (context, i) {
                  final subject = list[i];
                  return ListTile(
                    title: Text(subject.name),
                    trailing: const Icon(Icons.play_arrow),
                    onTap: () => _startSession(context, ref, subject.id),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _createSubject(context, ref),
        child: const Icon(Icons.add),
      ),
    );
  }
}
