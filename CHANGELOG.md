# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are release versions (SemVer), within build iteration V3.

## [Unreleased]

### Added

- Flutter Windows app scaffold with pinned toolchain (drift 2.34.0, Riverpod 3.3.2).
- Drift schema v1: seven locked tables with enforced foreign keys, survey rating CHECK constraints, and partial indexes. Frozen at this merge; all later changes additive-only.
- Single local-user bootstrap (fixed UUIDv7, race-safe).
- Subjects: create and list.
- Study sessions: start, pause/resume, end — elapsed time computed from timestamps, persisted, with a session history list.
- CI on `windows-latest`: analyze, tests, and schema guards on every push.
- Schema-v1 verification harness (drift schema snapshot + verifier test with dropped-entity detection) and a CI dump-drift guard, both demonstrated able to fail.
- One-button database backup (`VACUUM INTO`) with a save-location picker.
- MIT license, CONTRIBUTING.md, and a masterplan-aligned README roadmap.
- Crash recovery: sessions left open by a crash are closed on next launch with `end_reason = 'crashed'` (excluded from future streak inputs) and shown in history marked crashed.
- Full subject management: colour, source and source name, edit, archive/unarchive with an archived view, and soft delete that preserves session history.

- The Modernist desktop shell: collapsible sidebar (Today, Schedule, Subjects, Goals, Stats & Streaks, Library, Settings), status bar, bundled Archivo typography, flat zero-radius design language. Unbuilt views render as clearly stamped mocks so the full proposed UX is walkable.
- Per-session mode prompt (Normal / Focus real and recorded; Ultra shown but disabled, marked planned) and a redesigned in-session focus screen.
- Post-session survey dialog (focus/comprehension/difficulty/note) — rendered and dismissible, marked "records in Phase 2"; persistence is Phase 2's exit criterion.

### Changed

- Pausing a session now persists immediately (previously only resume did), so crash recovery can close a session that died while paused at the exact pause moment.
- Ended sessions are immutable at the repository level: post-end writes are refused, and a racing pause can no longer resurrect an ended session in the UI.
- The placeholder UI (subject list → timer → history screens) is replaced by the shell; session history now lives under Stats & Streaks, database backup under Settings.
- Sessions record the mode chosen at start (`plain` or `focused`) instead of always `plain`.
