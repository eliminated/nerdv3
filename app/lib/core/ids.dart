import 'package:uuid/uuid.dart';

/// Fixed UUIDv7 for the single local user row (masterplan locked decision 4).
/// Constant so a future server sync can rely on it; never regenerate.
const String localUserId = '01920000-0000-7000-8000-000000000001';

const Uuid _uuid = Uuid();

String newId() => _uuid.v7();
