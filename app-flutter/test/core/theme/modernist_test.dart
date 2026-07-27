import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nerdyapp/core/theme/modernist.dart';

void main() {
  test('modernist theme carries the design tokens', () {
    final t = modernistTheme();
    expect(t.colorScheme.primary, const Color(0xFFEC3013));
    expect(t.scaffoldBackgroundColor, const Color(0xFFF3F2F2));
    expect(t.colorScheme.onSurface, const Color(0xFF201E1D));
    expect(t.textTheme.bodyMedium!.fontFamily, 'Archivo');
    // Zero radius everywhere — the design's signature rule.
    for (final radius in [
      (t.filledButtonTheme.style!.shape!.resolve({}) as RoundedRectangleBorder)
          .borderRadius,
      (t.outlinedButtonTheme.style!.shape!.resolve({})
              as RoundedRectangleBorder)
          .borderRadius,
      (t.dialogTheme.shape as RoundedRectangleBorder).borderRadius,
      (t.inputDecorationTheme.border as OutlineInputBorder).borderRadius,
    ]) {
      expect(radius, BorderRadius.zero);
    }
  });
}
