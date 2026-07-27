/**
 * The operation is illegal for the current state of the data (Dart: StateError).
 * Example: surveying a session that crashed rather than ending normally.
 */
export class DomainStateError extends Error {
  override readonly name = 'DomainStateError';
}

/**
 * The argument is malformed or out of range (Dart: ArgumentError / RangeError).
 * Kept distinct from DomainStateError so a test asserting "this was refused"
 * cannot pass on the wrong refusal.
 */
export class ValidationError extends Error {
  override readonly name = 'ValidationError';
}
