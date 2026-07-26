# Session Handoff — NerdyApp Companion (build iteration V3)

> ## ⏩ LATEST (2026-07-26, "Modernist UI shell" session — same day, second slice) — READ THIS FIRST
>
> **State:** `main`, clean, in sync with `origin`. Last commit `3df3bad` ("feat: Modernist UI
> shell - walkable UX with stamped mocks (#4)", squash merge) on top of `a42b180` (phase-1
> remainder, merged earlier this same day — see PREVIOUS). CI green on branch and on main.
>
> **UI shell slice: DONE & merged (`3df3bad`).** Isaac supplied a proposed desktop design
> (`NerdyApp Study Companion Design.zip`, committed at repo root — the visual reference). After a
> brainstorm, five scope decisions were taken with him (recorded in
> `docs/superpowers/specs/2026-07-26-ui-shell-design.md`): (1) full shell now, unbuilt views as
> **clearly stamped mocks**; (2) gamification (XP/levels/badges) mocked, decision deferred (U1);
> (3) locked-out features (cloud sync, Ultra hard-lock) shown but stamped "planned" with honest
> Tier-1 copy; (4) the post-session survey — absent from the proposed design, a defect — designed
> IN (renders now, stamped "records in Phase 2"); (5) the shell **is** the app UI (no prototype
> branch). Shipped: Modernist theme (`core/theme/modernist.dart`, bundled Archivo OFL fonts, zero
> radius, accent #EC3013); collapsible sidebar shell (`core/shell/app_shell.dart`) with seven
> views; session flow re-dressed — mode prompt (Normal/Focus real and **recorded in
> `sessions.mode`**; Ultra visible but disabled) → focus-bar screen → survey dialog; subjects as
> card grid + archived table with Restore; history now lives in Stats; backup now lives in
> Settings. Old screens deleted. **Mock rule:** all placeholder content in
> `core/mock/mock_data.dart`, always rendered inside `MockStamp` — grep its imports for the mock
> inventory. **Zero schema changes; timer arithmetic untouched** (one additive change: `mode`
> threads ActiveSession → repository → controller, TDD'd). **Verified:** analyze clean, 48 tests
> green, Windows release build succeeds, CI green on main.
>
> **▶ DO THIS NEXT — Isaac's manual checks, then Phase 2:**
> 1. **UX walkthrough (spec §8):** walk all seven views + sidebar collapse; run a real Focus
>    session end-to-end (Today → Start → Focus → pause/resume → End → survey → Skip → appears in
>    Stats); subjects create/edit/archive/Restore/delete; Settings backup. Every mock region must
>    visibly carry a stamp. UX verdicts feed follow-up slices.
> 2. **Still owed — Phase 1 manual exit criteria** (see PREVIOUS block): crash-recovery kill test
>    (pause first; unpaused kill shows ~0 by design) and the one-hour wall-clock accuracy check.
> 3. **Phase 2 — the signal:** wire `SurveyDialog` to persistence (`session_surveys` exists in
>    v1), interruption log (`manual_pause` / `idle_timeout` / self-reported button), interruptions
>    in session detail. The survey UX is already built and tested — Phase 2 adds the writes, the
>    ≤2-interaction widget test, and the "detail never records app identity" test.
>
> **New deferred decisions recorded in the spec §9:** U1 gamification · U2 `subjects.code`/
> `weekly_target` columns · U3 planned-session entity (Schedule view) · U4 custom window chrome
> (`window_manager`, Phase 3) · U5 cloud UI · U6 Ultra tiering · U7 library · U8 "measured vs
> self-reported" copy stance (survey wins).
>
> **Process notes:** brainstorm → spec → plan → inline execution (hybrid; no dedicated review —
> presentation-layer slice, the one data change TDD'd). Gotchas hit: `MockStamp` stretches to
> parent width → crashes inside a `Row` (bound it with a `ConstrainedBox`); desktop-sized views
> need `tester.view.physicalSize = Size(1600, 1000)` in widget tests; text finders collide with
> mock content ("Focus" appears in mock lists — use `Key`s); the two local docs commits made on
> main pre-branch rode into the squash and rebased away cleanly afterwards (avoid: branch first,
> commit docs on the branch).
> ---
> ## ⏪ PREVIOUS (2026-07-26, phase-1 "core-loop correctness" session)
>
> **State:** `main`, clean, in sync with `origin`. Last commit `a42b180` ("feat: phase 1 remainder -
> core-loop correctness (#3)", squash merge) on top of `f483347` (slice 2). **Phase 1 code is
> complete and merged; two of its exit criteria are manual and still owed by Isaac (below).**
>
> **Phase 1 remainder — core-loop correctness: DONE & merged (`a42b180`).** Shipped, with zero
> schema changes (v1 stays frozen): **immutability enforced** — `updatePausedDuration`/`endSession`
> carry `AND ended_at IS NULL` guards, and a test replays every repository write path against an
> ended row asserting column-identical equality; **pause now persists immediately** (previously only
> resume wrote — architecture.md §3.4 law), advancing the `updated_at` liveness watermark so a
> crashed-while-paused session recovers *exactly*; **crash recovery** —
> `SessionRepository.recoverCrashedSessions()` (transactional, idempotent, called in `main()` before
> `runApp`) closes open sessions with `ended_at = last persisted write`,
> `actual_duration_s = max(0, (updated_at − started_at) − paused_duration_s)`,
> `end_reason = 'crashed'`; history labels crashed entries; **full subject CRUD** — colour palette,
> `source`/`source_name`, edit dialog, archive/unarchive with an archived view, soft delete (history
> joins keep the name); **real-clock smoke test** (~7 s through the real controller, real
> `DateTime.now()`) pinning the active/paused split to wall time. **Verified:** analyze clean, 40
> tests green locally, CI green on the branch AND on main post-merge; six guard/test probes seen RED
> before being trusted (red outputs tabulated in PR #3). Plan + review findings:
> `docs/superpowers/plans/2026-07-26-phase-1-core-loop.md`.
>
> **Process notes (phase 1):** Hybrid mode; the dedicated review (crash recovery + timer
> correctness) returned no Critical and three Important, all fixed pre-PR: (1) the smoke test's
> original upper bound sat exactly on the pause-folded-into-active regression value — the plan
> claimed coverage it didn't have (V2's "defect lives in the plan" again); widened the pause window,
> probed red. (2) Interleaved `end()`/`togglePause()` could resurrect controller state for an ended
> session (DB stayed correct) — fixed with post-await rechecks + a deterministic race test, probed
> red. (3) The plan's own manual checklist contradicted its design decision 1 — a never-paused
> crashed session recovers ~0 s *by design* (honest lower bound); checklist reworded.
>
> **▶ DO THIS NEXT — two things, in order:**
> 1. **Isaac's manual checks (Phase 1 exit criteria, cannot be delegated):** (a) crash-recovery
>    kill test — start, pause/resume, pause again, kill the process, relaunch → history shows
>    `· crashed` with duration ≈ active time before the last pause (an *unpaused* kill shows ~0 s —
>    by design, not a bug); (b) **one-hour wall-clock accuracy** — real 60-min session against a
>    stopwatch with ≥1 pause, recorded duration within 2 s; (c) subject CRUD smoke (create with
>    colour/source → edit → archive → unarchive → delete → history keeps the name). Record results
>    here. Phase 1 is not closed until (a)+(b) are recorded.
> 2. **Phase 2 — the signal (masterplan §7):** post-session survey (`focus_rating` required 1–5,
>    others optional; ≤2 interactions common path, dismissible in 1), `manual_pause` /
>    `idle_timeout` interruptions, the one-tap self-reported distraction button
>    (`kind='self_reported'` — TEXT column, no migration), interruptions in session detail. Exit
>    criteria in masterplan §7 Phase 2 — note the "detail never records app identity" test
>    (focus-enforcement.md §7). No schema changes needed; survey/interruptions tables exist in v1.
>
> **Backlog added this session:** once-a-minute liveness heartbeat (persist `totalPaused(now)` so
> the crashed-unpaused lower bound tightens — no tick counter, no schema change);
> `SessionController.start()` double-tap can insert two open sessions (pre-existing, self-heals via
> recovery as 'crashed').
>
> **Next-session execution:** **Hybrid** (Isaac's standing choice) — inline by default; dedicated
> independent review on the survey-interaction-count widget tests and interruption writes (the
> pieces streak correctness will later depend on).
> ---
> ## ⏪ PREVIOUS (2026-07-26, slice-2 "harden" session)
>
> **State:** `main`, clean, in sync with `origin`. Last commit `f483347` ("feat: slice 2 - harden
> (#2)", squash merge) on top of `2549650` (slice 1). **Slices 1–2 merged. The schema-v1 freeze is
> now ENFORCED by CI, not just declared.**
>
> **Slice 2 — harden: DONE & merged (`f483347`).** Shipped: CI on `windows-latest`
> (`.github/workflows/ci.yml` — one command per step, `build_runner` before analyze/test, 25 tests);
> schema verification harness (`app/drift_schemas/drift_schema_v1.json` + generated
> `app/test/generated/schema*.dart` + `app/test/core/db/schema_verification_test.dart`, which opens
> a FRESH db so `onCreate` runs live code and validates against the committed snapshot with
> `ValidationOptions(validateDropped: true)`); a CI dump-drift guard (re-dump → `git add
> --intent-to-add` → pathspec diff); a freeze-rewrite guard (`git diff --diff-filter=MD origin/main
> -- drift_schemas` — new snapshots allowed, rewrites/deletions fail); one-button backup
> (`app/lib/core/db/backup.dart`, `VACUUM INTO`, save dialog via `file_selector`); MIT LICENSE
> (Nicholas Jonathan Isaac), CONTRIBUTING.md, README roadmap rewritten to masterplan §7 (+ changelog
> row 1.3), masterplan §10 deviation rows, data-model §3.4 reworded to "immutable once ended",
> focus-enforcement §4 Windows notifications ⚠️. **Verified:** every guard was seen RED before
> being trusted (probe column/table/index for the verifier; probe dumps for the diff guards — all
> outputs in PR #2); CI green on the branch AND on main post-merge; Isaac ran the manual backup
> check — passed. Plan: `docs/superpowers/plans/2026-07-26-slice-2-harden.md`.
>
> **Process notes (slice 2):** Hybrid mode again; the dedicated review verified the harness against
> drift_dev source and found the **coordinated-regeneration escape** (edit tables + re-dump +
> regenerate → both original guards green) — closed by the freeze-rewrite CI step + a CONTRIBUTING
> rule. It also caught a deprecated-API usage that would have failed CI analyze. Separately, the
> freeze-rewrite guard's first CI run failed on its own bootstrap (a NEW snapshot is an Addition vs
> main) — fixed with `--diff-filter=MD`; the guard is live now that the snapshot is on main.
>
> **▶ DO THIS NEXT — Phase 1 remainder (core-loop correctness).** Masterplan §7 Phase 1 minus what
> slice 1 shipped: **crash recovery** (on launch, find sessions with `ended_at IS NULL`, write
> `end_reason = 'crashed'`; recovered sessions excluded from future streak inputs), **full subject
> CRUD** (colour, `source`/`source_name`, archive — `archived` leaves the active list but keeps
> history), **the immutability test** (no session field mutates after end except `ended_at`,
> `actual_duration_s`, `end_reason`), and the **wall-clock accuracy check** (a one-hour real session
> within 2 s — needs a human-run session or a clock-injected long test; see Phase 1 exit criteria).
> Timer rules in architecture.md §3.4 remain law. The existing seam: `ActiveSession`
> (domain), `SessionRepository` (data), `SessionController` (presentation), providers in
> `app/lib/core/providers.dart`. **Locked workflow:** plan → branch → implement (TDD) → verify with
> output seen → PR → squash merge → update this handoff.
>
> **Next-session execution:** **Hybrid** (Isaac's standing choice, confirmed twice) — inline by
> default; dedicated independent review on **crash recovery and timer-correctness** work, the
> correctness-critical core of Phase 1. Manual verification steps route to Isaac.
> ---
> ## ⏪ PREVIOUS (2026-07-26, slice-1 "usable study session" session)
>
> **State:** `main`, clean, in sync with `origin`. Last commit `2549650` ("feat: slice 1 - usable
> study session (#1)", squash merge of PR #1) on top of `ae37ff5`. **Slice 1 merged; schema v1 is
> now FROZEN — every schema change from here is additive-only (masterplan §5).**
>
> **Slice 1 — usable study session: DONE & merged (`2549650`).** The re-slicing decision was made
> with Isaac at session start: first merge is a *usable session*, not V2's ten-task foundation.
> Shipped: Flutter Windows app under `app/` (pinned `drift`/`drift_dev` exactly 2.34.0, Riverpod
> 3.3.2); Drift schema v1 in `app/lib/core/db/tables.dart` (7 tables, 9 enforced FKs, survey rating
> CHECKs, 6 indexes — partial per data-model.md §6); race-safe local-user bootstrap
> (`app/lib/core/db/local_user.dart`, fixed UUIDv7 in `app/lib/core/ids.dart`); subject create/list
> (`app/lib/features/subjects/`); pure-Dart `ActiveSession` timing state machine
> (`app/lib/features/session/domain/active_session.dart` — elapsed always computed from timestamps);
> session persistence + history join (`app/lib/features/session/data/session_repository.dart`); UI
> (subject list → timer screen with pause/resume/end → history). **Verified:** 22 tests green,
> `flutter analyze` clean, Windows release build succeeds, and Isaac ran the 6-step manual checklist
> at the keyboard — all passed, including persistence across restart. Plan (with design decisions
> and review findings): `docs/superpowers/plans/2026-07-26-slice-1-usable-session.md`.
>
> **Process notes (slice 1):** Hybrid mode ran as designed — inline execution, one dedicated
> independent review on the schema+bootstrap tasks. That review caught a **now-or-never plan
> defect**: the plan's own table listing had silently dropped data-model.md §3.5's
> `CHECK (rating BETWEEN 1 AND 5)` constraints, which SQLite cannot add after the freeze. Fixed
> in-schema before merge, plus a nine-FK freeze-guard test (`PRAGMA foreign_key_list`) it
> recommended. This is V2's "every defect was in the plan" lesson recurring — the review-in-
> proportion-to-risk bet paid for itself in one finding.
>
> **Slice 1 design deviations (recorded, owed masterplan §10 rows in the harden slice):**
> `sessions.goal_id` omitted from v1 (Phase 6 adds column+FK together via additive
> `ALTER TABLE ... REFERENCES`); `users.email`/`password_hash` NOT NULL with sentinel seeds
> (`local@device.invalid`, `''`); `email` is TEXT UNIQUE case-sensitive vs spec's CITEXT (decide
> `COLLATE NOCASE` vs app-layer when auth nears); data-model.md §3.4's immutability wording needs
> correcting to "immutable once ended" (pause bookkeeping writes `paused_duration_s`/`updated_at`
> while in progress).
>
> **▶ DO THIS NEXT — harden slice.** Scope, per the slice-1 plan's "Deferred" section:
> 1. **CI on `windows-latest`**: analyze + test on push. One command per step (pwsh exit-code
>    gotcha), and `dart run build_runner build` must precede analyze/test because `*.g.dart` is
>    gitignored (root `.gitignore` line 13, carried from V2 deliberately).
> 2. **Migration harness + schema-v1 verification test**, with `validateDropped: true` and the
>    `git add --intent-to-add` dump guard (both V2 holes). Guards must be *demonstrated* capable of
>    failing — break the schema locally, watch the guard go red, revert.
> 3. **One-button database backup** (copy to chosen folder; opens as valid SQLite).
> 4. **Docs hygiene**: rewrite README roadmap to match masterplan (+ README changelog row —
>    required), MIT `LICENSE`, `CONTRIBUTING.md`, correct focus-enforcement.md §4 (R1 ⚠️), add the
>    masterplan §10 rows for the deviations above.
> Then follow masterplan §7 from Phase 1's remainder (crash recovery, subject CRUD, session-field
> immutability test) onward. **Locked workflow:** agree scope → plan → branch → implement → verify
> (exit criteria run, output seen) → PR → squash merge → update this handoff.
>
> **Next-session execution (chosen this handoff):**
> - **Mode: Hybrid** — inline by default; dedicated independent review pass on the migration
>   harness and its guards (the slice's highest-risk work). No per-role subagent model table needed.
> ---
> ## ⏪ PREVIOUS (2026-07-25, V3 bootstrap session)
>
> **State:** `main`, clean, in sync with `origin`. Last commit `ae37ff5` ("Updated README") on top of
> `a60a867` ("docs: start build iteration V3 with the design carried forward"). Repository was
> **documentation only — no application code in V3 yet.**
>
> **What that session did.** Build iteration V2 was abandoned and V3 started fresh at
> `github.com/eliminated/nerdv3` (local `C:\Projects\nerdv3`). The four design documents, README,
> CHANGELOG, LICENSE, `.gitignore` and `CLAUDE.md` were carried across intact. The README's
> iteration-history table was filled in with honest V1 and V2 post-mortems, and `docs/masterplan.md`
> gained a **§1a V2 post-mortem** plus verified environment facts. Nothing was implemented.
>
> **Deliberately NOT carried over:** V2's Phase 0 implementation plan and the 16 brief/report
> process artifacts. Recoverable from `github.com/eliminated/nerdv2` if wanted.
>
> **Deliberately NOT created:** placeholder directories (V2 proved empty placeholders cause real
> problems).
>
> **Its "DO THIS NEXT" — re-slice Phase 0 before writing any code — was executed on 2026-07-26:**
> Isaac chose the "usable study session" first slice and hybrid execution. See the LATEST block.
> ---

---

## 🗺️ Grand master plan

NerdyApp is a Windows-first, offline-first study companion that helps a learner hold attention on one
thing, keep a study habit alive, and see the work they actually did. The device is the source of truth;
there is no server, no auth and no sync before v1.0. `docs/masterplan.md` is the governing document for
sequencing and locked decisions — it supersedes the README roadmap where they disagree. Phase 0/1
content is being delivered as **slices** (re-sliced 2026-07-26 to honour L3): each merge is a usable
app, with infrastructure hardening following in thin slices.

Phases (from `docs/masterplan.md` §7, as re-sliced):

- **Slice 1 (Phase 0 core + Phase 1 timer basics)** — **DONE** (`2549650`) — scaffold, frozen schema
  v1, local user, subjects, start/pause/end sessions, history
- **Slice 2 — Harden (Phase 0 remainder)** — **DONE** (`f483347`) — CI, schema verification +
  freeze guards (proven failable), backup, docs
- **Phase 1 remainder — Core loop** — **DONE** (`a42b180`) — crash recovery, subject CRUD,
  immutability tests, wall-clock accuracy (code merged; manual exit checks a+b still owed)
- **Phase 2 — The signal** — TODO — post-session survey + interruption log
- **Phase 3 — Focused mode (Tier 1)** — TODO — fullscreen sessions, escapes detected and logged
- **Phase 4 — Topics & mastery** — TODO
- **Phase 5 — Consistency & insight** — TODO — strict streak, heatmap, analytics
- **Phase 6 — Goals & routines** — TODO (adds `goals`, `routines` tables + `sessions.goal_id`)
- **Phase 7 — Companion tools** — TODO (adds `notes` table)
- **Phase 8 — Export & durability** — TODO
- **Phase 9 — Finish** — TODO — installer, polish, `v1.0.0`

## ✅ Completed

- **Modernist UI shell** (`3df3bad`, 2026-07-26) — full write-up in the LATEST block. Sidebar
  shell, seven views (real + stamped mocks), mode prompt, survey shell, session mode recorded.
  48 tests; Windows build verified.
- **Phase 1 remainder — core-loop correctness** (`a42b180`, 2026-07-26) — full write-up in the
  LATEST block. Crash recovery, enforced immutability, pause persistence, subject CRUD, real-clock
  smoke test. 40 tests; six probes seen red.
- **Slice 2 — harden** (`f483347`, 2026-07-26) — full write-up in the LATEST block. CI + three
  schema guards all seen red before trusted; backup; project docs. 25 tests.
- **Slice 1 — usable study session** (`2549650`, 2026-07-26) — scaffold, frozen schema v1, local
  user, subjects, session timer with pause, history. 22 tests, manual checklist passed by Isaac.
- **V3 bootstrap** (`a60a867`, `ae37ff5`, 2026-07-25) — new repo, docs carried across, post-mortems
  written, environment facts recorded in masterplan §1a.

**Patterns/conventions established (reuse, don't reinvent):**

- Feature-first layout: `app/lib/features/<feature>/{domain,data,presentation}`, shared in
  `app/lib/core/`. Domain imports neither Flutter nor Drift.
- DI: `app/lib/core/providers.dart` — `databaseProvider` throws unless overridden; `main()` and
  tests override it (`ProviderScope(overrides: [...])` with `NativeDatabase.memory()` in tests).
- All timestamps written `.toUtc()`; tests compare instants at second precision via
  `toUtc().isAtSameMomentAs(...)` — never `isUtc`.
- Schema tests assert **exact sets** (tables, indexes, FK tuples via `PRAGMA foreign_key_list`) so
  the freeze is bidirectional.
- Conventional Commits; GitHub Flow, squash PRs; README edits **require** a README-changelog row;
  build iteration (V3) ≠ release version (v0.1.0); `CLAUDE.md` is git-ignored by design.

## 🔜 Future slices (ordered)

1. **Isaac's manual checks** — the shell UX walkthrough (spec §8) plus the still-owed Phase-1
   exit checks (crash-recovery kill test, one-hour wall-clock accuracy).
2. **Phase 2 — the signal** — wire the already-built survey dialog to persistence + the
   interruption log, then masterplan §7 Phase 3 onward.

**Backlog / deferred (non-blocking):** liveness heartbeat for unpaused-crash duration bound;
`start()` double-tap orphan session (self-healing); README badge `TODO` (needs public repo); V1
post-mortem period detail in README iteration table; fork-PR CI trigger (`on: pull_request`) if
outside contributors ever arrive; `users.email` COLLATE NOCASE decision (recorded in masterplan
§10, due when auth nears).

## 🧭 Workflow (locked)

Per slice: agree scope → write the plan (`docs/superpowers/plans/`) → branch (`feat/...`) →
implement (TDD on correctness-critical code) → verify against stated exit criteria — **run and
output seen**, "should work" is not evidence → PR → squash merge → update this handoff.
Hybrid execution: inline by default, dedicated independent review on schema/migration-class work.
**Manual verification cannot be delegated** — launching the app, creating data, restarting and
confirming persistence is routed to Isaac, never claimed by an agent.

## ⚠️ Gotchas / hard-won lessons

Verified in V2 (full detail in `docs/masterplan.md` §1a and `CLAUDE.md`):

- **`drift` and `drift_dev` must both pin to exactly `2.34.0`** — at 2.34.1+ the schema CLI won't
  compile; green `build_runner` does not prove the schema tooling is intact.
- **Drift reads `DateTime` back as local time** (integer epoch seconds — sub-second precision is
  lost). Compare instants, never assert `isUtc`.
- **`ValidationOptions.validateDropped` defaults to `false`** — a verification test at defaults
  misses an added table/index.
- **`git diff --exit-code` misses new untracked dump files** — precede with
  `git add --intent-to-add`.
- **GitHub Actions `pwsh` propagates only the last command's exit code** — one command per step.
- **Never `pumpAndSettle()` while a `CircularProgressIndicator` is on screen.**
- **`main()` must call `WidgetsFlutterBinding.ensureInitialized()`** before path_provider.
- **Never `git add -A`.**
- **For every mandated test, name the change that would make it fail** — otherwise it isn't a test.

New in slice 1 (verified this session):

- **`*.g.dart` is gitignored at the repo root** (deliberate, from V2). Fresh clones and CI must run
  `dart run build_runner build` before `flutter analyze`/`flutter test`.
- **Drift + Riverpod widget tests:** disposing a drift-backed `StreamProvider` schedules a close
  timer. End widget tests with `await tester.pumpWidget(const SizedBox()); await tester.pump(const
  Duration(seconds: 1));` — the final pump must advance the fake clock (a bare `pump()` doesn't),
  or the pending-timer invariant fails. See `subject_list_screen_test.dart`.
- **Two concurrent `flutter test` runs collide** copying `sqlite3.dll` into `build\native_assets\`
  (errno 183 tool crash). Never run test invocations in parallel in this repo.
- **A failed widget test can hang `flutter_tester` ~10 minutes** (default per-test timeout). Use
  `--timeout 60s` when iterating.
- **Drift `.check()` columns trip the `recursive_getters` lint** — false positive; suppressed
  file-wide in `tables.dart` with an explanatory comment.
- **`@TableIndex.sql` works on drift 2.34.0** for partial/DESC indexes and keeps them inside
  drift's schema model (visible to future schema dumps), unlike `customStatement` in `onCreate`.

New in slice 2 (verified this session):

- **The schema CLI (`drift_dev schema dump/generate`) compiles at the 2.34.0 pin** — its compiling
  at all is itself a canary for pin drift.
- **`migrateAndValidate` at 2.34.0:** use `package:drift_dev/api/migrations_native.dart` and
  `options: const ValidationOptions(validateDropped: true)` — the bare `validateDropped:` param and
  `api/migrations.dart` import are deprecated and fail `flutter analyze`.
- **A branch-vs-main freeze guard is inert for snapshots not yet on main** (they diff as Additions).
  `--diff-filter=MD` is what makes new dump files legal while rewrites fail. Guard activates only
  once the snapshot lands on main.
- **The runtime verifier cannot see STRICT flips, `clientDefault`, or date-storage options** — the
  CI dump guard is load-bearing for those (comment in `schema_verification_test.dart`).
- **`VACUUM INTO` needs the target file absent** — delete first; it is the WAL-safe backup method
  (a raw file copy can miss un-checkpointed writes).
- **`gh pr create` with a multiline `--body` here-string mangles on embedded quotes in this
  PowerShell setup** — write the body to a file and use `--body-file`.

New in the phase-1 session (verified this session):

- **`package:drift/drift.dart` exports `isNull` AND `isNotNull`**, which collide with
  flutter_test's matchers — import drift with `hide isNull, isNotNull` in test files that need
  `Value`/companions.
- **`flutter test`/`pub get` leaves phantom CRLF-only modifications** on
  `app/windows/flutter/generated_plugin_registrant.cc` and `generated_plugins.cmake` (empty
  content diff). `git checkout -- <paths>` before committing; never commit them incidentally.
- **Real-clock smoke-test bounds must not sit on a regression value**: with delays 2s/3s/2s, a
  pause-folded-into-active regression yields wall ≥7 s, strictly above the [3, 6] active bound.
  If those delays change, re-derive the bounds (the review caught the original 2s/2s/2s version
  passing under the fold regression).
- **Async Riverpod notifier methods need post-await state rechecks** — two tap handlers can
  interleave across an `await`; re-check `identical(state, s)` (or the session id) before
  assigning, or a racing pause resurrects an ended session in the UI.
