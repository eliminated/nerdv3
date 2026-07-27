import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'interaction_counter.dart';

/// The counter's own self-check. A silently-zero counter would make every
/// interaction-budget test vacuously green — V2's exact failure class — so this
/// runs first and must be kept green.
///
/// Note: `tester.enterText` dispatches NEITHER a pointer nor a key event (it
/// goes through the text-input platform channel), so keystrokes are probed with
/// `sendKeyEvent`.
void main() {
  testWidgets('the interaction counter observes taps and keystrokes',
      (tester) async {
    final counter = InteractionCounter()..attach();
    addTearDown(counter.detach);

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: TextButton(onPressed: () {}, child: const Text('x')),
        ),
      ),
    ));

    await tester.tap(find.text('x'));
    await tester.pump();
    await tester.tap(find.text('x'));
    await tester.pump();
    expect(counter.count, 2, reason: 'pointer-downs must be observed');

    await tester.sendKeyEvent(LogicalKeyboardKey.digit4);
    await tester.pump();
    expect(counter.count, 3, reason: 'key-downs must be observed');

    counter.reset();
    expect(counter.count, 0);
  });
}
