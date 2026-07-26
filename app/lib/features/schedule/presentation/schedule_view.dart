import 'package:flutter/material.dart';

import '../../../core/mock/mock_data.dart';
import '../../../core/shell/mock_stamp.dart';
import '../../../core/theme/modernist.dart';

/// Entirely mock: a planned-session entity does not exist yet
/// (spec §9 deferred decision U3).
class ScheduleView extends StatelessWidget {
  const ScheduleView({super.key});

  static const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  static const _startHour = 8;
  static const _endHour = 22;
  static const _rowHeight = 34.0;

  @override
  Widget build(BuildContext context) {
    final gridHeight = (_endHour - _startHour) * _rowHeight;
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
                Text('Schedule', style: headingStyle(34)),
                const SizedBox(height: 4),
                Text(
                    'Planned sessions are a future entity — this view is a preview of the proposed UX.',
                    style: TextStyle(fontSize: 13, color: naFaint(.55))),
              ],
            ),
          ),
          const SizedBox(height: 22),
          MockStamp(
            label: 'planned · schedule entity',
            child: Column(
              children: [
                Row(children: [
                  const SizedBox(width: 44),
                  for (final d in _days)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(d.toUpperCase(),
                            style: kickerStyle.copyWith(
                                fontSize: 9, color: naFaint(.55))),
                      ),
                    ),
                ]),
                SizedBox(
                  height: gridHeight,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 44,
                        child: Column(
                          children: [
                            for (var h = _startHour; h < _endHour; h++)
                              SizedBox(
                                height: _rowHeight,
                                child: Align(
                                  alignment: Alignment.topRight,
                                  child: Padding(
                                    padding: const EdgeInsets.only(right: 8),
                                    child: Text('$h:00',
                                        style: TextStyle(
                                            fontSize: 9.5,
                                            color: naFaint(.45))),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      for (var day = 0; day < 7; day++)
                        Expanded(
                          child: Stack(
                            children: [
                              Column(
                                children: [
                                  for (var h = _startHour; h < _endHour; h++)
                                    Container(
                                      height: _rowHeight,
                                      decoration: BoxDecoration(
                                        border: Border(
                                            top: naDivider1,
                                            left: naDivider1),
                                      ),
                                    ),
                                ],
                              ),
                              for (final b in mockScheduleBlocks
                                  .where((b) => b.day == day))
                                Positioned(
                                  top: (b.startH - _startHour) * _rowHeight,
                                  left: 2,
                                  right: 2,
                                  height: b.hours * _rowHeight - 2,
                                  child: Container(
                                    padding: const EdgeInsets.all(5),
                                    color: b.mode == 'Ultra'
                                        ? naInk
                                        : b.mode == 'Focus'
                                            ? naAccent
                                            : naSurface,
                                    child: Text(
                                      b.title,
                                      overflow: TextOverflow.ellipsis,
                                      maxLines: 2,
                                      style: TextStyle(
                                        fontSize: 9.5,
                                        height: 1.15,
                                        fontWeight: FontWeight.w800,
                                        fontFamily: 'Archivo',
                                        color: b.mode == 'Normal'
                                            ? naInk
                                            : naGround,
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          ),
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
