# Masterplan — Build Iteration V3

**Build iteration:** V3 · **Release version:** v0.1.0 (pre-alpha) · **Status:** approved, not started · **Last updated:** 2026-07-25

This is the governing sequencing document for V3. It decides what gets built, in what
order, and what "finished" means.

It does **not** re-specify the architecture ([architecture.md](./architecture.md)), the
schema ([data-model.md](./data-model.md)), or enforcement mechanics
([focus-enforcement.md](./focus-enforcement.md)). Where it contradicts those documents or
the README, §10 records the resolution. **This document supersedes the README roadmap.**

---

## 1. V1 post-mortem

Recorded here because it is the reason this plan is shaped the way it is. (The README's
iteration-history table is filled from this section in Phase 0.)

V1 was abandoned for two compounding reasons:

1. **Too much hard technical surface attacked at once.** Focus enforcement, session-timer
   correctness, and offline sync were all in flight before any one of them worked. Each is
   individually difficult; together they left nothing in a finishable state.
2. **Schema churn corrupted data repeatedly.** Migrations were unreliable, so the database
   had to be wiped and rebuilt roughly weekly. No continuous record of real use ever
   accumulated, which removed the only thing that would have made the app worth opening.

A secondary cause: the codebase became unmaintainable. The correctness-critical paths had
no test coverage, so changes broke things silently and restarting looked cheaper than
untangling.

### Lessons carried forward

| | Lesson | Where it is enforced |
|---|---|---|
| **L1** | One hard problem in flight at a time. | Phase ordering, §7 |
| **L2** | Lock the schema before feature code; migrations are additive-only and tested. | §5 |
| **L3** | Every phase ends in a runnable, usable app. A phase that ends in infrastructure and nothing to use is not a phase. | Exit criteria, §7 |
| **L4** | Correctness-critical paths are test-first, not test-later. | §8 |
| **L5** | Finishing is the goal. Scope gets cut to reach an end state. | §4 |

## 1a. V2 post-mortem

V2 executed this plan and was restarted before finishing. It is worth being precise about why,
because the reason is not the one "failed iteration" implies.

**V2 did not fail technically.** It completed 6 of Phase 0's 10 tasks and 3 of its 4 exit
criteria, with 24 passing tests: a Flutter Windows app, green CI, a frozen 7-table schema with
8 foreign keys and 6 indexes, a migration harness whose guards were demonstrated capable of
failing, a transaction-safe local-user bootstrap, and a subject repository. Nothing was broken.

**It was restarted over velocity.** Execution ran about four agent round-trips per task
(implement → review → fix → re-review), so a ten-task phase implied roughly seven hours, with
little visible progress in between.

**The finding that matters for this document:** every defect those reviews caught was in *this
plan*, not in the implementations.

| Defect in the plan | Consequence had it shipped |
|---|---|
| `sessions.topic_id` declared without a foreign key | SQLite cannot add one later; the v1 freeze would have made it permanent |
| The `SchemaVerifier` test seeded its database from the very snapshot it validated against | The guard compared the snapshot to itself and could never fail |
| `validateDropped` left at its `false` default, and `git diff` blind to a new-version dump file | An additive change plus a `schemaVersion` bump passed both guards green |
| `ensureLocalUser()` did a read-then-insert with no transaction | Two concurrent callers each insert a row, breaking the documented guarantee |
| Four assertions that passed whether the code was right or wrong | Coverage that measured nothing |

All five are corrected in the sections below. The lesson for V3 is procedural: **this plan is
not self-validating.** Stress-test a phase's design before implementing it — in particular, for
every test the plan mandates, state what change would make it fail. If the answer is "nothing",
it is not a test.

### Verified environment facts (established by running V2's code)

Carried forward so V3 does not pay to relearn them.

- **Toolchain present and working:** Flutter 3.41.4 / Dart 3.11.1, Visual Studio Community 2022
  17.14 with the C++ workload, `gh` 2.92.0 authenticated. Windows desktop builds succeed.
- **`drift` and `drift_dev` must both pin to exactly `2.34.0`.** At 2.34.1+ the
  `drift3_preview` `GeneratedDatabase` dropped `allSchemaEntities`, which `drift_dev 2.34.0`
  calls, breaking every `drift_dev schema` command. The `build_runner` path still works at
  2.34.2, so green codegen does **not** prove the schema tooling is intact.
- **Drift stores `DateTime` as integer epoch seconds and reads it back as local time.** Never
  assert `isUtc` on a round-tripped column; compare instants instead.
- **GitHub Actions `pwsh` propagates only the last command's exit code** from a multi-line
  `run:`. One command per step, or a failing guard passes green.
- **Never `pumpAndSettle()` while a `CircularProgressIndicator` is on screen** — it animates
  forever, so the call times out rather than settling.
- **Riverpod 3.3.2 supports this plan's idioms as written**, including `Provider(create)`,
  `AsyncValue.when({data, error, loading})`, `overrideWithValue`, `ProviderContainer()` and
  `UncontrolledProviderScope`.

## 2. Constraints

- **Solo developer, 10–20 hours per week.** Phases are sized at roughly one week.
- **Windows desktop first.** Android is deferred until after the finish line.
- **Offline-first.** The device is the source of truth. No server on the critical path.
- **Focus enforcement cannot be tested in CI** ([architecture.md §7](./architecture.md#7-testing-strategy)).
  Every enforcement phase produces a written manual checklist instead.
- **The safety rules in [focus-enforcement.md §2](./focus-enforcement.md#2-safety-rules)
  are non-negotiable** and constrain every focus phase: there is always an exit, system UI
  is never blocked, sessions are time-bounded, enforcement fails open.

## 3. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Flutter + Dart**, Windows target first | The only option giving one codebase *and* real platform-channel access to the Android focus APIs later. Kotlin-native means two separate codebases (fatal for L5); web/Electron/Tauri cannot reach screen pinning or DND at all. Confirms [architecture.md §6](./architecture.md#6-key-decisions) decision 1 and resolves the README tech-stack `TODO`. |
| 2 | **Riverpod** for state and DI | Resolves the open decision in [architecture.md §3.3](./architecture.md#33-state-management). Handles a long-running timer surviving screen changes, which is the core of the app. |
| 3 | **Drift/SQLite is the only datastore until after v1.0** | No FastAPI, no PostgreSQL, no auth, no sync engine before the finish line. Resolves the README-vs-architecture contradiction in favour of [architecture.md §6](./architecture.md#6-key-decisions) decision 6. |
| 4 | **A single local user row**, seeded at first launch with a fixed UUIDv7 | Every `user_id` foreign key is populated from day one, so adding a server later requires **no migration**. Costs minutes now; protects L2 later. |
| 5 | **Strict streaks.** No survey means the day does not qualify. A missed day breaks the streak. | Resolves both open questions in [data-model.md §5.1](./data-model.md#51-qualified-day) and [§5.2](./data-model.md#52-streak-length). No neutral-3.0 substitution, no grace tokens. Consequence: survey friction becomes a correctness concern, and the heatmap ships in the same phase as the counter so a broken streak does not erase the visible record of work. |
| 6 | **Windows Ultra-Focus is Tier 1 (detect + friction) for v1.0** | No keyboard hook — [focus-enforcement.md §6.2](./focus-enforcement.md#62-whats-fragile) rules it out (antivirus flags it; Task Manager defeats it anyway). Escalating friction and hard lockdown are post-finish and evidence-gated, per [focus-enforcement.md §10](./focus-enforcement.md#10-open-questions). |
| 7 | **Session edits limited to `subject_id` / `topic_id`**, followed by `recomputeSummaries()` | Resolves the editing-history question in [data-model.md §7](./data-model.md#7-open-questions). Preserves session immutability everywhere else. |
| 8 | **Interruption logs auto-purge after 90 days** | Resolves the retention question in [data-model.md §7](./data-model.md#7-open-questions). Highest-volume and most privacy-sensitive table. |
| 9 | **Companion tools: notepad, parked-thoughts list, ambient audio.** Audio is local files or generated noise — no streaming SDK | Resolves the music question in [architecture.md §8](./architecture.md#8-open-questions). A Spotify/YouTube SDK would bolt a hard network dependency and an auth flow onto an offline-first app. |
| 10 | **Routines are a first-class feature**, not a variant of goals | New entity, specified in §6. Recurring commitments with derived adherence. |
| 11 | **Historical `local_date` is frozen at write time** | Resolves the timezone question in [data-model.md §7](./data-model.md#7-open-questions). Freezing is simpler and more honest to what happened. |
| 12 | **A session that spans devices splits into two sessions** | Resolves [data-model.md §7](./data-model.md#7-open-questions). Moot until the Android port; recorded so it is not re-litigated. |
| 13 | **Linux is out of scope for V3 entirely** | A third native enforcement implementation, and Wayland restricts input grabbing further. Not deferred — excluded. |
| 14 | **MIT license** | Resolves the README `TODO`. Applied in Phase 0. |

## 4. The finish line

Defined before the phases, because a plan without an end is how V1 ran out.

**v1.0 is a Windows desktop app used daily**, containing:

- Subjects, and a topic tree with computed mastery
- Session timer with crash recovery
- Post-session survey and interruption log
- Focused mode (Tier 1)
- Strict streaks with a calendar heatmap
- Goals and routines with derived adherence
- Notepad, parking list, ambient sound
- CSV/JSON export, backup and restore
- A real Windows installer

**Explicitly excluded from v1.0:** Android, server, sync, authentication, Ultra-Focus hard
lockdown, spaced repetition, external course integration, social features. These are
post-finish phases and **must not block the finish line.**

## 5. Schema strategy — the migration law

Split by how well each table is already specified.

**Locked at schema v1 in Phase 0**, all specified to column and index level in
[data-model.md](./data-model.md), needing no further design work:

`users` · `subjects` · `topics` · `sessions` · `session_surveys` · `interruptions` ·
`daily_summaries`

**Added later, as new tables:** `goals` and `routines` (Phase 6), `notes` (Phase 7). These
are the tables that are genuinely undesigned — which is precisely why adding them later is
safe: a brand-new table cannot corrupt rows in an existing one.

> ### The law
>
> **Pre-1.0 migrations are additive-only.** New tables, and new nullable columns (or
> columns with a constant default), only. No renames, no drops, no type changes, no
> `NOT NULL` without a default.
>
> Any destructive change requires a numbered migration plus a test that runs it against a
> fixture database seeded at the *previous* schema version and asserts no row loss.

**Enforcement:** Drift schema versioning with generated schema-verification tests, one per
version step, run in CI from Phase 0. This is the direct countermeasure to L2 and it is not
optional.

**One exemption:** `daily_summaries` is a pure cache, fully recomputable from `sessions`
and `session_surveys` ([data-model.md §4.1](./data-model.md#41-daily_summaries-cache)). It
may be dropped and rebuilt freely.

## 6. New entity — routines

Provisional. Finalised in the Phase 6 spec; recorded here because no existing document
covers it.

```sql
CREATE TABLE routines (
    id                UUID PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES users(id),
    subject_id        UUID REFERENCES subjects(id),
    topic_id          UUID REFERENCES topics(id),
    title             TEXT NOT NULL,
    days_of_week      SMALLINT NOT NULL,   -- bitmask, Mon = 1<<0 … Sun = 1<<6
    start_time_local  TEXT,                -- 'HH:MM'; NULL = anytime that day
    target_duration_s INTEGER NOT NULL,
    active            BOOLEAN NOT NULL DEFAULT true,
    starts_on         DATE,
    ends_on           DATE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);
```

**Adherence is derived, never stored**, matching how `goals` progress already works
([data-model.md §3.7](./data-model.md#37-goals)). Expected occurrences are generated from
the recurrence rule across a date range, then matched against sessions on the same
`local_date` with a matching subject (or topic, when set). An occurrence is **met** when
matched session time is at least `target_duration_s`. A stored adherence counter would be
the same denormalisation bug the data model already refuses for goals.

Reminders need the app to be resident when a slot arrives, which is deferred (§9, D1).
Routines are useful without them: the day's plan is shown when the app opens, and adherence
is derived either way.

## 7. Phases

| # | Phase | Ends with | ~Time |
|---|---|---|---|
| 0 | Foundation you can run | App launches on Windows; a subject survives a restart | 1 wk |
| 1 | Core loop | Real sessions run and are recorded correctly | 1–1.5 wk |
| 2 | The signal | Surveys in ≤2 taps; interruptions logged | 1 wk |
| 3 | Focused mode (Tier 1) | Fullscreen sessions; leaving is detected and logged | 1 wk |
| 4 | Topics & mastery | Topic tree, tagged sessions, computed mastery | 1 wk |
| 5 | Consistency & insight | Strict streak, heatmap, analytics | 1–1.5 wk |
| 6 | Goals & routines | Recurring schedule with derived adherence | 1.5 wk |
| 7 | Companion tools | Notepad, parking list, ambient sound | 1 wk |
| 8 | Export & durability | Export, backup/restore, delete-all | 0.5 wk |
| 9 | Finish | Installer, polish, v1.0.0 tag | 1 wk |

Roughly 10–11 weeks at 10–20 hours per week.

---

### Phase 0 — Foundation you can run

**Goal.** A Windows Flutter app that persists data, plus the migration harness that
prevents V1's primary failure.

**Scope.**
- Flutter Windows scaffold; pinned Flutter SDK version; committed `pubspec.lock`
- Strict lints; Riverpod wired
- Drift schema v1 — the seven locked tables of §5 with indexes per data-model.md
- Local user bootstrap (fixed UUIDv7, single row)
- Migration test harness plus a schema-v1 verification test
- GitHub Actions: analyze + test on push, `windows-latest`
- One-button database file backup (copy to a chosen folder) — cheap insurance given L2
- Minimal UI: subject list, create subject
- Documentation hygiene: rewrite the README roadmap to match this masterplan (with a
  README changelog row, per the project instructions), fill the README iteration-history
  table from §1, add MIT `LICENSE`, add `CONTRIBUTING.md`, correct the Windows
  notification-suppression claim in focus-enforcement.md §4 (see §9, R1)

**Exit criteria.**
- `flutter analyze` clean and `flutter test` green, both verified in CI on a real push
- App launches on Windows; create a subject; restart; the subject is still there
- Schema-verification test asserts v1 matches the committed schema dump
- Backup produces a file that opens as a valid SQLite database

**Produces.** Schema v1, frozen. Everything after this is additive-only.

### Phase 1 — Core loop

**Goal.** Run real study sessions and have them recorded correctly. This is the
correctness-critical phase.

**Scope.** Subject CRUD (name, colour, `source`/`source_name`, archive); session
start/pause/resume/end; elapsed time computed from stored `started_at`;
`paused_duration_s` tracked separately from `actual_duration_s`; state persisted on every
change; crash recovery writing `end_reason='crashed'` on next launch; history list and
session detail; `mode` recorded as `'plain'`.

The rules in [architecture.md §3.4](./architecture.md#34-the-session-timer) are
requirements, not suggestions — in particular, elapsed time is never derived from a tick
counter.

**Exit criteria.**
- Unit tests prove elapsed time is correct across arbitrary pause/resume sequences
- A session killed mid-run recovers as `'crashed'` on next launch and is excluded from
  streak inputs
- A one-hour real session records duration within 2 seconds of wall clock
- A test asserts no session field mutates after end except `ended_at`,
  `actual_duration_s`, and `end_reason`

**Test discipline.** Test-first, per L4.

### Phase 2 — The signal

**Goal.** The survey and interruption log — the app's core signal, and the input strict
streaks depend on.

Sequenced before focus enforcement deliberately: the survey is cheap and high-value,
enforcement is the daunting part, and this way the interruption log already exists when
Phase 3 starts writing to it.

**Scope.** Post-session survey (`focus_rating` required 1–5; comprehension, difficulty and
note optional); dismissible in one interaction, two for the common path; `manual_pause` and
`idle_timeout` interruptions; a one-tap self-reported distraction button covering the phone
blind spot (§9, R3), logged with a new `kind = 'self_reported'` — the column is `TEXT`, so
this extends the enum in [data-model.md §3.6](./data-model.md#36-interruptions) with no
migration; interruptions shown in session detail.

**Exit criteria.**
- A widget test counts the common survey path at two interactions or fewer, and dismissal
  at one
- Interruption rows are written with the correct `kind` and `blocked = false`
- A test asserts `detail` never records app identity, per
  [focus-enforcement.md §7](./focus-enforcement.md#7-interruption-logging)

### Phase 3 — Focused mode (Tier 1, Windows)

**Goal.** A session mode that reduces distraction and logs every escape.

**Opens with a one-day spike** on whether Focus Assist can be enabled programmatically at
all (§9, R1). The spike's result determines the notification-suppression scope below.

**Scope.** Borderless fullscreen topmost session view; distraction-reduced UI;
`SetThreadExecutionState(ES_DISPLAY_REQUIRED)` to block sleep; `WM_ACTIVATE` focus-loss
detection writing an `app_switch` interruption and showing a return prompt with remaining
time; exit friction (confirmation showing remaining time, logged as `exit_attempt` with
`blocked = true`); suppression of the app's own notifications, plus Focus Assist state
detection with a Settings deep link if programmatic control proves unavailable;
`mode = 'focused'`; a watchdog that releases any restriction on next launch, per the
fail-open rule in [focus-enforcement.md §2.3](./focus-enforcement.md#2-safety-rules).

**Exit criteria.**
- A written manual test checklist exists, has been executed, and passed
- Switching away logs exactly one `app_switch` and shows the return prompt within one second
- Declining the exit prompt logs `exit_attempt` with `blocked = true`
- All restrictions are released after normal session end **and** after a forced process kill

### Phase 4 — Topics & mastery

**Scope.** Topic tree CRUD (self-referencing, 3-level cap enforced in UI per
[data-model.md §3.3](./data-model.md#33-topics)); `order_index`; user-set `status`;
session-to-topic linking; mastery as a duration- and recency-weighted average of
`comprehension_rating` with a ~14-day half-life, hidden below two surveyed sessions;
session re-tagging per decision 7 with a recompute.

**Exit criteria.**
- Mastery matches a hand-computed fixture, including the recency decay
- A fourth nesting level is rejected in the UI
- Re-tagging a session updates both mastery and daily summaries

### Phase 5 — Consistency & insight

**Scope.** `daily_summaries` and `recomputeSummaries()`; `local_date` derived from the
user's timezone and `day_start_hour`; the strict qualified-day rule (decision 5); the
streak walk, where a not-yet-qualified today does **not** break the streak; calendar
heatmap; time per subject and topic; weekly trend.

**Exit criteria.**
- Streak matches hand-computed fixtures, including the `day_start_hour` boundary — a
  session ending 01:30 counts toward the previous day
- `recomputeSummaries()` is idempotent: running it twice produces identical rows
- Crashed sessions are excluded from qualification
- The heatmap renders twelve months without a visible stall

### Phase 6 — Goals & routines

**Scope.** The `goals` table with progress computed from sessions, never stored; the
`routines` table per §6; the day's plan shown on app open; derived adherence, displayed per
routine.

**Exit criteria.**
- Goal progress matches fixtures for every `target_type` (`hours`, `sessions`,
  `topics_confident`)
- Adherence is correct across a fixture month including a skipped occurrence and a
  partially-met one
- A test asserts progress and adherence recompute from sessions alone, with no stored
  counters

**Decision due this phase.** App residency and reminders (§9, D1).

### Phase 7 — Companion tools

**Scope.** A `notes` table with `kind` of `'scratch'` or `'parked_thought'` and a
`resolved_at` column — one table, two behaviours, since a parked thought is a note with an
unresolved state. Notepad attached to a session or topic; parking-list capture during a
session with review afterwards; ambient audio from bundled or local files with volume and
looping.

**Exit criteria.**
- A note persists and reopens with content intact
- A thought can be captured mid-session without ending or pausing the session, and appears
  in the post-session review
- Audio plays through a full session without stopping

### Phase 8 — Export & durability

**Scope.** CSV and JSON export across every table; backup and restore of the database
file; delete-all with confirmation. This is the concrete form of the README's privacy
commitment.

**Exit criteria.**
- Export round-trips: re-importing the JSON reproduces row counts and per-table checksums
- A backup taken two phases earlier still restores and opens — the end-to-end proof that
  the additive-only law held
- Delete-all leaves no user rows in any table

### Phase 9 — Finish

**Scope.** First-run onboarding (create a first subject, explain the modes and the
survey); a polish pass; a packaged Windows installer (MSIX or Inno Setup); the full manual
test checklist; `CHANGELOG.md` per Keep a Changelog; tag `v1.0.0`.

**Exit criteria.**
- Installing from the installer on a clean Windows machine, then completing a full session
  cycle, without touching a development tool
- Manual checklist green
- CHANGELOG and README accurately describe what shipped

### Post-finish

Unordered and each independently optional:

- **Android port** — screen pinning, DND, foreground service, per
  [focus-enforcement.md §5](./focus-enforcement.md#5-android). Also the real fix for R3.
- **Server and sync** — [architecture.md §5](./architecture.md#5-offline-first-sync), auth,
  PostgreSQL. Requires no migration, by decision 4.
- **Escalating friction (Tier 2/3)** — gated on evidence from the interruption log, per
  [focus-enforcement.md §10](./focus-enforcement.md#10-open-questions).
- Spaced repetition · external course integration · social features.

## 8. Execution model

Each phase runs: brainstorm (only where the phase has genuine open design) → phase spec at
`docs/superpowers/specs/<date>-phase-N-<topic>-design.md` → implementation plan →
implement test-first → verify against exit criteria → squash-merge PR from
`feat/phase-N-<topic>` → update `CHANGELOG.md`.

Rules:

- **One phase in flight at a time** (L1).
- **A phase is not done until its exit criteria have been run and their output seen.**
  "Should work" is not an exit criterion.
- **The domain layer imports neither Flutter nor Drift**
  ([architecture.md §3.1](./architecture.md#31-layering)). This is what keeps the
  correctness-critical logic testable without a device, which matters more here than usual
  because enforcement behaviour cannot be tested automatically at all.
- **Correctness-critical code is test-first** — the timer, streak and summary computation,
  migrations, and adherence.

## 9. Risks and deferred decisions

### Risks

| # | Risk | Mitigation |
|---|---|---|
| **R1** | **Focus Assist may not be programmatically settable.** [focus-enforcement.md §4](./focus-enforcement.md#4-platform-capability-matrix) lists Windows notification suppression as ✅, citing `SHQueryUserNotificationState` — but that API only *reads* notification state, and there is no documented public API to *enable* Focus Assist. | A one-day spike opens Phase 3. Fallback: suppress the app's own notifications, detect Focus Assist state, deep-link to Settings, and warn when it is off. The capability matrix is corrected to ⚠️ in Phase 0. |
| **R2** | **Windows cannot prevent app exit at all** ([focus-enforcement.md §6](./focus-enforcement.md#6-windows)). | Accepted, not mitigated. It is the reason Tier 1 is the v1.0 ceiling. |
| **R3** | **A Windows-only app cannot suppress the phone** — the likeliest real distraction for desktop study. | Partially mitigated by the self-reported distraction button (Phase 2). Genuinely fixed only by the Android port, post-finish. |
| **R4** | **Drift's migration tooling is the single point of failure for L2.** | Schema-verification test in CI from Phase 0; the Phase 8 restore-from-old-backup test as end-to-end proof. |
| **R5** | **Strict streaks will break during a 10-week build**, which may demoralise. | The heatmap ships in the same phase as the counter (Phase 5), so the record of real work stays visible when the counter resets. |
| **R6** | **Windows local-notification support in Flutter is less mature than Android's.** | Affects routine reminders only, which are gated behind D1. |

### Deferred decisions

| # | Decision | Due | Blocks |
|---|---|---|---|
| **D1** | App residency on Windows — tray plus autostart, or launch-on-demand | Phase 6 | Routine *reminders* only, not routines |
| **D2** | Whether an interruption needs a minimum duration threshold (~10s) to be logged, per [focus-enforcement.md §10](./focus-enforcement.md#10-open-questions) | Phase 3, informed by real data | Nothing |
| **D3** | Ultra-Focus opt-in per subject | Post-finish | Nothing while Tier 1 is the ceiling |
| **D4** | Whether the server is ever built at all | After Phase 9, from actual need | Nothing |

## 10. Contradictions resolved

| Source | What it says | Resolution |
|---|---|---|
| README roadmap, v0.1.0 | Authentication belongs in Foundation | Contradicts [architecture.md §6](./architecture.md#6-key-decisions) decision 6. Auth is post-finish (decision 3). README roadmap rewritten in Phase 0. |
| README roadmap ordering | Analytics at v0.5.0, Ultra-Focus at v0.6.0 | Superseded by §7. README rewritten in Phase 0. |
| Project instructions (`CLAUDE.md`) | "No code in this repository… not yet a git repository" | Stale — a remote exists and three design documents are written. Updated in Phase 0. Note `CLAUDE.md` is git-ignored, so repo-facing decisions live here, not there. |
| focus-enforcement.md §4 | Windows notification suppression is ✅ supported | Downgraded to ⚠️. See R1. Corrected in Phase 0. |
| data-model.md §5.1 | Open question: should a missing survey block qualification? | Yes, it blocks. Decision 5. |
| data-model.md §5.2 | Suggests a grace mechanic or freeze token | Declined. Decision 5. |
| architecture.md §3.3 | Open: Riverpod or Bloc | Riverpod. Decision 2. |
| architecture.md §8 | Open: bundled audio or a streaming SDK | Local audio only. Decision 9. |
| README project structure | Lists `CONTRIBUTING.md` | Does not exist. Created in Phase 0. |
| data-model.md §3.4 | `sessions.goal_id UUID REFERENCES goals(id)` in schema v1 | **Omitted from v1** (slice 1): `goals` doesn't exist until Phase 6 and SQLite cannot attach an FK to an existing column later. Phase 6 adds column + FK together via additive `ALTER TABLE sessions ADD COLUMN goal_id TEXT REFERENCES goals(id)` — legal under §5. |
| data-model.md §3.1 | `users.email CITEXT UNIQUE NOT NULL`, `password_hash NOT NULL` | Local schema keeps both NOT NULL, seeded with sentinels (`local@device.invalid`, `''`) for the single local user (decision 4). `email` is `TEXT UNIQUE` (case-sensitive) — SQLite has no CITEXT; decide `COLLATE NOCASE` vs app-layer dedup when auth work nears (post-finish). |
| data-model.md §3.4 note | "Only `ended_at`, `actual_duration_s`, `end_reason` are ever written after creation" | Reworded (harden slice): pause bookkeeping writes `paused_duration_s`/`updated_at` while in progress; the invariant is **immutable once ended**. |
| data-model.md §3.5 | `CHECK (rating BETWEEN 1 AND 5)` on the three survey ratings | Present in schema v1 — added before the freeze after the slice-1 review caught their omission from the implementation plan (SQLite cannot add a CHECK later without a table rebuild). |

## 11. Related documents

- [architecture.md](./architecture.md) — client, server, sync model
- [data-model.md](./data-model.md) — entities, schema, derived metrics
- [focus-enforcement.md](./focus-enforcement.md) — per-platform capability matrix

## 12. Changelog

| Version | Changes | Author/Co-author |
| ------- | ------- | ---------------- |
| 1.0 | Initial masterplan — V1 post-mortem, locked decisions, migration law, routines entity, phases 0–9, risks | Claude, Isaac |
| 1.1 | §10: recorded slice-1 schema deviations (goal_id deferral, sentinel user fields, CITEXT, §3.4 wording, CHECKs) — harden slice | Claude, Isaac |
