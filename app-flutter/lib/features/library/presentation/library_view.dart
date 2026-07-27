import 'package:flutter/material.dart';

import '../../../core/mock/mock_data.dart';
import '../../../core/shell/mock_stamp.dart';
import '../../../core/theme/modernist.dart';

/// Entirely mock — material attachments are outside the v1.0 roadmap
/// (spec §9, U7).
class LibraryView extends StatelessWidget {
  const LibraryView({super.key});

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
                Text('Library', style: headingStyle(34)),
                const SizedBox(height: 4),
                Text(
                    'Material attached to a subject would open automatically when its session starts.',
                    style: TextStyle(fontSize: 13, color: naFaint(.55))),
              ],
            ),
          ),
          const SizedBox(height: 22),
          MockStamp(
            label: 'planned · post-1.0',
            child: Column(
              children: [
                Container(
                  decoration:
                      BoxDecoration(border: Border(bottom: naDivider2)),
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(children: [
                    Expanded(
                        flex: 3,
                        child: Text('NAME',
                            style: kickerStyle.copyWith(
                                fontSize: 9, color: naFaint(.55)))),
                    Expanded(
                        flex: 2,
                        child: Text('SUBJECT',
                            style: kickerStyle.copyWith(
                                fontSize: 9, color: naFaint(.55)))),
                    Expanded(
                        child: Text('TYPE',
                            style: kickerStyle.copyWith(
                                fontSize: 9, color: naFaint(.55)))),
                    Expanded(
                        child: Text('OPENS WITH',
                            style: kickerStyle.copyWith(
                                fontSize: 9, color: naFaint(.55)))),
                  ]),
                ),
                for (final l in mockLibraryRows)
                  Container(
                    decoration: BoxDecoration(border: Border(top: naDivider1)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(children: [
                      Expanded(
                          flex: 3,
                          child: Text(l.name,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 13, fontWeight: FontWeight.w600))),
                      Expanded(
                          flex: 2,
                          child: Text(l.subject,
                              style: const TextStyle(fontSize: 12.5))),
                      Expanded(
                          child: Container(
                        alignment: Alignment.centerLeft,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 7, vertical: 2),
                          color: naSurface,
                          child: Text(l.type,
                              style: const TextStyle(fontSize: 10.5)),
                        ),
                      )),
                      Expanded(
                          child: Text(l.opens,
                              style: TextStyle(
                                  fontSize: 12, color: naFaint(.55)))),
                    ]),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
