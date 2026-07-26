import 'package:flutter/material.dart';

import '../theme/modernist.dart';

/// Wraps placeholder content. Every mock region in the app renders inside
/// one of these — the stamp is the honesty contract from the spec (§1):
/// the UI never presents unbuilt capability as real.
class MockStamp extends StatelessWidget {
  const MockStamp({super.key, required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      Container(
        width: double.infinity,
        decoration: BoxDecoration(
            border: Border.all(color: naInk.withValues(alpha: .25))),
        padding: const EdgeInsets.fromLTRB(14, 24, 14, 14),
        child: child,
      ),
      Positioned(
        top: 0,
        right: 0,
        child: Container(
          color: naInk.withValues(alpha: .78),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          child: Text(label.toUpperCase(),
              style: kickerStyle.copyWith(color: naGround, fontSize: 9)),
        ),
      ),
    ]);
  }
}
