# UI Shell ("Modernist") — Design Spec

**Date:** 2026-07-26 · **Status:** approved by Isaac (chat, 2026-07-26) · **Source:** `NerdyApp Study Companion Design.zip` (Claude Design bundle, kept at repo root as the visual reference)

## 1. What this is

Replace the placeholder UI (subject list → timer screen → history screen) with the proposed
desktop shell so the full UX can be tested in the real app: a collapsible icon sidebar, the
"Modernist" design language, and one view per navigation entry. Real features render real data;
everything not yet built renders as a **clearly stamped mock**. This is presentation-layer work:
**zero schema changes, no timer/repository arithmetic changes** — the correctness core shipped in
`a42b180` stays untouched (one additive exception: a `mode` parameter threaded through session
start, §6).

Decisions taken with Isaac (2026-07-26), each after options were presented:

1. **Full shell, mock the rest** — the whole sidebar shell lands now; unbuilt views ship as
   static stamped mocks so the complete UX is walkable.
2. **Gamification (XP/levels/badges): mock now, decide later.** No schema or masterplan
   commitment; panels render placeholder data. A dedicated design decision happens when (if) a
   gamification phase is added — additive-only migration law makes deferral safe.
3. **Locked-out features are shown but stamped "planned".** Cloud account/sync (no server
   pre-1.0, masterplan decision 3) and Ultra Focus hard lock (Tier 1 is the v1.0 ceiling,
   decision 6) stay visible in the UX but visibly marked, and copy describes only what Tier 1
   actually does. The UI never claims a capability the app lacks.
4. **The post-session survey is designed INTO this shell** (the mockup omitted it — a defect,
   since the survey is the core signal). It renders and is dismissible now, stamped "records in
   Phase 2"; Phase 2 wires persistence into an already-tested UX.
5. **This becomes the app UI** via the normal slice workflow (branch → PR → squash merge). No
   prototype branch, no toggle.

## 2. Non-goals (this slice)

- No custom window chrome / drawn title bar (approach A chosen; `window_manager` deferred to
  Phase 3/9 when borderless fullscreen earns it). Native Windows title bar stays.
- No onboarding (Phase 9 owns it; the design bundle is its reference).
- No survey persistence (Phase 2), no interruption log (Phase 2), no planned-session entity
  (deferred decision), no OS-level focus enforcement (Phase 3).
- No schema change of any kind.

## 3. Design language — "Modernist" tokens → Flutter

From the bundle's design system (`_ds/modernist-*/readme.md`, `styles.css`):

| Token | Value | Flutter mapping |
|---|---|---|
| Ground | `#F3F2F2` | `scaffoldBackgroundColor`, `colorScheme.surface` |
| Ink | `#201E1D` | `colorScheme.onSurface`, default text |
| Accent | `#EC3013` | `colorScheme.primary`; accent-700 `#9E2411` for accent text on ground |
| Divider | ink | 2px rules between major sections (`Divider(thickness: 2)` / `Border`), 1px hairlines inside lists |
| Radius | **0 everywhere** | every shape in `ThemeData` gets `RoundedRectangleBorder(borderRadius: BorderRadius.zero)` |
| Type | Archivo (headings 800, body 400/600) | bundled TTF assets (OFL); `fontFamily: 'Archivo'` |
| Buttons | labels flush left, primary = solid accent fill | `alignment: Alignment.centerLeft` on button styles |
| Kickers | 10–11px, letter-spaced, uppercase | shared `TextStyle` constant |

Subject marker palette switches to the design's flat swatches. Focus ring / hover tints derive
from the accent ramp; disabled = 45% opacity. No shadows except dialogs/toasts.

## 4. Architecture

```
app/lib/core/theme/modernist.dart      # ThemeData + token constants (single source)
app/assets/fonts/Archivo-*.ttf         # Regular, SemiBold, ExtraBold (OFL)
app/lib/core/shell/app_shell.dart      # sidebar + view switcher + status bar
app/lib/core/shell/mock_stamp.dart     # the "MOCK / PLANNED" stamp widget + mock section scaffold
app/lib/core/mock/mock_data.dart       # ALL placeholder content lives here, nowhere else
app/lib/features/today/presentation/today_view.dart
app/lib/features/subjects/presentation/subjects_view.dart      # replaces subject_list_screen
app/lib/features/schedule/presentation/schedule_view.dart      # full mock
app/lib/features/stats/presentation/stats_view.dart            # real history + mock panels
app/lib/features/goals/presentation/goals_view.dart            # full mock
app/lib/features/library/presentation/library_view.dart        # full mock
app/lib/features/settings/presentation/settings_view.dart      # backup (real) + stamped cards
app/lib/features/session/presentation/mode_prompt.dart         # Normal/Focus/Ultra chooser
app/lib/features/session/presentation/focus_bar.dart           # in-session overlay (replaces session_screen)
app/lib/features/session/presentation/survey_dialog.dart       # post-session survey (mock persistence)
```

Navigation: `AppShell` holds a `NotifierProvider<ShellNav, int>` view index (same Notifier
pattern as `showArchivedProvider`); no router package. Sidebar collapse is a second bool
notifier. The old `subject_list_screen.dart`, `session_screen.dart`, `history_screen.dart` are
deleted once their replacements' tests pass (shared pieces — `formatDuration`, the subject
dialog, `SubjectDraft`, palette — move with them).

**Mock rule:** placeholder content imports only from `core/mock/mock_data.dart`, and every mock
region is wrapped by the stamp widget (`MockStamp(label: 'PLANNED · PHASE 5')`). Grep for
`mock_data.dart` = complete inventory of what isn't real.

## 5. Views

| View | Real | Mock (stamped) |
|---|---|---|
| Today | date header; "Start a session" card (subject picker → mode prompt); active-subjects count | streak/week/XP stat strip; "up next" schedule card; rest-of-today list; badges; muted apps |
| Subjects | card grid from `watchSubjects` (name, colour swatch, source line, edit/archive/delete via dialog + menu); archived table with real Restore; "+ Add a subject" cell | per-subject level tag; weekly-target progress bar; topics chips; derived 3-letter code |
| Schedule | — | entire week grid, headers, session blocks |
| Stats & Streaks | "Recent sessions" table = real `watchHistory` (duration, started, `· crashed` marker) | stat strip, 14-day chart, split-by-subject, emergency-exit log |
| Goals | — | weekly targets, milestones, badges |
| Library | — | material table |
| Settings | Back up database (moved from old AppBar, same `backupDatabase` path) | local-vault/cloud cards (cloud stamped POST-1.0), appearance, focus prefs, Ultra config (stamped PLANNED), danger zone |

## 6. Session flow (the UX under test)

1. **Start** (Today card or subject card) → **mode prompt** dialog: *Normal* and *Focus* are
   selectable; *Ultra* row renders as designed but disabled, stamped "PLANNED — Tier 1 ships
   first" with honest Tier-1 copy. Cancel = "Not now".
2. Choosing a mode starts the real session. **Additive code change:** `SessionController.start`
   and `SessionRepository.insertStartedSession` gain a `mode` parameter (`'plain'` | `'focused'`;
   the column has existed since schema v1 and was hardcoded `'plain'`). `ActiveSession` gains a
   `mode` field carried through pause/resume (pure data, no arithmetic change).
3. **In session:** the focus-bar layout from the design (large tabular timer, subject line,
   progress area, Pause/Resume + End buttons) rendered as a full-screen route within the window.
   Held-notifications row is stamped mock. Timer display continues to tick via repaint only —
   elapsed always computed from timestamps (unchanged law).
4. **End** → `SessionController.end()` (unchanged) → **survey dialog**: focus rating 1–5
   required to submit, comprehension/difficulty/note optional; one interaction to dismiss
   ("Skip"), two for the common path (tap rating → Save). Stamped "RECORDS IN PHASE 2"; both
   buttons only close the dialog this slice.
5. Crash recovery, immutability guards, pause persistence: untouched and still covered by their
   existing tests.

## 7. Testing

- **Theme unit test:** token values on the built `ThemeData` (zero radius on every shape theme,
  accent primary, Archivo family) — fails if the theme regresses to Material defaults.
- **Shell widget test:** each sidebar destination shows its view; mock views carry at least one
  `MockStamp`; collapse toggle hides labels.
- **Subjects view tests:** adapted from `subject_list_screen_test.dart` — create/edit/archive
  (archived table + Restore)/delete against the card grid.
- **Session flow test:** subject → mode prompt → choose Focus → row persisted with
  `mode='focused'` → focus bar shows → End → survey dialog appears → Skip dismisses (one tap).
  Repo test: `insertStartedSession` records the passed mode; existing tests keep `'plain'` green.
- Existing session/schema/backup tests must stay green unmodified (except imports where screens
  moved).

## 8. Exit criteria

- `flutter analyze` clean; full test suite green; Windows release build succeeds.
- Isaac walks the UX: navigate all seven views, run a real Focus session end-to-end (prompt →
  timer → pause → end → survey → history shows it in Stats), create/edit/archive/restore/delete
  a subject, back up from Settings. Every mock he sees carries a stamp.

## 9. Deferred decisions (recorded so they are not re-litigated ad hoc)

| # | Decision | Blocked on / due |
|---|---|---|
| U1 | Gamification (XP, levels, badges, penalties) — adopt, adapt, or drop | Dedicated design session; additive tables if adopted |
| U2 | `subjects.code` and `subjects.weekly_target` additive columns | First phase that needs them real (Goals/Stats); until then derived/mocked |
| U3 | Planned-session entity (Schedule view, "up next", repeats) | Post-Phase-2 design session; relates to Phase 6 routines — must not duplicate them |
| U4 | Custom window chrome (`window_manager`) + borderless fullscreen | Phase 3 needs fullscreen anyway; adopt there |
| U5 | Cloud account/sync UI | Post-1.0 (masterplan decision 3) |
| U6 | Ultra Focus tiering & emergency-exit economy | Post-finish, evidence-gated (focus-enforcement.md §10); UI stays stamped |
| U7 | Library / material attachments | Not in v1.0 roadmap; revisit at Phase 7 |
| U8 | Design-bundle "measured, not self-reported" stance vs survey-centric masterplan | Resolved in favour of the survey (decision 4 above); Stats copy must not disparage self-report |
