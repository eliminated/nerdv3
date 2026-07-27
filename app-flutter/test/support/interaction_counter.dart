import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';

/// Counts user interactions mechanically (spec §4.6): pointer-downs seen by the
/// global router plus hardware key-downs.
///
/// A hand-counted budget test is just a restatement of its own taps. This sees
/// every event the binding dispatches — including inside a route pushed above a
/// wrapper — so a required interaction cannot hide from the count.
class InteractionCounter {
  int _count = 0;
  int get count => _count;

  void _onPointer(PointerEvent e) {
    if (e is PointerDownEvent) _count++;
  }

  bool _onKey(KeyEvent e) {
    if (e is KeyDownEvent) _count++;
    return false; // never swallow: the app must still receive the key
  }

  void attach() {
    GestureBinding.instance.pointerRouter.addGlobalRoute(_onPointer);
    HardwareKeyboard.instance.addHandler(_onKey);
  }

  void detach() {
    GestureBinding.instance.pointerRouter.removeGlobalRoute(_onPointer);
    HardwareKeyboard.instance.removeHandler(_onKey);
  }

  void reset() => _count = 0;
}
