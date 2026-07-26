import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/db/database.dart';
import 'core/db/local_user.dart';
import 'core/providers.dart';
import 'features/subjects/presentation/subject_list_screen.dart';

Future<void> main() async {
  // Required before any provider reaches path_provider (V2-verified crash).
  WidgetsFlutterBinding.ensureInitialized();
  final db = AppDatabase(openConnection());
  await ensureLocalUser(db);
  runApp(ProviderScope(
    overrides: [databaseProvider.overrideWithValue(db)],
    child: const NerdyApp(),
  ));
}

class NerdyApp extends StatelessWidget {
  const NerdyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NerdyApp',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
      home: const SubjectListScreen(),
    );
  }
}
