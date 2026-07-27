import 'package:flutter/material.dart';

/// Modernist tokens (design spec §3, docs/superpowers/specs/2026-07-26-ui-shell-design.md).
/// Single source for every colour, rule and radius decision — views must not
/// hard-code these.
const naGround = Color(0xFFF3F2F2);
const naInk = Color(0xFF201E1D);
const naAccent = Color(0xFFEC3013);
const naAccent700 = Color(0xFF9E2411);
const naSurface = Color(0xFFE9E7E6);

/// 2px rules divide major sections; 1px hairlines divide list rows.
const naDivider2 = BorderSide(color: naInk, width: 2);
BorderSide get naDivider1 =>
    BorderSide(color: naInk.withValues(alpha: .18), width: 1);

/// Muted ink for secondary copy.
Color naFaint([double alpha = .55]) => naInk.withValues(alpha: alpha);

/// The design's flat marker swatches (replaces the old Material palette).
const markerPalette = <String>[
  '#EC3013', '#E8A13A', '#E5CE4C', '#4C8A50',
  '#3E7BB0', '#5F5AA8', '#A4509B', '#7A6A5C',
];

const kickerStyle = TextStyle(
  fontFamily: 'Archivo',
  fontWeight: FontWeight.w800,
  fontSize: 10,
  letterSpacing: 1.4,
);

TextStyle headingStyle(double size) => TextStyle(
      fontFamily: 'Archivo',
      fontWeight: FontWeight.w800,
      fontSize: size,
      height: 1.1,
      color: naInk,
    );

ThemeData modernistTheme() {
  const zero = RoundedRectangleBorder(borderRadius: BorderRadius.zero);
  final base = ThemeData(
    useMaterial3: true,
    fontFamily: 'Archivo',
    colorScheme: ColorScheme.fromSeed(
      seedColor: naAccent,
      primary: naAccent,
      onPrimary: naGround,
      surface: naGround,
      onSurface: naInk,
    ),
    scaffoldBackgroundColor: naGround,
  );
  // Design rule: button labels sit flush left, never centered.
  ButtonStyle flushLeft(ButtonStyle s) => s.copyWith(
        shape: const WidgetStatePropertyAll(zero),
        alignment: Alignment.centerLeft,
        textStyle: const WidgetStatePropertyAll(TextStyle(
            fontFamily: 'Archivo',
            fontWeight: FontWeight.w600,
            fontSize: 13.5)),
      );
  return base.copyWith(
    filledButtonTheme: FilledButtonThemeData(
        style: flushLeft(FilledButton.styleFrom(
            backgroundColor: naAccent, foregroundColor: naGround))),
    outlinedButtonTheme: OutlinedButtonThemeData(
        style: flushLeft(OutlinedButton.styleFrom(
            foregroundColor: naInk,
            side: const BorderSide(color: naInk, width: 1.5)))),
    textButtonTheme: TextButtonThemeData(
        style: flushLeft(TextButton.styleFrom(foregroundColor: naInk))),
    dialogTheme: const DialogThemeData(
        shape: zero, backgroundColor: naGround, surfaceTintColor: naGround),
    inputDecorationTheme: InputDecorationTheme(
      border: const OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: naInk, width: 1.5)),
      enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.zero, borderSide: naDivider1),
      focusedBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: naAccent, width: 2)),
      isDense: true,
    ),
    dividerTheme: DividerThemeData(
        color: naInk.withValues(alpha: .18), thickness: 1, space: 1),
    listTileTheme: const ListTileThemeData(shape: zero),
    snackBarTheme: const SnackBarThemeData(
        shape: zero,
        backgroundColor: naInk,
        behavior: SnackBarBehavior.floating),
    popupMenuTheme: const PopupMenuThemeData(
        shape: zero, color: naGround, surfaceTintColor: naGround),
  );
}
