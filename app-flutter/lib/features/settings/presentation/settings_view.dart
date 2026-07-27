import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/db/backup.dart';
import '../../../core/mock/mock_data.dart';
import '../../../core/providers.dart';
import '../../../core/shell/mock_stamp.dart';
import '../../../core/theme/modernist.dart';

class SettingsView extends ConsumerWidget {
  const SettingsView({super.key});

  /// Real: the one-button backup shipped in slice 2, relocated here.
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

  Widget _section(String title, Widget child) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 28),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
              width: 170,
              child: Text(title.toUpperCase(),
                  style: kickerStyle.copyWith(color: naFaint(.6)))),
          Expanded(child: child),
        ],
      ),
    );
  }

  Widget _prefRows(List<MockPref> prefs) {
    return Column(children: [
      for (final p in prefs)
        Container(
          decoration: BoxDecoration(border: Border(top: naDivider1)),
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.name,
                      style: const TextStyle(
                          fontSize: 13.5, fontWeight: FontWeight.w600)),
                  Text(p.desc,
                      style: TextStyle(fontSize: 11.5, color: naFaint(.55))),
                ],
              ),
            ),
            Container(
              width: 34,
              height: 18,
              alignment:
                  p.on ? Alignment.centerRight : Alignment.centerLeft,
              color: p.on ? naAccent : naFaint(.25),
              padding: const EdgeInsets.all(2),
              child: Container(width: 14, height: 14, color: naGround),
            ),
          ]),
        ),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(36, 30, 36, 70),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            decoration: BoxDecoration(border: Border(bottom: naDivider2)),
            padding: const EdgeInsets.only(bottom: 14),
            margin: const EdgeInsets.only(bottom: 26),
            width: double.infinity,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Settings', style: headingStyle(34)),
                const SizedBox(height: 4),
                Text('Storage, data, and what focus enforcement will become.',
                    style: TextStyle(fontSize: 13, color: naFaint(.55))),
              ],
            ),
          ),
          _section(
            'Storage',
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Container(
                    decoration:
                        BoxDecoration(border: Border.all(color: naInk, width: 2)),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Local vault — active', style: headingStyle(15)),
                        const SizedBox(height: 6),
                        Text(
                            'Everything stays on this machine. Offline-first is the design, not a fallback. Use backups.',
                            style:
                                TextStyle(fontSize: 12.5, color: naFaint(.6))),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: MockStamp(
                    label: 'post-1.0',
                    child: Opacity(
                      opacity: .55,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Cloud account', style: headingStyle(15)),
                          const SizedBox(height: 6),
                          Text(
                              'Sync across machines. Decided post-1.0 from actual need (masterplan D4) — never on the critical path.',
                              style: TextStyle(
                                  fontSize: 12.5, color: naFaint(.6))),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          _section(
            'Data',
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  FilledButton(
                    onPressed: () => _backup(context, ref),
                    child: const Text('Back up database…'),
                  ),
                ]),
                const SizedBox(height: 12),
                MockStamp(
                  label: 'planned · phase 8',
                  child: Row(children: [
                    OutlinedButton(
                        onPressed: null,
                        child: const Text('Export all data (.json)')),
                    const SizedBox(width: 10),
                    OutlinedButton(
                        onPressed: null, child: const Text('Delete all data')),
                  ]),
                ),
              ],
            ),
          ),
          _section(
            'Focus mode',
            MockStamp(
              label: 'planned · phase 3',
              child: _prefRows(mockFocusPrefs),
            ),
          ),
          _section(
            'Ultra Focus',
            MockStamp(
              label: 'planned · post-1.0',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    decoration:
                        BoxDecoration(border: Border.all(color: naAccent, width: 2)),
                    padding: const EdgeInsets.all(14),
                    margin: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      'What ships first is Tier 1: fullscreen sessions, exit friction, and every escape logged. '
                      'Hard lockdown (input blocking) is a post-1.0 experiment, gated on evidence from the interruption log.',
                      style: TextStyle(fontSize: 12.5, color: naAccent700),
                    ),
                  ),
                  _prefRows(mockUltraPrefs),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
