import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/session/data/session_repository.dart';
import '../features/subjects/data/subject_repository.dart';
import 'db/database.dart';

/// Overridden in main() with the real database, and in tests with in-memory.
final databaseProvider = Provider<AppDatabase>(
  (ref) => throw UnimplementedError('databaseProvider must be overridden'),
);

final subjectRepositoryProvider = Provider<SubjectRepository>(
  (ref) => SubjectRepository(ref.watch(databaseProvider)),
);

final sessionRepositoryProvider = Provider<SessionRepository>(
  (ref) => SessionRepository(ref.watch(databaseProvider)),
);
