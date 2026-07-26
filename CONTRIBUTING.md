# Contributing to NerdyApp

Thanks for your interest. Please open an issue before starting significant work so the
approach can be agreed first.

## Prerequisites

- Flutter **3.41.4** (stable) / Dart 3.11 — the version CI pins
- Visual Studio 2022 with the **Desktop development with C++** workload (Windows builds)

## Setup

```bash
cd app
flutter pub get
dart run build_runner build   # required: *.g.dart is gitignored by design
```

## Verify before pushing

```bash
cd app
flutter analyze
flutter test
flutter build windows
```

CI (`.github/workflows/ci.yml`) runs the same on `windows-latest`, plus a schema-drift
guard: it re-dumps the Drift schema and fails if `app/drift_schemas/` differs from what
is committed. If you intentionally changed the schema, re-run
`dart run drift_dev schema dump lib/core/db/database.dart drift_schemas/` and commit the
result — and read the migration law first (see below).

**Frozen snapshots never change.** An intentional schema change bumps `schemaVersion` and
adds a *new* `drift_schema_vN.json`; the existing snapshot files are immutable and CI
fails any branch that rewrites `drift_schema_v1.json`. A diff touching an existing
snapshot is an automatic review flag, no exceptions.

## Hard rules

- **`drift` and `drift_dev` are pinned to exactly `2.34.0`** — no caret. At 2.34.1+ the
  drift schema CLI fails to compile. Do not "upgrade" them.
- **Schema v1 is frozen. Pre-1.0 migrations are additive-only** (`docs/masterplan.md` §5):
  new tables and new nullable columns only. No renames, drops, type changes, or
  `NOT NULL` without a default.
- **Never `git add -A`.** Stage explicit paths.
- **Editing `README.md` requires a row in its README-changelog table** (bottom of the file).
- The domain layer (`app/lib/features/*/domain/`) imports neither Flutter nor Drift.
- Elapsed session time is computed from stored timestamps, never from tick counters.

## Workflow

- **Branching:** GitHub Flow — short-lived branches off `main` named `feat/...`, `fix/...`,
  `docs/...`; merged via **squash** PR once CI is green.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`,
  `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`.
- **Changelog:** user-visible changes add a bullet under `[Unreleased]` in `CHANGELOG.md`
  ([Keep a Changelog](https://keepachangelog.com/)).
- **Tests:** correctness-critical code (timer math, schema, migrations, streak/summary
  computation) is test-first. For every test, be able to name the change that would make
  it fail — a test that cannot fail is not a test.

## Code style

`flutter analyze` must be clean; formatting is `dart format` defaults. Feature-first
layout: `app/lib/features/<feature>/{domain,data,presentation}`, shared code in
`app/lib/core/`.
