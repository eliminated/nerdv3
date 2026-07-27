# Session Handoff — NerdyApp Companion (build iteration **V3** — desktop stack changed 2026-07-27)

> ## ⏩ LATEST (2026-07-27, "V3-A — core in TypeScript" session) — READ THIS FIRST
>
> **State:** on **`feat/v4-electron-rewrite`** (the integration branch), clean, in sync with
> `origin`. Last commit **`e402baa`** — PR #6 squash-merged, branch `feat/v3a-core-typescript`
> deleted — on top of `b1a1d85`. **`main` is still at `d70d6a8`, deliberately:** it must not
> receive a half-ported app, so V3-B/C/D land on this branch and it merges to `main` once the
> rewrite is runnable. **107 tests green; CI green on both jobs (`build` + `desktop`).**
>
> **⚠️ Manual verification is NOT discharged by any of this.** The one-hour wall-clock accuracy
> check and the crash-recovery kill test are properties of the *product* and are owed against a
> real Electron build (V3-D). Nothing in V3-A touches them.
>
> **⚠️ NAMING CORRECTED THIS SESSION.** The previous session labelled the Electron rewrite "V4".
> Isaac overturned that: the masterplan, the four design documents, the frozen schema v1 and the
> whole phase sequence carry across untouched, and the stack-change spec itself calls the result
> "a port of proven logic, not a redesign". A stack change inside a surviving plan is **not** a
> from-scratch restart, so **this is still build iteration V3** and `CLAUDE.md`'s "Currently V3" is
> now correct rather than stale. **Three numbers, deliberately distinct** (extends `CLAUDE.md`'s
> two): build iteration **`V3`** · release version **`v0.*.*`** · plan id
> **`P<iteration><plan><slice>`**, so this slice's plan is **P31A**. Rewrite slices are
> **V3-A … V3-D**. The branch name `feat/v4-electron-rewrite` and the commit subjects of `b4cd16e`,
> `a695f8d`, `b63d016`, `b1a1d85` still say V4 — published history, left alone; the branch dies at
> merge.
>
> **V3-A — `core` in TypeScript: DONE & merged (PR #6).** Shipped: npm workspace under `desktop/`
> (TS strict + `NodeNext`, vitest, ESLint type-checked with `no-floating-promises`); `SqliteDriver`
> over `node:sqlite` with a SAVEPOINT-based `Database`; `schema.sql` applied verbatim on open;
> `ensureLocalUser`; the `ActiveSession` timing state machine; all four repositories behind the
> port interfaces of V3 spec §5; `loadSessionDetail`; the privacy write-confinement guard; a
> second CI job on `windows-latest` with Node pinned `25.7.0`.
>
> **Nineteen guards probed RED before being trusted**, each asserting its edit actually applied and
> each file verified byte-identical afterwards (outputs tabulated in PR #6). Notable: the schema
> freeze replacement catches an added **table**, which the retired drift verifier at its defaults
> (`validateDropped: false`) did not.
>
> **A defect found while writing the tests:** every repository method declared `Promise<void>` but
> **threw synchronously** — sync bodies with a `Promise.resolve()` tail — so `Promise.all([...])`
> or a bare `.catch()` would have got an uncaught exception instead of a rejection. Same
> async-hazard family as the duplicate-pause bug. All four are genuinely `async` now, pinned by a
> named test in two files.
>
> **The independent review pass found the privacy commitment was NOT actually enforced.** Five
> bypasses were demonstrated *green* against a guard that had already been probed four times; all
> five are now caught. In order of how likely they were to be hit by accident:
> 1. **`kind` was a shape check, not a vocabulary.** `/^[a-z_]+$/` accepts `app_switch_chrome`,
>    `discord`, `whatsapp` — nearly every app name slugs into it. The realistic failure was never
>    malice: it is Phase 3's window watcher writing `` `app_switch_${slug(appName)}` ``, the most
>    natural line of code someone will write, with every identity-shaped guard green. **`kind` is
>    now a CLOSED SET** of the seven documented kinds.
> 2. **Comment stripping hid real code from the scan** — a string containing `//` or `/*` erased a
>    following `INSERT`. It failed *unsafely*. Stripping removed.
> 3. **The reader exemption was an unconditional `continue`**, so the declared reader could INSERT.
> 4. **The owner check was a one-word grep**, which a positional `INSERT INTO interruptions VALUES
>    (?×11)` walks past — the 11th column IS the free-text one.
> 5. **Only `<pkg>/src` was walked**, while Electron scaffolds put main/preload at
>    `packages/app/electron/main.ts` — outside `src/`, and exactly where the window name lives.
>
> Also from the review: **`transaction()` silently lost atomicity for any async callback** (RELEASE
> fires while the body is in flight, so a later throw never rolls back — and the Dart original is
> literally `transaction(() async {…})`, so V3-B's natural port is the broken shape); **
> `ActiveSession` immutability was not real** (`readonly` blocks reassigning a field, not mutating
> the `Date` it points at); and a mutation harness found `elapsedMs` **sub-second precision was
> asserted nowhere** — every assertion used whole minutes, while `elapsedMs` is what becomes
> `actual_duration_s`. `schema.test.ts` now also asserts schema v1 declares **no triggers and no
> views**: a trigger can write a table from inside the database, and a view lets a reader select
> the data without ever naming it.
>
> **Two deliberate deviations from the Dart original, recorded not absorbed:** negative durations
> clamp in `end()`/`resume()`/`totalPausedMs()` (Dart clamped only the crash path, so `logPause`
> and the session writer disagreed about one pause); and a `Clock` is injected into every
> repository, which makes the `updated_at` watermark assertable.
>
> **One CI failure, and the verification habit that caused it — the more durable lesson.** After
> the review fixes, CI's `desktop` job failed while reporting **107 tests passed**: refusing an
> async transaction callback abandoned a promise that then rejected with nothing listening, and
> vitest exits non-zero on an unhandled rejection. It had already been failing locally. My check
> was `npx vitest run … | grep -E "Tests "`, which hid the `Errors 1 error` line **and** replaced
> vitest's exit code with grep's. Fixed by neutralising the orphan before throwing; re-verified by
> capturing the real exit code at every step. **Never pipe a test run through a filter to decide
> whether it passed.**
>
> **▶ DO THIS NEXT — V3-B: the Electron shell, IPC, and the two builds.**
> 1. **Verify first whether Electron's bundled Node exposes `node:sqlite`.** Still unverified. If
>    not, `better-sqlite3` is the fallback and **only `src/db/driver.ts` changes** — that is what
>    the narrow driver interface bought.
> 2. Main / preload / renderer; `nerdyapp.exe` binds SQLite on a **fresh** database,
>    `nerdyapp-test.exe` binds in-memory fixtures and opens **no** database.
> 3. `openDatabase({ schemaSql })` exists as the seam for getting `schema.sql` into a bundle —
>    `core` has `noEmit` and reads it via `import.meta.url`, which a bundler will not carry.
> 4. Port `backup.dart` (`VACUUM INTO`) once the save dialog exists.
> **Do not re-litigate** the seven carried-over invariants in V3 spec §4.
>
> **Next-session execution:** **Hybrid** — inline by default, dedicated independent review on
> correctness-critical work. It has now paid for itself four times; this session it caught a
> privacy guarantee that was not actually holding, which four rounds of my own red-probing had
> missed. **The lesson to carry: probing a guard red proves it catches the failure you thought of.
> It says nothing about the failure you didn't.**
> ---
> ## ⏪ PREVIOUS (2026-07-27, "V3 pivot — Electron rewrite begins" session)
>
> **State:** branch **`feat/v4-electron-rewrite`** (pushed), one file uncommitted
> (`docs/superpowers/specs/2026-07-27-v3-desktop-stack-change.md` — the fresh-database decision;
> commit it first). Last commit `b63d016` on top of `a695f8d`, `b4cd16e`, `d70d6a8`. `main` is at
> `d70d6a8` with **Phases 0–2 complete in Flutter and all five PRs merged**.
>
> **⚠️ THE BIG CHANGE: the desktop app is being rewritten in Electron + Vue 3 + TypeScript.** Isaac
> decided this on 2026-07-27, superseding masterplan §3 **locked decision 1** (Flutter). Read
> `docs/superpowers/specs/2026-07-27-v3-desktop-stack-change.md` before touching anything — it is the
> governing document for this iteration and records the decisions, the layout, and what must be
> carried across verbatim. Summary of his choices:
> - **Stack:** a web stack chosen for an "advanced / premium-ish" feel; the concrete pick was
>   delegated to me → **Electron + Vue 3 + TypeScript**. (Tauri is the better engineering answer on
>   paper — 5 MB exe, direct Win32, and Tauri v2 does Android — but it puts **Rust** into an iteration
>   already abandoned twice. Recorded as the migration target if size/native depth ever dominate.)
> - **Two genuinely different executables:** `nerdyapp.exe` = the product, database-backed, with
>   minimal well-handled errors ("stable release"); `nerdyapp-test.exe` = **no database at all**,
>   runs on example data, verbose errors, for walking and debugging the UX without touching real
>   study history. The seam: `core` exposes repository *interfaces*; the product binds SQLite, the
>   test build binds in-memory fixtures. Same `ui` package either way.
> - **Fresh database.** The Electron build does not open the existing Flutter-era `nerdyapp.db`
>   (it holds 1 subject, 2 sessions — nothing worth migrating). The old file stays on disk
>   untouched. *(Wording repaired after the V4→V3 relabel, which had left this sentence saying
>   "V3 does not open the V3 file".)*
> - **Flutter is retired, not deleted** → moved intact to **`app-flutter/`**, reference only. Its
>   tests are the behavioural specification the port must reproduce.
> - **Full rewrite in one pass** (Isaac chose this after the V1-failure risk was stated) and **the
>   Modernist design persists**.
>
> **What actually shipped this session (4 commits, nothing merged to `main`):**
> `b4cd16e` the V3 decision record + **`desktop/packages/core/src/db/schema.sql`** — frozen schema v1
> transcribed **byte-faithfully from the live database** via `sqlite_master`, not re-derived, so it is
> ground truth; `a695f8d` the `app/` → `app-flutter/` move with `.gitignore` paths followed;
> `b63d016` CI repointed at `app-flutter` so the reference suite stays green during the port.
> Directory skeleton created: `desktop/packages/{core,ui,app,lab}` (`lab` is now vestigial — the
> second app is `test`, not a lab; rename or drop it).
>
> **Two findings worth keeping:**
> 1. **Node 25 ships SQLite built in** (`node:sqlite`) and reads the existing `nerdyapp.db` fine — no
>    native module, no MSVC step. **Unverified for Electron**: Electron bundles its own Node, so
>    confirm `node:sqlite` exists in the target Electron version before relying on it; `better-sqlite3`
>    is the fallback (VS 2022 with the C++ workload is installed).
> 2. **Toolchain present:** Node v25.7.0, npm 11.10.1, git 2.52.0, VS Community 2022.
>
> **Verification correction (important, don't re-record it wrong):** "all tests pass" this session
> meant the **automated** Flutter suite (81 green, run twice). The **manual** walkthroughs were NOT
> run — proven by the live DB holding zero `session_surveys` and zero `interruptions` rows. The
> obligation transfers to V3: the one-hour wall-clock accuracy check and the crash-recovery kill test
> are properties of the *product* and must be earned again in Electron before claiming Phase 1/2
> parity.
>
> **▶ DO THIS NEXT — port `core` first (Isaac's choice), before any UI.**
> 1. Commit the pending spec edit; scaffold the npm workspace under `desktop/` (workspaces, TS strict,
>    vitest).
> 2. **Port the correctness-critical logic to TypeScript in `desktop/packages/core`:** the
>    `ActiveSession` timing state machine (`app-flutter/lib/features/session/domain/active_session.dart`)
>    and the four repositories (subjects, sessions, surveys, interruptions) against `schema.sql`, with
>    a vitest suite mirroring `app-flutter/test/` — that suite is the spec, and it already encodes two
>    bugs found the hard way (§4 of the V3 spec lists all seven invariants that must survive the port).
> 3. Only then the Electron shell, the `ui` package, and the seven views.
> **Do not re-litigate** the seven carried-over invariants in V3 spec §4 (schema, timer laws, post-end
> immutability, one-row-per-pause with state cleared before the await, survey rules, the privacy line,
> the Modernist design). They were designed, reviewed and verified; the port reproduces them.
>
> **Next-session execution (chosen this handoff):**
> - **Mode: Hybrid** — inline by default, with a **dedicated independent review pass on the
>   correctness-critical pieces only**: the timer state machine, the repositories, and the privacy
>   guard. This is Isaac's standing preference and it has now paid for itself three times (the
>   design pass and the post-implementation review each caught a real duplicate-row bug the tests
>   missed; a third pass caught three assertions that could not fail).
> - No per-role subagent model table needed for hybrid mode.
> ---
> ## ⏪ PREVIOUS (2026-07-26, "Phase 2 — the signal" session)
>
> **State:** `main`, clean, in sync with `origin`. Last commit `fb9da40` ("feat: phase 2 - the
> signal (survey persistence + interruption log) (#5)", squash merge) on top of `3df3bad` (UI
> shell). CI green on branch and on main. **81 tests.** Schema still frozen at v1.
>
> **Phase 2 — the signal: CODE DONE & merged (`fb9da40`). The phase is NOT declared done — its
> manual verification is unrun (see DO THIS NEXT).** Shipped: `SurveyRepository` (insert-only, with
> a transaction-scoped guard refusing anything but a normally-ended session — a crashed session's
> rating would otherwise drag a qualified day below Phase 5's 3.0 threshold); `InterruptionRepository`
> — the *only* writer of that table, whose API cannot express app identity (no `detail` parameter,
> and `kind` validated as a bare token); one append-only `manual_pause` row per **completed** pause
> (never insert-then-update, which would break the union-dedup sync strategy); a one-tap
> `self_reported` distraction button with a live in-session count; survey wired through the dialog
> (keyboard operable: digits 1–5, Enter, Escape, gated so a digit typed in the note can't overwrite
> the rating); each Stats history row expands in place to its real survey + interruption log.
> **Deferrals given owners in writing:** `idle_timeout` → Phase 3 (`N` still open), 90-day purge →
> Phase 8, session-detail screen + survey backfill → Phase 5 (new deferred decision **D5**). The two
> contradictory blockquotes in data-model §5.1/§5.2 (neutral-3.0, grace tokens) are deleted in favour
> of locked decision 5. Spec: `docs/superpowers/specs/2026-07-26-phase-2-signal-design.md` (§7a is
> the review table). Plan: `docs/superpowers/plans/2026-07-26-phase-2-signal.md`.
>
> **⚠️ VERIFICATION STATUS — corrected 2026-07-27 after checking the database.** The **automated**
> suite is verified: 81 tests green, run twice by Isaac at the keyboard. The **manual** walkthroughs
> are NOT evidenced and remain owed: the live database holds only two sessions, both from the
> 2026-07-26 shell testing, both `mode='plain'`, with **zero `session_surveys` and zero
> `interruptions` rows** — so Phase 2's survey/distraction/Stats walkthrough did not run against it,
> and no crash-recovery kill test happened on 07-27 either. An earlier revision of this block
> recorded all three as passed on the strength of an ambiguous "all tests pass"; that was wrong and
> is retracted here.
>
> **How much this still matters, given the V3 rewrite:** less than it did. The Flutter app is now
> reference-only, so re-running a retired app's checklist buys little. What carries forward is the
> **automated** suite as the behavioural specification the rewrite must reproduce — and the
> obligation itself transfers: the one-hour wall-clock accuracy check and the crash-recovery kill
> test are properties of the *product*, so they must be run against the Electron build before V3 can
> claim Phase 1/2 parity.
>
> **Launch gotcha that cost a debugging round:** the Release exe is at
> `app\build\windows\x64\runner\Release\nerdyapp.exe`, and **cmd.exe rejects a leading `&`**
> (`& was unexpected at this time.`) — that is PowerShell's call operator, and it aborts the whole
> line, so the app appears not to launch. In cmd use the quoted path alone, or `start "" "<path>"`.
> The live database is `%APPDATA%\com.nerdyapp\nerdyapp\nerdyapp.db`.
>
> Then **Phase 3 — Focused mode (Tier 1)**, which opens with a one-day spike on whether Focus Assist
> can be enabled programmatically at all (masterplan R1). Phase 3 inherits: `idle_timeout` with `N`
> still unfixed, deferred decision D2 (the ~10s interruption threshold, to be settled from the real
> distribution this slice now collects), and `app_switch`/`exit_attempt` writes — which will be the
> first code that legitimately needs `detail`, and must therefore widen the signature inside
> `interruption_repository.dart` deliberately, in front of the privacy test.
>
> **Process notes — the two agent passes paid for themselves twice.** A 10-agent design pass ran
> *before* implementation (4 research lenses → 3 competing designs → 3 judges) and caught a
> duplicate-row bug plus two factually false failure-mode claims in the winning design **at plan
> time**. A 24-agent adversarial review ran *after* implementation: 15 findings survived
> verification, 5 refuted — and it found a second, subtler instance of the same bug class that my own
> tests missed (`end()` cleared controller state only *after* awaiting the log, so End-then-Resume
> and End-then-End each double-logged one pause). It also found that double-tapping **End session**
> could unwind the shell and lose the survey, that identity could be smuggled through `kind`, that
> the privacy scan was bypassable four ways (drift managers, companions, batches, raw SQL), and that
> three assertions could not fail. Every fix was probed red. **Lesson to carry: tracing async
> orderings by hand is not proof — write the mirror-ordering test.**
> ---
> ## ⏪ PREVIOUS (2026-07-26, "Modernist UI shell" session)
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
there is no server, no auth and no sync before v1.0. `docs/masterplan.md` remains the governing document
for **sequencing and product decisions** — it supersedes the README roadmap where they disagree — with
one exception: its §3 **locked decision 1 (Flutter) is superseded** by
`docs/superpowers/specs/2026-07-27-v3-desktop-stack-change.md`, which is governing for **stack and
architecture**. Each merge should still leave a usable app (L3).

**Iteration status:** still build iteration **V3**. Phases 0–2 were completed in Flutter and are
being **re-implemented** in Electron + Vue 3 + TypeScript. The phase *sequence and specs below are
unchanged* — what changed is the client technology, which is a stack change inside a surviving plan,
not a from-scratch restart (see the stack-change spec's preamble). Phases 0–2 are therefore
"designed and proven, awaiting port", not "to design".

Phases (from `docs/masterplan.md` §7, as re-sliced):

- **Slice 1 (Phase 0 core + Phase 1 timer basics)** — **DONE** (`2549650`) — scaffold, frozen schema
  v1, local user, subjects, start/pause/end sessions, history
- **Slice 2 — Harden (Phase 0 remainder)** — **DONE** (`f483347`) — CI, schema verification +
  freeze guards (proven failable), backup, docs
- **Phase 1 remainder — Core loop** — **DONE** (`a42b180`) — crash recovery, subject CRUD,
  immutability tests, wall-clock accuracy (code merged; manual exit checks a+b still owed)
- **Phase 2 — The signal** — **CODE DONE** (`fb9da40`) — survey persistence + interruption log
  (manual verification still owed before the phase is declared done)
- **V3 pivot — Electron rewrite** — **IN PROGRESS** (branch `feat/v4-electron-rewrite`) — stack change
  recorded, schema ported, Flutter retired to `app-flutter/`. **Phases 0–2 must be re-implemented in
  the new stack before Phase 3 starts.**
- **Phase 3 — Focused mode (Tier 1)** — TODO — fullscreen sessions, escapes detected and logged
- **Phase 4 — Topics & mastery** — TODO
- **Phase 5 — Consistency & insight** — TODO — strict streak, heatmap, analytics
- **Phase 6 — Goals & routines** — TODO (adds `goals`, `routines` tables + `sessions.goal_id`)
- **Phase 7 — Companion tools** — TODO (adds `notes` table)
- **Phase 8 — Export & durability** — TODO
- **Phase 9 — Finish** — TODO — installer, polish, `v1.0.0`

## ✅ Completed

- **Phase 2 — the signal** (`fb9da40`, 2026-07-26) — full write-up in the LATEST block. Survey
  persistence with a normally-ended guard, interruption log whose API cannot express app identity,
  inline read-back in Stats. 81 tests; eight guards probed red; two agent passes (design + review).
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

- **V3-A — `core` in TypeScript** (PR #6, 2026-07-27, merged into `feat/v4-electron-rewrite`, **not
  on `main`**) — full write-up in the LATEST block. npm workspace, `SqliteDriver` over
  `node:sqlite`, `ActiveSession`, four repositories behind port interfaces, privacy guard, CI.
  107 tests; 19 guards probed red; three-reviewer independent pass that found five live privacy
  bypasses, a silent transaction-atomicity hole, and immutability that was not real.

- **V3 pivot — stack change + foundations** (`b4cd16e`, `a695f8d`, `b63d016`, 2026-07-27, **unmerged**
  on `feat/v4-electron-rewrite`) — decision record, byte-faithful `schema.sql`, Flutter retired to
  `app-flutter/`, CI repointed. No application code yet.

**Patterns/conventions established (reuse, don't reinvent):**

*Stack-independent (these survive the rewrite — they are the reason it is a port, not a redesign):*

- **The seven carried-over invariants** in V3 spec §4: frozen schema; elapsed time always from
  timestamps; persist on every state change; crash recovery to `end_reason='crashed'` at the last
  write, clamped; post-end immutability enforced at the data layer; one append-only `manual_pause`
  row per completed pause with state cleared *before* the write await; survey rules; the privacy
  line; the Modernist design.
- Timestamps stored as **epoch seconds** — sub-second precision does not exist; compare instants at
  second granularity, never assert a UTC flag on a round-tripped value.
- Tests assert **exact sets** for schema shape so the freeze is bidirectional, and **exact counts**
  for event rows so a duplicate is caught (`isNotEmpty` would not have caught the pause bug).
- **Every mandated test must name the change that would make it fail** — and guards are *seen red*
  before being trusted. This caught real bugs three times this project.
- Conventional Commits; GitHub Flow, squash PRs; README edits **require** a README-changelog row;
  **three distinct numbers** — build iteration `V3` ≠ release version `v0.*.*` ≠ plan id
  `P<iteration><plan><slice>` (this slice's plan is `P31A`); `CLAUDE.md` is git-ignored by design.
- **Ask the complementary question to every guard.** Probing red proves it catches the failure you
  imagined. Also ask an independent party: "how would you defeat this *without* it going red?"
  That question, and only that question, found the five live privacy bypasses in V3-A.
- Mock/placeholder content lives in exactly one module and always renders inside a visible stamp;
  the UI never claims a capability the app lacks.

*Flutter-specific (now historical — `app-flutter/`, read them as the reference implementation):*

- Feature-first `lib/features/<feature>/{domain,data,presentation}`; domain imported neither Flutter
  nor Drift; DI via `core/providers.dart` with `databaseProvider` overridden in tests.

## 🔜 Future slices (ordered)

1. **V3-B — Electron shell + IPC + the two builds (start here).** Main/preload/renderer; `nerdyapp.exe` binds
   SQLite (fresh database), `nerdyapp-test.exe` binds in-memory fixtures and opens no database.
   **Verify early whether Electron's bundled Node exposes `node:sqlite`**, else `better-sqlite3`.
2. **V3-C — `ui` package: Modernist theme + the seven views**, ported from
   `app-flutter/lib/features/*/presentation/` and `core/theme/modernist.dart`. Design tokens are in
   V3 spec §4.7 and the original bundle (`NerdyApp Study Companion Design.zip`). **Also owns two
   things V3-A deferred in writing:** the `SessionController` port with its two mirror-ordering
   race tests (invariant 4's *ordering* half — "clear state BEFORE the last await" — lives in the
   controller, not the repository), and **decision V3-1: reactivity**. drift's `watch*` streams
   became plain `list*`/`count*` queries, because every Flutter test consumed them with `.first`
   and designing a change-notification bus with no UI to serve would have been guesswork.
3. **V3-D — parity verification.** Re-earn the Phase 1/2 gates in Electron: the three Phase 2 exit
   criteria (with the interaction budget counted mechanically), crash recovery, and the one-hour
   wall-clock accuracy check. Replace the retired drift schema guards with a
   `schema.sql`-vs-live-database test.
5. **Phase 3 — Focused mode (Tier 1)** — only after parity. Opens with the Focus Assist spike (R1),
   now against Electron main-process APIs; inherits `idle_timeout` (`N` open), D2 (the ~10s
   threshold), and the first legitimate `detail` write.

**Backlog / deferred (non-blocking):** masterplan §3 decision 1 and §10 still need a row recording
the stack change; `actions/checkout@v4` and `actions/setup-node@v4` target the deprecated Node 20 on
runners (forced to 24 — non-blocking annotation, bump when convenient); consider
`erasableSyntaxOnly: true` in `tsconfig.base.json` if anything ever needs to load `core` through
plain `node` (parameter properties would have to go); README describes a Flutter
app throughout and will need a rewrite (plus its required changelog row) once V3 runs;
liveness heartbeat for unpaused-crash duration bound;
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

**V3-A / TypeScript stack (2026-07-27, verified this session):**

- **Never pipe a test run through `grep` to check it.** `npx vitest run … | grep -E "Tests "` does
  two harmful things at once: the filter hides failure lines that do not match (here, `Errors 1
  error` and the `Unhandled Errors` banner), and the pipeline's exit code becomes **grep's**, not
  the runner's. A suite that was already failing locally read as green four times and only broke on
  CI. Capture the exit code explicitly (`cmd > log 2>&1; echo $?`) and grep the log afterwards.
- **All tests passing is not the same as the run passing.** vitest exits non-zero on an unhandled
  rejection while reporting `107 passed`. Anything that abandons a promise — including code that
  deliberately refuses one — must attach a handler, or Node takes the process down elsewhere.
- **A guard probed red proves it catches the failure you thought of — nothing more.** The privacy
  guard was probed red four ways and still had five live bypasses, found only by an adversarial
  reviewer asked "how would you leak identity *without* this going red?". Probing is necessary and
  not sufficient; the complementary question has to be asked out loud.
- **A validator's SHAPE is not its VOCABULARY.** `/^[a-z_]+$/` on `kind` read like a privacy
  control and was not one: nearly every app name slugs into it. When a field exists to constrain
  meaning, enumerate the allowed values.
- **`readonly` is not immutability.** It blocks reassigning the field, not mutating the object the
  field points at, and it is erased at runtime. Hold instants as epoch numbers, hand out copies,
  and `Object.freeze` the instance. Dart's `final` + immutable `DateTime` gave this for free.
- **A `Promise`-returning method must never throw synchronously.** `Promise.all([...])` and a bare
  `.catch()` do not catch it. Mark the method `async` — that is what makes every failure a
  rejection.
- **`transaction(fn)` with a generic `T` silently accepts an `async fn`** and destroys atomicity:
  `RELEASE` runs while the body is in flight. Refuse thenables at runtime, not only in the type.
- **`node:sqlite` refuses to bind a JS boolean** ("Provided value cannot be bound to SQLite
  parameter N"). Convert to 0/1; the `BindValue` type deliberately excludes `boolean` so it is a
  compile error.
- **`Math.trunc` returns `-0`** for anything in (-1000, 0), and `-0 !== 0` under `Object.is`, so a
  test comparing to `0` fails while both print as "0". Normalise at the conversion boundary.
- **ESLint 9's `eslint .` discovers js/mjs/cjs ONLY.** Without an explicit `files: ['**/*.ts']` the
  entire TypeScript tree lints silently clean — an unfailable guard.
- **`tsc --build` at a workspace root needs a root project.** Without one it exits 0 having checked
  nothing. Fan the script out over workspaces instead.
- **SQLite cannot nest `BEGIN`; `SAVEPOINT` can.** And `ROLLBACK TO` does not pop the savepoint —
  it must be followed by `RELEASE`.
- **`sqlite_master` guards that enumerate only tables and indexes are blind to triggers and views.**
  A trigger writes a table from inside the database; a view lets a reader read it without naming
  it, defeating any source scan keyed on the table name.
- **NodeNext resolution needs `.js` extensions on relative imports** (vitest resolves them to
  `.ts`). Chosen over `"bundler"` so plain `node`, `tsx`, vitest and any bundler all work.
- **TypeScript parameter properties cannot be run by Node's native type stripping**
  (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`), and `core`'s `exports` points at raw `src/index.ts`. Fine
  under vitest and any bundler; only bites if something loads the package through plain `node`.
- **`git checkout --` cannot restore an UNTRACKED file**, so a probe harness that mutates a
  brand-new file and "restores" it that way silently leaves the mutation in place and the following
  probes report the previous one. Every probe needs an assertion that its edit applied and a
  verified byte-identical restore.

**V3 / environment (2026-07-27):**

- **`cmd.exe` rejects a leading `&`** (`& was unexpected at this time.`) and aborts the whole line —
  that is PowerShell's call operator. Cost a debugging round when the app "wouldn't launch". Give
  cmd-safe commands: the quoted path alone, or `start "" "<path>"`.
- **A directory is locked while any shell sits in it.** `git mv app app-flutter` failed with
  "Permission denied" purely because a cmd window was at `C:\Projects\nerdv3\app>`. Check for that
  before hunting processes.
- **The Bash tool is sandboxed out of `%APPDATA%`**; copy a file into the scratchpad to inspect it.
- **Node 25 has `node:sqlite` built in** — no native module needed to read the database. Whether
  *Electron's* bundled Node exposes it is **unverified**; check before designing around it.
- **Don't infer verification from "all tests pass".** It meant the automated suite; the database
  proved the manual walkthrough never ran. Check the artefact, not the sentence.

**Flutter-era (still true of `app-flutter/`, and mostly true in spirit for the port):**

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

New in the phase-2 session (verified this session):

- **Clear state BEFORE the last await, not after.** Any window where a method is suspended while
  `state` still describes the old situation is a window another handler will observe — this is how
  one pause got logged twice. Corollary: **tracing async orderings by hand is not proof.** For every
  race test, write the mirror ordering (A-then-B *and* B-then-A) — the bug lived in the one I hadn't.
- **`tester.enterText` dispatches neither a pointer nor a key event** (it goes through the text-input
  channel), so it cannot drive interaction counters or `Focus.onKeyEvent` handlers. Use
  `tester.sendKeyEvent`.
- **`LogicalKeyboardKey` overrides `==`, so it cannot key a `const` map** — use a `static final`.
- **A `MockStamp`/`Container` stretches to its parent's width**, so it crashes with "BoxConstraints
  forces an infinite width" inside a `Row`; bound it with a `ConstrainedBox`. Long labels in a `Row`
  overflow the default 800×600 test surface — prefer `Wrap` for action/label rows.
- **Never build a drift stream inside `build()`** on a widget with a ticker: a fresh subscription per
  second. Hoist it into the `State`.
- **`Navigator.pop` resolves its target with `lastWhere(isPresent)`**, so a *second* pop issued while
  the first route is still `popping` takes the route BENEATH — a double-tapped "End session" unwound
  the whole shell. Latch buttons that pop after an `await`.
- **A source-scan guard must forbid *reaching* a table, not enumerate write syntaxes.** drift offers
  generated managers, companions, aliases and batches, and `customStatement` SQL bypasses all of
  them — and anchoring the SQL regex on `customStatement(` misses SQL held in a variable (probed).
- **Watch the *other* free-text column.** The privacy line names `detail`, but `kind` was an
  unvalidated `String`: `'app_switch:chrome.exe'` would have persisted a filename with every
  `detail`-shaped guard green.
