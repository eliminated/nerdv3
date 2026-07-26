# Phase 2 — The Signal: Design Spec

**Date:** 2026-07-26 · **Status:** approved (design pass run 2026-07-26) · **Phase:** masterplan §7 Phase 2 · **Branch:** `feat/phase-2-signal`

Produced by a 10-agent design pass (4 research lenses → 3 competing designs → 3 independent judges). The winning design was "Smallest Honest Signal" (2 of 3 judges; 8.5 doc-conformance, 8 completeness). The dissenting adversarial judge found two **factually false** failure-mode claims and one **real duplicate-row bug** in that design; both are corrected here (§4.2, §7). Full agent output: `%TEMP%\claude\...\tasks\w0i4tfjkn.output` (not committed).

## 1. Goal

Make the survey and the interruption log real. The survey dialog already renders (shell slice) and discards; the `interruptions` table has no writer at all. After this slice, the app records the signal that quality-weighted streaks (Phase 5) and enforcement evaluation (Phase 3) consume.

**Exit criteria — exactly the three at masterplan.md:296-301, verbatim, no fourth invented:**
1. A widget test counts the common survey path at two interactions or fewer, and dismissal at one.
2. Interruption rows are written with the correct `kind` and `blocked = false`.
3. A test asserts `detail` never records app identity, per focus-enforcement.md §7.

## 2. Schema impact: none

`session_surveys` and `interruptions` exist in frozen schema v1. `kind` is plain `text()` with no CHECK (tables.dart:102), so `kind = 'self_reported'` extends the enum with no migration (masterplan.md:292 says so). **`schemaVersion` stays 1; no new file under `app/drift_schemas/`; no regeneration of `app/test/generated/schema*.dart`.** Any diff touching those paths is a review stop — a version bump makes `drift_dev schema dump` write a *new* file, leaving v1 byte-identical, so the CI diff guard would pass green on an undeclared change.

## 3. What is cut, and who owns it (each recorded as a doc edit, never silence)

| Cut | Owner | Recorded in |
|---|---|---|
| `idle_timeout` detection (no watcher, no threshold object, no kind constant) — `N` is specified nowhere, in-app-only detection would fire constantly for a student reading a PDF, and Win32 input APIs are Phase 3's surface. **`N` stays open.** | Phase 3 | masterplan §7 Phase 2 scope reworded, §7 Phase 3 scope gains it, §10 row |
| 90-day interruption purge (locked decision 8, currently owned by **no phase**) | Phase 8 | §7 Phase 8 scope line; retention rule + injected-cutoff testability note in data-model §3.6; architecture §5.2 note that the union-dedup rule must be retention-bounded or purged rows resurrect from a peer |
| Session-detail **screen** and any survey backfill / edit / upsert path | Phase 5 | §7 Phase 5 scope line; new deferred decision **D5** |
| A pending-survey relaunch prompt, "unrated" cards, declined-state | Phase 5 (D5) | §9 D5 |
| The D2 ~10s minimum-duration threshold — neither at write nor at display | Phase 3 | already deferred at masterplan.md:455 |

"Interruptions shown in session detail" (scope, masterplan.md:294 — no exit criterion covers it) is satisfied by **expanding a Stats history row in place**, not a screen: it describes information, not a destination. A §10 row records that Phase 1 shipped without its session-detail scope item and that Phase 5 owns the real screen. Because there is no pushed route, the back-affordance trap (a `MaterialPageRoute` covers the sidebar, and `FocusBarScreen` has no AppBar) is avoided rather than repeated.

## 4. Design decisions

### 4.1 Survey write

- **`SurveyRepository.saveSurvey({sessionId, focusRating, comprehensionRating, difficultyRating, note})`** — plain INSERT with `newId()`. Note is trimmed and stored as `null` when empty/whitespace (the dialog's field is currently a `const TextField` with no controller, so `note` is literally unreadable today — wiring Save without adding a controller would silently store null for every session).
- **No upsert.** Two verified one-way doors are recorded in data-model §3.5 so Phase 5's backfill inherits them instead of rediscovering them: (a) drift 2.34.0 defaults an upsert's conflict target to the **primary key** (`conflictTarget = target ?? table.$primaryKey`, insert.dart:349 / doc comment :54-56), and every attempt carries a fresh `newId()`, so `insertOnConflictUpdate` can never fire on `session_id` and SQLITE_CONSTRAINT_UNIQUE still throws — any future backfill needs an explicit `target: [sessionId]`; (b) `session_id` is UNIQUE at column level (tables.dart:82), so SQLite's implicit unique index counts tombstones — **a soft-deleted survey permanently blocks re-rating that session**, and the freeze forbids dropping a UNIQUE constraint, so surveys must never be soft-deleted.
- **Session-state guard (grafted from Designs 2/3, endorsed by 2 judges).** Inside one transaction, read the target session and refuse — throw, write nothing — unless `ended_at IS NOT NULL AND end_reason IN ('completed','user_ended') AND deleted_at IS NULL`. Reason: data-model.md:282's `avg_focus_rating` clause carries no `end_reason` filter, so a survey attached to a crashed session could drag a day whose real sessions averaged 4 below the 3.0 threshold. Doing the read inside the insert's transaction is also what stops it racing `recoverCrashedSessions()`. Ratings are validated Dart-side (not relying on the CHECKs) because production surfaces constraint errors as `DriftRemoteException` (`NativeDatabase.createInBackground`, database.dart:42) while tests see raw `SqliteException`.
- **The dialog pops a value; the flow writes.** `SurveyResult` in survey_dialog.dart; Save pops it, Skip pops null; `startSessionFlow` performs the write. This is the repo's established idiom twice over (`ModePromptDialog` pops a String; `SubjectsView` round-trips `SubjectDraft`), and it keeps the dialog free of Riverpod/Drift so the interaction-count test needs no ProviderScope.
- **Session id:** `SessionController.start` becomes `Future<String> start(...)` returning `session.id`, captured by `startSessionFlow`. Purely additive; touches neither the `identical(state, s)` guard nor the `state?.id == s.id` guard. Rejected alternatives: `ref.read(...)!.id` (end() nulls state), a `lastEndedSessionId` field (touches the race guards), newest-session query (nondeterministic).
- **The write is wrapped in `try / catch (Object)` with a `ScaffoldMessenger` failure surface**, catch deliberately untyped, with the DriftRemoteException-vs-SqliteException reason in a comment at the catch. Both `startSessionFlow` call sites are fire-and-forget (today_view.dart:156, subjects_view.dart:201), so an uncaught throw is an invisible lost survey — and the §4.1 guard makes throwing reachable by construction.
- **Guard against surveying a still-running session:** `if (ref.read(sessionControllerProvider) != null) return;` between the route pop and `showDialog`. `FocusBarScreen` has no AppBar but a `MaterialPageRoute` still pops to a system back gesture; without this, Phase 2 would write a survey for a session that later recovers as `crashed`.
- **`_saving` latch** disables both dialog buttons while a pop is in flight — the hazard is not the duplicate write but the second pop unwinding the caller's route beneath the dialog.

### 4.2 Interruption writes — one row per completed pause, append-only

`interruptions` is an append-only event log (data-model.md:198) and it is the **only** entity whose sync strategy is "Union, deduped by id" with no last-write-wins fallback (architecture.md:147). Mutable rows would make that resolution arbitrary once sync exists, so **insert-at-pause-then-UPDATE-duration is rejected** (both losing designs proposed it and rewrote the doc to fit). A `manual_pause` row is therefore written **once, when the pause ends**, with `occurred_at = pauseStartedAt` and `duration_s = max(0, span.inSeconds)` (clamped — `DateTime.now()` is not monotonic; the clamp matches recovery's convention at session_repository.dart:89).

A pause ends either by resume or by the session ending while paused, so there are two call sites — and **that is where the winning design had a real bug.** Its `end()` gated the log on the *stale snapshot* `s.isPaused` captured before the `await`. Verified failing sequence: with a paused session, fire `togglePause()` then `end()`; togglePause's `updatePausedDuration` is enqueued first and resolves first, its `identical(state, s)` recheck still holds, so it logs row #1 and sets state to running; `endSession` then resolves and `end()` evaluates its stale `s.isPaused` as still true, logging row #2 with the same `occurred_at`. **Two rows for one pause.**

Corrected placement:

```dart
// togglePause: log only when THIS transition took effect, and only on the resume leg.
final now = _now();
final next = s.isPaused ? s.resume(now) : s.pause(now);
await ref.read(sessionRepositoryProvider).updatePausedDuration(next.id, next.accumulatedPause);
if (!identical(state, s)) return;   // existing race guard
state = next;
if (s.isPaused) {                   // s was paused => this was a RESUME => the pause just closed
  await ref.read(interruptionRepositoryProvider)
      .logPause(sessionId: s.id, pauseStartedAt: s.pauseStartedAt!, resumedAt: now);
}

// end(): decide from LIVE state read after the await, never the pre-await
// snapshot — and clear state BEFORE awaiting the log.
await ref.read(sessionRepositoryProvider).endSession(...);
final live = state;
if (live == null || live.id != s.id) return;
state = null;
if (live.isPaused) {
  await ref.read(interruptionRepositoryProvider)
      .logPause(sessionId: s.id, pauseStartedAt: live.pauseStartedAt!, resumedAt: now);
}
```

**The `state = null` placement is load-bearing, and this spec's first draft got it wrong — caught by the post-implementation adversarial review, not by the tests.** With the clear *after* the log await, `end()` stays suspended inside the insert while `state` still holds the paused session, so a racing Resume (End enqueued first) or a second End reaches its own post-await continuation, sees a paused session, and logs the same pause again: **two rows for one pause**, in the very case the original text claimed was safe. It also wedged the controller on a throwing insert, since `state = null` would never run. Both orderings are now covered (`an end racing a resume…`, `two ends racing while paused…`), and the original claim of exhaustiveness is a reminder that tracing orderings by hand is not proof.

With the clear hoisted, every ordering yields exactly one row: resume-wins → resume logs, `end()` sees live state running and skips; end-wins → `end()` clears, then logs, and the racing resume returns early at its identity guard; second End → returns at `live == null`; pause-racing-end (the existing race test, where `end()` is enqueued first and resolves first) → `end()` sees live state *running* and logs nothing, the pause returns early: **zero rows**, which is correct for a pause that never took effect.

The same hazard exists one layer up in the UI: two activations of **End session** (fast double-click, or Enter autorepeat while the button holds focus) both pass `end()`'s entry check, and the second `Navigator.pop` — resolved with `lastWhere(isPresent)` once the first pop is already `popping` — takes the route *beneath* the focus bar, unwinding the shell and losing the survey entirely. `FocusBarScreen` therefore latches the button (`_ending`).

Not transactional with the sessions write: a failing insert leaves the session correctly ended with a missing log row — the same already-accepted outcome as a crash — whereas wrapping it means editing a correctness-critical guarded path for a strictly lesser failure mode. Accepted and documented: a process kill *while paused* logs no row at all (that session closes `crashed` and data-model.md:283 excludes it from qualification, so its log has no consumer).

**`blocked` must be load-bearing.** `blocked` is `boolean().withDefault(const Constant(false))` (tables.dart:105), so `expect(row.blocked, isFalse)` passes even on production code that never mentions the column — half of exit criterion 2 would be unfalsifiable. The repository therefore exposes one generic writer used by Phase 3 as well:

```dart
Future<void> logSessionEvent({required String sessionId, required String kind,
    required DateTime occurredAt, int? durationS, bool blocked = false})
```
with `logPause` / `logSelfReport` as thin wrappers passing `blocked: false` explicitly, and a test asserting a `blocked: true` row round-trips true. **No method takes a `detail` parameter, and the file must never contain the string `detail`.**

### 4.3 Self-report button

One bare tap on `FocusBarScreen`: `kind='self_reported'`, `blocked=false`, `duration_s=NULL`, `detail=NULL`. **No chooser, no free text** — masterplan.md:291 says "one-tap", a chooser costs a second interaction, and free text invites the user to type an app name, which is exactly the identity data-model.md:222-224 forbids and no test could constrain. It does **not** pause the session (pausing would double-log as `manual_pause` and touch the frozen pause arithmetic). Free-form reflection already has a home the privacy line does not govern: `session_surveys.note`. A faint live count of this session's self-reports sits beside the button — the cheapest honest proof-of-write, and the only in-session reader (L3: a slice ends in a *usable* app).

### 4.4 Logged in all sessions, not only focused ones

focus-enforcement.md:165 currently opens "Every enforcement event writes an `interruptions` row". Focused mode does not exist until Phase 3, so under that reading exit criterion 2 is unsatisfiable in Phase 2. The sentence is reworded to cover session events in all modes, and a `self_reported` row is added to the §7 table (blocked false, duration_s NULL, detail NULL). §7 also wants a cross-mode comparison, which needs a plain-mode baseline that only exists if Phase 2 logs unconditionally.

### 4.5 Exit criterion 3 — make identity unrepresentable, then guard the chokepoint

`expect(row.detail, isNull)` is a tautology: Phase 2 has no window-title source, so it passes on code that *could not* leak identity and never executes the Phase 3 `app_switch` writer that actually risks the violation — masterplan.md:66 names this exact class as V2's most expensive lesson. Instead:

- No `detail` parameter anywhere in `InterruptionRepository`'s API, so Phase 3's first identity write must be a deliberate signature widening inside a privacy-named file.
- **`kind` is validated as a bare token** (`^[a-z_]+$`, thrown not asserted). The review found that without this, identity could be smuggled through the *discriminator* instead — `logSessionEvent(kind: 'app_switch:chrome.exe')` would persist a filename while every `detail`-shaped guard stayed green. All seven documented kinds pass.
- `app/test/core/db/write_confinement_test.dart` asserts (i) no file under `lib/` **reaches** the table except the owner (write) and one exact-path reader (`session_repository.dart`), (ii) the text of `interruption_repository.dart` never contains `detail`, (iii) an anti-vacuity floor on files scanned. **The review found the original write-syntax regex bypassable** — generated drift managers (`db.managers.interruptions.create`), companions built elsewhere, batched writes, and raw `customStatement` SQL all evaded it, and a probe confirmed that anchoring raw SQL on `customStatement(` misses SQL held in a variable. The guard now forbids *reaching* the table (drift-object access anchored on a `…db`/`database`/`managers` receiver, plus SQL-shaped text naming the table anywhere in the file), which is syntax-agnostic. Both bypasses were probed red and reverted. **The floor is `> 20`, not `> 40`: `app/lib` contains 27 `.dart` files (26 after skipping `*.g.dart`), so `> 40` would be red on day one for the wrong reason and the fastest "fix" would be deleting the assertion.** The scan must be **seen red once** by temporarily adding an offending insert, per the standing rule.
- Rejected: a `detail` allowlist / `InterruptionDetail` enum / validator — with no Phase 2 members the "every value passes" case asserts nothing, "Discord throws" is trivially true of any unlisted string, and an allowlist entry named `discord` is exactly as easy to add as a raw parameter.
- **`mockMutedApps` must go.** focus_bar.dart:140-156 currently promises per-app notification counts — precisely the identity logging the privacy line forbids — under a "planned · phase 3" stamp. The slice that installs the privacy guard must stop the UI promising the opposite (shell spec §1 decision 3). It is reshaped into an identity-free `mockHeldBack` (kind + count, e.g. "notifications · 13") and **both** render sites updated: focus_bar.dart:148 **and** today_view.dart:295-313 (`m.app` at :306, `m.count` at :309) — changing the record shape without touching today_view breaks the build.

### 4.6 The interaction budget, counted mechanically

masterplan.md:297-298, masterplan.md:290 and data-model.md:184-186 state the budget three different ways and none defines the boundary. A hand-counted test is a restatement of its own taps, so `app/test/support/interaction_counter.dart` counts `PointerDownEvent` via `GestureBinding.instance.pointerRouter.addGlobalRoute` and `KeyDownEvent` via `HardwareKeyboard.instance.addHandler`, both removed in `addTearDown`. The window opens when the dialog is visible and excludes the End-session tap that summons it. Consuming tests assert **exact** equality (2, 1, 0) — never `lessThanOrEqualTo`, so "fixing" a red budget by adding a tap stays red.

**The probe test must use `tester.sendKeyEvent`, not `tester.enterText`.** Verified in the SDK (widget_tester.dart:1158-1163): `enterText` calls `showKeyboard` then `testTextInput.enterText`, dispatching **neither** a `PointerDownEvent` nor a `KeyDownEvent` — all three candidate designs asserted that `enterText` raises the count, which would make the one test whose job is to prove the harness isn't silently zero go red for an unrelated reason.

### 4.7 Keyboard operation of the survey (grafted, endorsed by 2 judges)

`Focus(autofocus: true)` on the dialog root: digits 1–5 set `focus_rating`, Enter saves when a rating exists, Escape dismisses — with the handler returning `KeyEventResult.ignored` whenever the note's `FocusNode` has focus. Same two-interaction cost by the same mechanical measure, and the note gate closes a real corruption path: raw key events bubble to ancestor `Focus` handlers even while `EditableText` holds focus, so an ungated handler lets a `4` typed into a note silently set the mandatory rating. Tested with `sendKeyEvent` (an `enterText`-driven test could not see it either way).

## 5. Reader: inline expansion in Stats

`SessionRepository` gains `class SessionDetailView` beside `HistoryEntry` and `Future<SessionDetailView> loadSessionDetail(String sessionId)` returning the nullable survey fields plus the interruption list ordered `occurred_at ASC, id ASC`. The id tiebreak is required because drift stores `DateTime` as epoch **seconds** and `newId()` is UUIDv7 (lexicographically time-ordered), so same-second rows would otherwise sort arbitrarily; it is tested **deterministically** with two rows sharing one `occurred_at` inserted in reverse id order (an "intermittent red" test can pass a whole CI run over a broken ordering).

Each Stats history row becomes a Key-addressable `InkWell` toggling an inline expansion (no route, no screen) rendering survey ratings or an explicit "No survey" state — never a zero, which would later read as a real bad rating — plus interruptions by human label ("Paused", "Distraction"). Fetched via `FutureBuilder` on first expand; deliberately no `FutureProvider.family`, which is not on the verified-Riverpod list.

## 6. Phase 2 computes nothing (negative test)

`daily_summaries` already exists in schema v1 with `avg_focus_rating` and `qualified`, so nothing but discipline stops this slice writing to it. A test asserts that after the full flow the `daily_summaries` table is **empty** and the Stats aggregate block is still wrapped in `MockStamp(label: 'planned · phase 5')`. It goes red the moment anyone wires streak/average computation or promotes the mocked "Focus quality 4.2 / 5" cell. Phase 5 owns that.

## 7. Corrections applied to the winning design (recorded so they are not reintroduced)

1. **Duplicate `manual_pause` row** on the resume-racing-end ordering — fixed by reading live state in `end()` (§4.2). The design's claim that "tracing all four orderings yields exactly one row in every case" was false.
2. **False failure mode:** the design's test "a pause that lost the race to end() writes no interruption" claimed that moving the insert above the identity recheck turns it red. It cannot: the existing race test (session_controller_test.dart:56-69) starts a session and never pauses, so the racing `togglePause` takes the **pause** branch, which never logs under this design either way. Replaced by a **resume**-racing-end test that asserts exactly one row, whose stated failure mode (gating on the stale snapshot) is verified true.
3. **False failure mode:** `enterText` raising the interaction count (§4.6) — replaced with `sendKeyEvent`.
4. **Impossible assertion:** `scannedCount > 40` (§4.5) — 27 files exist; floor lowered and the scan must be seen red once.
5. **Unfalsifiable half of criterion 2:** `blocked` — generic writer plus a `blocked: true` round-trip case (§4.2).
6. **Missing reachable-failure handling:** untyped catch + SnackBar around the survey write (§4.1).
7. **Untested latch:** double-tap-Save test asserting one row, no exception, and that the caller's route survives (§4.1).
8. **Wrong rationale to avoid calendar-day arithmetic:** `users.timezone`, `users.day_start_hour` and `daily_summaries.local_date` already exist in schema v1 — Phase 5 owns the *semantics*, not the columns. The durable reason is the drift gotcha: writes go through `.toUtc()` while reads come back **local**, so any `.day` comparison installs a second, wrong definition of "today". D5 is recorded as a **duration** window, never a calendar day.

## 7a. Post-implementation adversarial review (24 agents, 2026-07-26)

Run against the implemented branch. 15 findings survived verification, 5 were refuted. What it changed:

| # | Finding | Fix |
|---|---|---|
| 1 | **`end()` double-logged one pause** in two untested orderings (End-then-Resume, End-then-End while paused) because `state = null` sat after the log `await` — falsifying §4.2's own exhaustiveness claim | Clear state before the await; two new race tests |
| 2 | **Double-tapping End session could unwind the shell** and lose the survey entirely (second `pop` targets the route beneath once the first is `popping`) | `_ending` latch on the button |
| 3 | **Identity was representable through `kind`** (`'app_switch:chrome.exe'`), which no `detail`-shaped guard could see | bare-token validation, with a test over five smuggling attempts and all seven legal kinds |
| 4 | **Write-confinement regex bypassable** four ways (drift managers, companions, batches, raw SQL — the last even when anchored on `customStatement(`, proven by probe) | forbid *reaching* the table; both bypasses probed red |
| 5 | **Dismissal-at-one never asserted the dialog closed** — a "really skip?" confirmation would have kept every assertion green | `findsNothing` with `skipOffstage: false` |
| 6 | **Nothing pinned that a rating must be chosen** — a defaulted `focus_rating` would write neutral sentinel rows that quietly qualify days | new test: Save inert with no rating, table empty |
| 7 | `expect(counter.count, 0)` **could not fail** (counter attached after the taps it claimed to bound) | attach before the End tap; assert exactly 1 |
| 8 | Enter saved even while **Skip held focus**, so a deliberate skip could save | gate the shortcut on the dialog root holding primary focus |
| 9 | README stated the 90-day purge as **already implemented**, inside the privacy commitment | reworded to specified-but-unimplemented, Phase 8 owns it; README changelog row 1.5 |

Refuted (and why they were not changed) and the full transcript live in the run output; the four the review confirmed as genuinely sound were the interaction counter (verified against the SDK's dispatch path), criterion 2's both-branch `blocked` pinning, the in-transaction survey guard, and the schema freeze.

## 8. Doc edits (each an explicit deliverable)

- **masterplan.md** — §7 Phase 2 scope drops `idle_timeout` and rewords the session-detail line to the inline reader; §7 Phase 3 gains `idle_timeout` (N still open); §7 Phase 5 gains the session-detail screen + survey backfill; §7 Phase 8 gains the 90-day purge; §9 gains **D5**; §10 gains four rows (Phase 1 shipped without session detail; Phase 2 defers idle_timeout; Phase 2 logs in all modes; Phase 2 surveys are insert-only); **§12 changelog row 1.2** (the table's own requirement — precedent row 1.1 exists for exactly this class of edit).
- **data-model.md** — delete the §5.1 neutral-3.0 blockquote and the §5.2 grace-token blockquote, replacing both with the strict rule inline plus a pointer to masterplan decision 5 (two live contradictory texts is the two-way-resolvable defect class the V2 post-mortem warns about); state §5.1's averaging explicitly (over surveyed sessions only) and note `avg_focus_rating` must filter `end_reason` so a crashed session cannot drag a day below 3.0; §3.5 gains the two upsert/soft-delete one-way doors; §3.6 gains `self_reported`, the crash-while-paused limitation, and the hard-DELETE retention rule with the injected-cutoff testability note.
- **focus-enforcement.md** — §7 opening sentence reworded to all session events; `self_reported` row added; note that `idle_timeout` arrives in Phase 3 with `N` unfixed.
- **architecture.md** — §5.2: the interruptions union-dedup rule must be retention-bounded once sync exists.
- **Shell spec** (2026-07-26-ui-shell-design.md) — §2 non-goals and §6.4 both claim no survey persistence; §5 misstates what Stats renders; add a §9 row for the today_view held-back panel.
- **CHANGELOG.md** — the "marked records in Phase 2" line is now false.
- **README.md** — feature rows and roadmap checkbox for survey/interruptions, Privacy TODO; **requires a new README-changelog row 1.4** (project-instruction hard requirement).
- **HANDOFF.md** — LATEST block + Future slices, **and the file must be `git add`ed: it is untracked, not ignored**, so the continuity doc currently exists only on one machine while plans and specs are committed.
- **Stale on-screen copy** — survey_dialog.dart's "RECORDS IN PHASE 2" kicker and its skip line; **stats_view.dart:36** ("Recent sessions are real. Aggregates arrive with Phase 5.") now understates what is real, which is the same defect class as overstating.
- **session_flow_test.dart:62** asserts `find.textContaining('RECORDS IN PHASE 2')` — must be **rewritten into a persistence assertion**, not deleted.

## 9. Verification (a phase is not done until run and seen — masterplan.md:423-426)

Automated: `flutter analyze` clean; full suite green; `flutter build windows --release` succeeds; the write-confinement scan seen red once and reverted; the interaction-counter probe run first.

Manual, and **explicitly blocking the phase** (all three currently owed, per the HANDOFF LATEST block — Phase 2 cannot be declared done while they are unrun, because masterplan.md:423 allows one phase in flight at a time):
1. Phase 1: crash-recovery kill test (pause first) and the one-hour wall-clock accuracy check.
2. Shell spec §8 UX walkthrough.
3. New: rate a real session at the keyboard (digits + Enter), skip one, tap the distraction button twice, then expand both rows in Stats. The interaction budget measured in synthetic `PointerDownEvent`s is not a human's journey across a 560px dialog.

## 10. Accepted risks

- **Largest:** a skipped survey, or a process kill between End and Save, permanently destroys that day under strict streaks — `session_id` is UNIQUE and this slice ships no backfill, edit path or relaunch prompt. This is R5 realised; recorded as **D5**, due Phase 5.
- A process kill while paused logs no `manual_pause` row (nothing to flush at resume).
- The interruption insert is not transactional with the sessions write.
- Idle seconds continue to land in `actual_duration_s`, which data-model.md:153-154 itself calls dishonest, until Phase 3.
- Criterion 3's guarantee is procedural: a contributor who edits the privacy test can still leak identity. The substantive test arrives in Phase 3 when there is real identity to withhold.
- Pre-existing, unfixed: popping the FocusBar route by system back leaves the session running with no way back to it. This slice only stops the survey firing in that state.
