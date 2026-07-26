import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/shell/mock_stamp.dart';

void main() {
  testWidgets('MockStamp labels its region', (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: MockStamp(label: 'planned · phase 5', child: Text('body')))));
    expect(find.text('PLANNED · PHASE 5'), findsOneWidget);
    expect(find.text('body'), findsOneWidget);
  });
}
