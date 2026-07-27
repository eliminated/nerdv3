import 'package:flutter/material.dart';

import '../../../core/mock/mock_data.dart';
import '../../../core/shell/mock_stamp.dart';
import '../../../core/theme/modernist.dart';

/// Entirely mock until Phase 6 (goals & routines) and the gamification
/// decision (spec §9, U1).
class GoalsView extends StatelessWidget {
  const GoalsView({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(36, 30, 36, 60),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            decoration: BoxDecoration(border: Border(bottom: naDivider2)),
            padding: const EdgeInsets.only(bottom: 14),
            width: double.infinity,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Goals', style: headingStyle(34)),
                const SizedBox(height: 4),
                Text('Goals and routines land in Phase 6.',
                    style: TextStyle(fontSize: 13, color: naFaint(.55))),
              ],
            ),
          ),
          const SizedBox(height: 22),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 3,
                child: MockStamp(
                  label: 'planned · phase 6',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('WEEKLY TARGETS',
                          style: kickerStyle.copyWith(color: naFaint(.6))),
                      const SizedBox(height: 6),
                      for (final g in mockGoals)
                        Container(
                          decoration:
                              BoxDecoration(border: Border(top: naDivider1)),
                          padding: const EdgeInsets.symmetric(vertical: 11),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Expanded(
                                    child: Text(g.name,
                                        style: const TextStyle(
                                            fontSize: 13.5,
                                            fontWeight: FontWeight.w600))),
                                Text(g.line, style: headingStyle(13)),
                                const SizedBox(width: 12),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 7, vertical: 2),
                                  color: g.state == 'Behind'
                                      ? naAccent
                                      : naSurface,
                                  child: Text(g.state.toUpperCase(),
                                      style: kickerStyle.copyWith(
                                          fontSize: 8.5,
                                          color: g.state == 'Behind'
                                              ? naGround
                                              : naInk)),
                                ),
                              ]),
                              const SizedBox(height: 7),
                              Stack(children: [
                                Container(height: 7, color: naFaint(.12)),
                                FractionallySizedBox(
                                  widthFactor: g.progress.clamp(0, 1),
                                  child:
                                      Container(height: 7, color: naAccent),
                                ),
                              ]),
                            ],
                          ),
                        ),
                      const SizedBox(height: 22),
                      Text('MILESTONES',
                          style: kickerStyle.copyWith(color: naFaint(.6))),
                      const SizedBox(height: 6),
                      for (final m in mockMilestones)
                        Container(
                          decoration:
                              BoxDecoration(border: Border(top: naDivider1)),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: Row(children: [
                            Container(
                              width: 26,
                              height: 26,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                  border: Border.all(color: naInk)),
                              child: Text(m.mark, style: headingStyle(12)),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(m.name,
                                      style: const TextStyle(
                                          fontSize: 13.5,
                                          fontWeight: FontWeight.w600)),
                                  Text(m.desc,
                                      style: TextStyle(
                                          fontSize: 11.5,
                                          color: naFaint(.55))),
                                ],
                              ),
                            ),
                            Text(m.due,
                                style: TextStyle(
                                    fontSize: 12, color: naFaint(.55))),
                          ]),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 22),
              Expanded(
                flex: 2,
                child: MockStamp(
                  label: 'planned · gamification',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('BADGES',
                          style: kickerStyle.copyWith(color: naFaint(.6))),
                      const SizedBox(height: 8),
                      for (final b in mockBadges)
                        Container(
                          decoration:
                              BoxDecoration(border: Border(top: naDivider1)),
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(b.name, style: headingStyle(12.5)),
                              const SizedBox(height: 3),
                              Text(b.desc,
                                  style: TextStyle(
                                      fontSize: 10.5, color: naFaint(.6))),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
