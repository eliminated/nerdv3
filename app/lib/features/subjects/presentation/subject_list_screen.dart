import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/db/backup.dart';
import '../../../core/db/database.dart';
import '../../../core/providers.dart';
import '../../session/presentation/history_screen.dart';
import '../../session/presentation/session_controller.dart';
import '../../session/presentation/session_screen.dart';

const subjectPalette = <String>[
  '#EF5350', '#FFA726', '#FFD54F', '#66BB6A',
  '#4FC3F7', '#7986CB', '#BA68C8', '#A1887F',
];
const subjectSources = <String>['self', 'school', 'university', 'course'];

Color colorFromHex(String hex) =>
    Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));

class SubjectDraft {
  const SubjectDraft(
      {required this.name, this.color, required this.source, this.sourceName});

  final String name;
  final String? color;
  final String source;
  final String? sourceName;
}

// Riverpod 3 moved StateProvider to a legacy import; use the Notifier
// pattern already proven in SessionController instead.
final showArchivedProvider =
    NotifierProvider<ShowArchivedNotifier, bool>(ShowArchivedNotifier.new);

class ShowArchivedNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void toggle() => state = !state;
}

final subjectsProvider = StreamProvider<List<Subject>>((ref) => ref
    .watch(subjectRepositoryProvider)
    .watchSubjects(archived: ref.watch(showArchivedProvider)));

class SubjectListScreen extends ConsumerWidget {
  const SubjectListScreen({super.key});

  Future<void> _createSubject(BuildContext context, WidgetRef ref) async {
    final draft = await showDialog<SubjectDraft>(
      context: context,
      builder: (context) => const _SubjectDialog(),
    );
    if (draft == null) return;
    await ref.read(subjectRepositoryProvider).createSubject(
          draft.name,
          color: draft.color,
          source: draft.source,
          sourceName: draft.sourceName,
        );
  }

  Future<void> _editSubject(
      BuildContext context, WidgetRef ref, Subject subject) async {
    final draft = await showDialog<SubjectDraft>(
      context: context,
      builder: (context) => _SubjectDialog(existing: subject),
    );
    if (draft == null) return;
    await ref.read(subjectRepositoryProvider).updateSubject(
          subject.id,
          name: draft.name,
          color: draft.color,
          source: draft.source,
          sourceName: draft.sourceName,
        );
  }

  Future<void> _confirmDelete(
      BuildContext context, WidgetRef ref, Subject subject) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete ${subject.name}?'),
        content: const Text(
            'The subject leaves your lists. Past sessions keep its name.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed ?? false) {
      await ref.read(subjectRepositoryProvider).deleteSubject(subject.id);
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
    final showArchived = ref.watch(showArchivedProvider);
    final subjects = ref.watch(subjectsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('NerdyApp'),
        actions: [
          IconButton(
            icon: Icon(
                showArchived ? Icons.inventory_2 : Icons.inventory_2_outlined),
            tooltip: showArchived ? 'Show active' : 'Show archived',
            onPressed: () =>
                ref.read(showArchivedProvider.notifier).toggle(),
          ),
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
            ? Center(
                child: Text(showArchived
                    ? 'No archived subjects'
                    : 'Create a subject to start studying'))
            : ListView.builder(
                itemCount: list.length,
                itemBuilder: (context, i) {
                  final subject = list[i];
                  return ListTile(
                    leading: CircleAvatar(
                      radius: 14,
                      backgroundColor: subject.color == null
                          ? Theme.of(context)
                              .colorScheme
                              .surfaceContainerHighest
                          : colorFromHex(subject.color!),
                    ),
                    title: Text(subject.name),
                    subtitle: subject.source == 'self'
                        ? null
                        : Text(subject.sourceName == null
                            ? subject.source
                            : '${subject.source} · ${subject.sourceName}'),
                    onTap: showArchived
                        ? null
                        : () => _startSession(context, ref, subject.id),
                    trailing: PopupMenuButton<String>(
                      icon: const Icon(Icons.more_vert),
                      onSelected: (action) async {
                        switch (action) {
                          case 'edit':
                            await _editSubject(context, ref, subject);
                          case 'archive':
                            await ref
                                .read(subjectRepositoryProvider)
                                .setArchived(subject.id,
                                    archived: !subject.archived);
                          case 'delete':
                            await _confirmDelete(context, ref, subject);
                        }
                      },
                      itemBuilder: (context) => [
                        const PopupMenuItem(value: 'edit', child: Text('Edit')),
                        PopupMenuItem(
                            value: 'archive',
                            child: Text(
                                subject.archived ? 'Unarchive' : 'Archive')),
                        const PopupMenuItem(
                            value: 'delete', child: Text('Delete')),
                      ],
                    ),
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

class _SubjectDialog extends StatefulWidget {
  const _SubjectDialog({this.existing});

  final Subject? existing;

  @override
  State<_SubjectDialog> createState() => _SubjectDialogState();
}

class _SubjectDialogState extends State<_SubjectDialog> {
  late final TextEditingController _name =
      TextEditingController(text: widget.existing?.name ?? '');
  late final TextEditingController _sourceName =
      TextEditingController(text: widget.existing?.sourceName ?? '');
  late String? _color = widget.existing?.color;
  late String _source = widget.existing?.source ?? 'self';

  @override
  void dispose() {
    _name.dispose();
    _sourceName.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _name.text.trim();
    if (name.isEmpty) return;
    final sourceName = _sourceName.text.trim();
    Navigator.of(context).pop(SubjectDraft(
      name: name,
      color: _color,
      source: _source,
      sourceName: sourceName.isEmpty ? null : sourceName,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.existing == null ? 'New subject' : 'Edit subject'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _name,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Name'),
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              children: [
                for (final hex in subjectPalette)
                  GestureDetector(
                    onTap: () =>
                        setState(() => _color = _color == hex ? null : hex),
                    child: CircleAvatar(
                      radius: 14,
                      backgroundColor: colorFromHex(hex),
                      child: _color == hex
                          ? const Icon(Icons.check, size: 16)
                          : null,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _source,
              decoration: const InputDecoration(labelText: 'Source'),
              items: [
                for (final s in subjectSources)
                  DropdownMenuItem(value: s, child: Text(s)),
              ],
              onChanged: (v) => setState(() => _source = v ?? 'self'),
            ),
            TextField(
              controller: _sourceName,
              decoration:
                  const InputDecoration(labelText: 'Source name (e.g. Udemy)'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: Text(widget.existing == null ? 'Create' : 'Save'),
        ),
      ],
    );
  }
}
