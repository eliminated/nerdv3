import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/db/database.dart';
import '../../../core/mock/mock_data.dart';
import '../../../core/providers.dart';
import '../../../core/shell/mock_stamp.dart';
import '../../../core/theme/modernist.dart';
import '../../session/presentation/session_flow.dart';

final activeSubjectsProvider = StreamProvider<List<Subject>>(
    (ref) => ref.watch(subjectRepositoryProvider).watchSubjects());

final archivedSubjectsProvider = StreamProvider<List<Subject>>((ref) =>
    ref.watch(subjectRepositoryProvider).watchSubjects(archived: true));

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

const subjectSources = <String>['self', 'school', 'university', 'course'];

class SubjectsView extends ConsumerWidget {
  const SubjectsView({super.key});

  Future<void> _create(BuildContext context, WidgetRef ref) async {
    final draft = await showDialog<SubjectDraft>(
        context: context, builder: (context) => const SubjectDialog());
    if (draft == null) return;
    await ref.read(subjectRepositoryProvider).createSubject(
          draft.name,
          color: draft.color,
          source: draft.source,
          sourceName: draft.sourceName,
        );
  }

  Future<void> _edit(
      BuildContext context, WidgetRef ref, Subject subject) async {
    final draft = await showDialog<SubjectDraft>(
        context: context,
        builder: (context) => SubjectDialog(existing: subject));
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

  Widget _card(BuildContext context, WidgetRef ref, Subject subject, int i) {
    final extra = mockExtraFor(i);
    return Container(
      color: naGround,
      padding: const EdgeInsets.fromLTRB(18, 16, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                  width: 12,
                  height: 12,
                  margin: const EdgeInsets.only(top: 4),
                  color: subject.color == null
                      ? naFaint(.3)
                      : colorFromHex(subject.color!)),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(subject.name, style: headingStyle(17)),
                    if (subject.source != 'self')
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          subject.sourceName == null
                              ? subject.source
                              : '${subject.source} · ${subject.sourceName}',
                          style:
                              TextStyle(fontSize: 11.5, color: naFaint(.55)),
                        ),
                      ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert, size: 18),
                onSelected: (action) async {
                  switch (action) {
                    case 'edit':
                      await _edit(context, ref, subject);
                    case 'archive':
                      await ref
                          .read(subjectRepositoryProvider)
                          .setArchived(subject.id, archived: true);
                    case 'delete':
                      await _confirmDelete(context, ref, subject);
                  }
                },
                itemBuilder: (context) => const [
                  PopupMenuItem(value: 'edit', child: Text('Edit')),
                  PopupMenuItem(value: 'archive', child: Text('Archive')),
                  PopupMenuItem(value: 'delete', child: Text('Delete')),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Expanded(
            child: MockStamp(
            label: 'planned',
            child: SingleChildScrollView(
              child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(spacing: 5, runSpacing: 5, children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 7, vertical: 2),
                    decoration:
                        BoxDecoration(border: Border.all(color: naInk)),
                    child: Text(extra.level,
                        style: kickerStyle.copyWith(fontSize: 9)),
                  ),
                  for (final t in extra.topics)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 2),
                      color: naSurface,
                      child: Text(t, style: const TextStyle(fontSize: 10.5)),
                    ),
                ]),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Text('THIS WEEK',
                          overflow: TextOverflow.ellipsis,
                          style: kickerStyle.copyWith(
                              fontSize: 9, color: naFaint(.55))),
                    ),
                    Text(extra.hoursLine,
                        style: const TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w600)),
                  ],
                ),
                const SizedBox(height: 5),
                Stack(children: [
                  Container(height: 6, color: naFaint(.12)),
                  FractionallySizedBox(
                    widthFactor: extra.weekProgress.clamp(0, 1),
                    child: Container(height: 6, color: naAccent),
                  ),
                ]),
              ],
            ),
            ),
          ),
          ),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: () => startSessionFlow(context, ref,
                subjectId: subject.id, subjectName: subject.name),
            child: const Text('Start session…'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subjects = ref.watch(activeSubjectsProvider);
    final archived = ref.watch(archivedSubjectsProvider);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(36, 30, 36, 60),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            decoration: BoxDecoration(border: Border(bottom: naDivider2)),
            padding: const EdgeInsets.only(bottom: 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Subjects', style: headingStyle(34)),
                      const SizedBox(height: 4),
                      Text('Each subject keeps its history even when archived.',
                          style:
                              TextStyle(fontSize: 13, color: naFaint(.55))),
                    ],
                  ),
                ),
                FilledButton(
                  onPressed: () => _create(context, ref),
                  child: const Text('New subject'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          subjects.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Text('Error: $e'),
            data: (list) => GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 340,
                mainAxisExtent: 280,
                crossAxisSpacing: 1,
                mainAxisSpacing: 1,
              ),
              itemCount: list.length + 1,
              itemBuilder: (context, i) {
                if (i == list.length) {
                  return InkWell(
                    onTap: () => _create(context, ref),
                    child: Container(
                      color: naGround,
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.add, size: 22, color: naFaint(.5)),
                          const SizedBox(height: 8),
                          Text('Add a subject', style: headingStyle(14)),
                          const SizedBox(height: 3),
                          Text('Name, colour, source',
                              style: TextStyle(
                                  fontSize: 11.5, color: naFaint(.5))),
                        ],
                      ),
                    ),
                  );
                }
                return _card(context, ref, list[i], i);
              },
            ),
          ),
          const SizedBox(height: 34),
          Text('ARCHIVED', style: kickerStyle.copyWith(color: naFaint(.6))),
          const SizedBox(height: 10),
          archived.when(
            loading: () => const SizedBox.shrink(),
            error: (e, _) => Text('Error: $e'),
            data: (list) => list.isEmpty
                ? Text('Nothing archived.',
                    style: TextStyle(fontSize: 12.5, color: naFaint(.45)))
                : Column(
                    children: [
                      for (final s in list)
                        Container(
                          decoration:
                              BoxDecoration(border: Border(top: naDivider1)),
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          child: Row(
                            children: [
                              Container(
                                  width: 10,
                                  height: 10,
                                  color: s.color == null
                                      ? naFaint(.3)
                                      : colorFromHex(s.color!)),
                              const SizedBox(width: 12),
                              Expanded(
                                  child: Text(s.name,
                                      style: const TextStyle(
                                          fontSize: 13.5,
                                          fontWeight: FontWeight.w600))),
                              TextButton(
                                onPressed: () => ref
                                    .read(subjectRepositoryProvider)
                                    .setArchived(s.id, archived: false),
                                child: const Text('Restore'),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class SubjectDialog extends StatefulWidget {
  const SubjectDialog({super.key, this.existing});

  final Subject? existing;

  @override
  State<SubjectDialog> createState() => _SubjectDialogState();
}

class _SubjectDialogState extends State<SubjectDialog> {
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
                for (final hex in markerPalette)
                  GestureDetector(
                    onTap: () =>
                        setState(() => _color = _color == hex ? null : hex),
                    child: Container(
                      width: 28,
                      height: 28,
                      color: colorFromHex(hex),
                      child: _color == hex
                          ? const Icon(Icons.check, size: 16, color: naGround)
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
