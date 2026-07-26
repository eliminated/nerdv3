import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/mock/mock_data.dart';
import '../../../core/shell/mock_stamp.dart';
import '../../../core/theme/modernist.dart';
import '../../session/presentation/session_flow.dart';
import '../../subjects/presentation/subjects_view.dart';

class TodayView extends ConsumerStatefulWidget {
  const TodayView({super.key});

  @override
  ConsumerState<TodayView> createState() => _TodayViewState();
}

class _TodayViewState extends ConsumerState<TodayView> {
  String? _subjectId;

  static const _weekdays = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ];
  static const _months = [
    'January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'
  ];

  @override
  Widget build(BuildContext context) {
    final subjects = ref.watch(activeSubjectsProvider);
    final now = DateTime.now();
    final dateLine =
        '${_weekdays[now.weekday - 1]} · ${now.day} ${_months[now.month - 1]} ${now.year}';

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
                      Text(dateLine.toUpperCase(),
                          style: kickerStyle.copyWith(color: naAccent)),
                      const SizedBox(height: 6),
                      Text('What are you\nstudying today?',
                          style: headingStyle(38)),
                    ],
                  ),
                ),
                ConstrainedBox(
                  // MockStamp stretches to its parent's width; a Row offers
                  // unbounded width, so bound it here.
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: MockStamp(
                  label: 'planned · phases 4–5',
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (final s in mockStatStrip)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 6),
                          decoration: BoxDecoration(
                              border: Border(
                                  right: s == mockStatStrip.last
                                      ? BorderSide.none
                                      : naDivider1)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(s.label.toUpperCase(),
                                  style: kickerStyle.copyWith(
                                      fontSize: 9, color: naFaint(.55))),
                              Text.rich(TextSpan(
                                  text: s.value,
                                  style: headingStyle(22),
                                  children: [
                                    TextSpan(
                                        text: s.unit,
                                        style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w400))
                                  ])),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 26),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 3,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Real: start a session right now.
                    Container(
                      decoration: BoxDecoration(
                          border: Border.all(color: naInk, width: 2)),
                      padding: const EdgeInsets.all(22),
                      child: subjects.when(
                        loading: () =>
                            const Center(child: CircularProgressIndicator()),
                        error: (e, _) => Text('Error: $e'),
                        data: (list) {
                          if (list.isEmpty) {
                            return Text(
                                'Create a subject first — Subjects, in the sidebar.',
                                style: TextStyle(
                                    fontSize: 13, color: naFaint(.6)));
                          }
                          final selected = list.any((s) => s.id == _subjectId)
                              ? _subjectId
                              : list.first.id;
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('START A SESSION',
                                  style: kickerStyle.copyWith(
                                      color: naFaint(.6))),
                              const SizedBox(height: 12),
                              Row(children: [
                                Expanded(
                                  child: DropdownButtonFormField<String>(
                                    key: const Key('today-subject'),
                                    initialValue: selected,
                                    items: [
                                      for (final s in list)
                                        DropdownMenuItem(
                                            value: s.id, child: Text(s.name)),
                                    ],
                                    onChanged: (v) =>
                                        setState(() => _subjectId = v),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                FilledButton(
                                  onPressed: () {
                                    final subject = list
                                        .firstWhere((s) => s.id == selected);
                                    startSessionFlow(context, ref,
                                        subjectId: subject.id,
                                        subjectName: subject.name);
                                  },
                                  child: const Text('Start session…'),
                                ),
                              ]),
                              const SizedBox(height: 10),
                              Text(
                                  'You pick Normal or Focus when you start. Ultra is planned.',
                                  style: TextStyle(
                                      fontSize: 11.5, color: naFaint(.5))),
                            ],
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 22),
                    MockStamp(
                      label: 'planned · schedule',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('UP NEXT',
                              style:
                                  kickerStyle.copyWith(color: naFaint(.6))),
                          const SizedBox(height: 8),
                          Text(mockUpNext.title, style: headingStyle(18)),
                          const SizedBox(height: 3),
                          Text('${mockUpNext.kicker} · ${mockUpNext.meta}',
                              style: TextStyle(
                                  fontSize: 12, color: naFaint(.6))),
                          const SizedBox(height: 16),
                          for (final t in mockTodayRest)
                            Container(
                              decoration: BoxDecoration(
                                  border: Border(top: naDivider1)),
                              padding:
                                  const EdgeInsets.symmetric(vertical: 9),
                              child: Row(children: [
                                SizedBox(
                                    width: 104,
                                    child: Text(t.time,
                                        style: headingStyle(12))),
                                Expanded(
                                    child: Text(t.title,
                                        style:
                                            const TextStyle(fontSize: 13))),
                                Text(t.code,
                                    style: kickerStyle.copyWith(
                                        fontSize: 9, color: naFaint(.5))),
                                const SizedBox(width: 12),
                                Text(t.mode,
                                    style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600)),
                              ]),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 22),
              Expanded(
                flex: 2,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    MockStamp(
                      label: 'planned · gamification',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                              'LEVEL ${mockXp.level} — ${mockXp.levelName}'
                                  .toUpperCase(),
                              style: kickerStyle.copyWith(color: naAccent)),
                          const SizedBox(height: 10),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(mockXp.total, style: headingStyle(30)),
                              Text('TOTAL XP',
                                  style: kickerStyle.copyWith(
                                      fontSize: 9, color: naFaint(.55))),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Stack(children: [
                            Container(height: 7, color: naFaint(.12)),
                            FractionallySizedBox(
                              widthFactor: mockXp.progress,
                              child: Container(height: 7, color: naAccent),
                            ),
                          ]),
                          const SizedBox(height: 6),
                          Text(
                              '${mockXp.line} to Level ${mockXp.next}',
                              style: TextStyle(
                                  fontSize: 11.5, color: naFaint(.6))),
                          const SizedBox(height: 18),
                          Text('RECENTLY EARNED',
                              style: kickerStyle.copyWith(
                                  color: naFaint(.6))),
                          const SizedBox(height: 8),
                          for (final b in mockBadges.take(3))
                            Container(
                              decoration: BoxDecoration(
                                  border: Border(top: naDivider1)),
                              padding:
                                  const EdgeInsets.symmetric(vertical: 8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(b.name, style: headingStyle(12)),
                                  const SizedBox(height: 2),
                                  Text(b.desc,
                                      style: TextStyle(
                                          fontSize: 10.5,
                                          color: naFaint(.55))),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 22),
                    MockStamp(
                      label: 'planned · phase 3',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('HELD BACK WHILE YOU FOCUS',
                              style:
                                  kickerStyle.copyWith(color: naFaint(.6))),
                          const SizedBox(height: 8),
                          for (final m in mockHeldBack)
                            Container(
                              decoration: BoxDecoration(
                                  border: Border(top: naDivider1)),
                              padding:
                                  const EdgeInsets.symmetric(vertical: 7),
                              child: Row(children: [
                                Icon(Icons.notifications_off_outlined,
                                    size: 14, color: naFaint(.4)),
                                const SizedBox(width: 10),
                                Expanded(
                                    child: Text(m.kind,
                                        style:
                                            const TextStyle(fontSize: 12.5))),
                                Text('${m.count} held',
                                    style: TextStyle(
                                        fontSize: 11, color: naFaint(.45))),
                              ]),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
