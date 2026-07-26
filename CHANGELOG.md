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
