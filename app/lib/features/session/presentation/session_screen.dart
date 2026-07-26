import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'session_controller.dart';

String formatDuration(Duration d) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.inHours)}:${two(d.inMinutes % 60)}:${two(d.inSeconds % 60)}';
}

class SessionScreen extends ConsumerStatefulWidget {
  const SessionScreen({super.key});

  @override
  ConsumerState<SessionScreen> createState() => _SessionScreenState();
}

class _SessionScreenState extends ConsumerState<SessionScreen> {
  late final Timer _ticker;

  @override
  void initState() {
    super.initState();
    // The ticker only repaints; elapsed time always comes from timestamps.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider);
    if (session == null) {
      return const Scaffold(body: Center(child: Text('No active session')));
    }
    final elapsed = session.elapsed(DateTime.now().toUtc());
    return Scaffold(
      appBar: AppBar(title: const Text('Study session')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(formatDuration(elapsed),
                style: Theme.of(context).textTheme.displayLarge),
            if (session.isPaused)
              const Padding(
                padding: EdgeInsets.all(8),
                child: Text('Paused'),
              ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                FilledButton.tonal(
                  onPressed: () =>
                      ref.read(sessionControllerProvider.notifier).togglePause(),
                  child: Text(session.isPaused ? 'Resume' : 'Pause'),
                ),
                const SizedBox(width: 16),
                FilledButton(
                  onPressed: () async {
                    await ref.read(sessionControllerProvider.notifier).end();
                    if (context.mounted) Navigator.of(context).pop();
                  },
                  child: const Text('End session'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
