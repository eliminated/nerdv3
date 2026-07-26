import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/goals/presentation/goals_view.dart';
import '../../features/library/presentation/library_view.dart';
import '../../features/schedule/presentation/schedule_view.dart';
import '../../features/settings/presentation/settings_view.dart';
import '../../features/stats/presentation/stats_view.dart';
import '../../features/subjects/presentation/subjects_view.dart';
import '../../features/today/presentation/today_view.dart';
import '../theme/modernist.dart';

final shellNavProvider =
    NotifierProvider<ShellNav, int>(ShellNav.new);

class ShellNav extends Notifier<int> {
  @override
  int build() => 0;

  void go(int index) => state = index;
}

final sidebarExpandedProvider =
    NotifierProvider<SidebarExpanded, bool>(SidebarExpanded.new);

class SidebarExpanded extends Notifier<bool> {
  @override
  bool build() => true;

  void toggle() => state = !state;
}

class _Destination {
  const _Destination(this.label, this.icon, this.view, {this.planned = false});

  final String label;
  final IconData icon;
  final Widget view;

  /// Marks views that are entirely stamped mocks — the sidebar shows a dot.
  final bool planned;
}

const _destinations = <_Destination>[
  _Destination('Today', Icons.wb_sunny_outlined, TodayView()),
  _Destination('Schedule', Icons.calendar_month_outlined, ScheduleView(),
      planned: true),
  _Destination('Subjects', Icons.menu_book_outlined, SubjectsView()),
  _Destination('Goals', Icons.track_changes_outlined, GoalsView(),
      planned: true),
  _Destination('Stats & Streaks', Icons.bar_chart_outlined, StatsView()),
  _Destination('Library', Icons.folder_open_outlined, LibraryView(),
      planned: true),
];

class AppShell extends ConsumerWidget {
  const AppShell({super.key});

  Widget _row(
    BuildContext context,
    WidgetRef ref, {
    required String label,
    required IconData icon,
    required bool active,
    required bool expanded,
    required VoidCallback onTap,
    bool planned = false,
  }) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: active ? naAccent.withValues(alpha: .1) : null,
          border: Border(
              left: BorderSide(
                  color: active ? naAccent : Colors.transparent, width: 3)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 17, color: active ? naAccent : naInk),
            if (planned)
              Container(
                  width: 5,
                  height: 5,
                  margin: const EdgeInsets.only(left: 2, bottom: 8),
                  color: naFaint(.35)),
            if (expanded) ...[
              SizedBox(width: planned ? 6 : 13),
              Expanded(
                child: Text(label,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 13.5, fontWeight: FontWeight.w600)),
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(shellNavProvider);
    final expanded = ref.watch(sidebarExpandedProvider);
    final settingsActive = index == _destinations.length;

    return Scaffold(
      body: Column(
        children: [
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: expanded ? 210 : 56,
                  decoration:
                      BoxDecoration(border: Border(right: naDivider2)),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      InkWell(
                        onTap: () =>
                            ref.read(sidebarExpandedProvider.notifier).toggle(),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 8),
                          child: Row(children: [
                            Container(
                                width: 13, height: 13, color: naAccent),
                            if (expanded) ...[
                              const SizedBox(width: 10),
                              Text('NERDYAPP',
                                  style: kickerStyle.copyWith(fontSize: 11)),
                            ],
                          ]),
                        ),
                      ),
                      const SizedBox(height: 10),
                      for (final (i, d) in _destinations.indexed)
                        _row(
                          context,
                          ref,
                          label: d.label,
                          icon: d.icon,
                          active: index == i,
                          expanded: expanded,
                          planned: d.planned,
                          onTap: () =>
                              ref.read(shellNavProvider.notifier).go(i),
                        ),
                      const Spacer(),
                      _row(
                        context,
                        ref,
                        label: 'Settings',
                        icon: Icons.tune,
                        active: settingsActive,
                        expanded: expanded,
                        onTap: () => ref
                            .read(shellNavProvider.notifier)
                            .go(_destinations.length),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: settingsActive
                      ? const SettingsView()
                      : _destinations[index].view,
                ),
              ],
            ),
          ),
          Container(
            height: 26,
            decoration: BoxDecoration(border: Border(top: naDivider2)),
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: [
                Text('Local vault · offline',
                    style: TextStyle(fontSize: 11, color: naFaint(.55))),
                const Spacer(),
                // Streak/XP in the status bar are gamification mocks.
                Text('23-day streak · 48,210 XP (MOCK)',
                    style: TextStyle(fontSize: 11, color: naFaint(.4))),
                const SizedBox(width: 18),
                Text('v0.1.0',
                    style: TextStyle(
                        fontSize: 11,
                        letterSpacing: .6,
                        color: naFaint(.55))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
