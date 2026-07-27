# V3 — Desktop stack change: Flutter → Electron + Vue 3 + TypeScript

**Date:** 2026-07-27 · **Status:** decided by Isaac (chat, 2026-07-27) · **Supersedes:** masterplan §3 locked decision 1

**This remains build iteration V3** (decided by Isaac, 2026-07-27). An earlier revision of this document labelled the work "V4" on the reading that `CLAUDE.md`'s "increments only on a from-scratch restart" covers rewriting the client in another language. That was overturned: the masterplan, the four design documents, the frozen schema v1 and the whole phase sequence carry across untouched — only the client technology changed, and this document's own §2 calls the result "a port of proven logic, not a redesign". A stack change inside a surviving plan is not a from-scratch restart. `CLAUDE.md`'s "Currently V3" is therefore correct, not stale, and the repository name `nerdv3` matches.

**Three numbers, deliberately distinct** (extends `CLAUDE.md`'s two):

| Axis | Form | Meaning | Now |
|---|---|---|---|
| Build iteration | `V3` | Which attempt at building the app this codebase is. Increments only on a from-scratch restart. | V3 |
| Release version | `v0.*.*` | SemVer of shipped software. | v0.1.0 (pre-alpha) |
| Plan version | `P<iteration><plan><slice>` | Which revision of a plan document is in force — e.g. **P31A** = plan, V**3**, revision **1**, slice **A**. A revision made during execution increments the middle digit (P32A). | P31A |

The rewrite is sliced **V3-A … V3-D** (§7). Note that the git branch `feat/v4-electron-rewrite` and the commit subjects of `b4cd16e`, `a695f8d`, `b63d016`, `b1a1d85` still say "V4": they are published history and are left alone rather than rewritten. The branch is squash-merged and deleted at the end of the rewrite, so the name does not outlive it.

## 1. What changed and why

Isaac's decisions, taken 2026-07-27 after the trade-offs were presented:

| Question | Decision |
|---|---|
| Desktop stack | Rewrite in a web stack, chosen for "advanced / premium-ish" capability. Concrete pick delegated to me: **Electron + Vue 3 + TypeScript**. |
| Existing Flutter app | **Keep as reference only, stop maintaining.** |
| Two executables | **Two genuinely different apps** — the product, and a developer lab. |
| Sequencing | **Full rewrite in one pass.** |
| Design | The Modernist design **persists**. |
| Dart | Retained only as an option for Android later — not for desktop. |

**Why Electron over the alternatives**, given the stated criterion of a premium feel:

- The desktop apps commonly cited as premium (Linear, Notion, Slack, VS Code) are Electron. It bundles its own Chromium, so custom frameless chrome, Mica/acrylic, and 60 fps transitions are guaranteed rather than dependent on the host WebView version.
- No new language beyond TypeScript. **Tauri would give a ~5 MB executable and direct Win32 access through Rust, and Tauri v2 can also target Android** — genuinely the better engineering answer on paper — but it introduces Rust into an iteration that has already been abandoned twice. That risk is what decided it. If bundle size or native depth later dominates, Tauri is the migration target, and the layering below is deliberately arranged so the renderer would survive that move.
- Vue over Angular: lighter for a solo developer, and named first in the request.
- Win32 access for Phase 3 (focus-loss detection, always-on-top, `SetThreadExecutionState`, Focus Assist state) is reachable from Electron's main process via `koffi` FFI. No keyboard hook — masterplan decision 6 still holds.

## 2. The concern, recorded once

Masterplan decision 1 chose Flutter specifically so Windows and Android would share one codebase, calling two codebases "fatal for L5" (finishing). This change accepts:

- **A dual-codebase future** if Android is ever built in Dart, or a second rewrite if Android is later built in the new stack.
- **Discarding four merged, verified slices**: frozen schema v1, subject CRUD, the session timer with crash recovery and post-end immutability, the survey, the interruption log, the Modernist shell — 81 passing tests, and manual verification signed off the same day this decision was taken.
- **The V1 failure pattern**: a full rewrite in one pass means a long stretch with nothing runnable. Isaac chose this after the risk was stated; it is his call and is recorded here rather than silently absorbed.

**Mitigation that costs nothing:** the frozen schema and the *behaviour* of the four slices are carried across verbatim (§4), so this is a port of proven logic, not a redesign. The Flutter app stays in the tree as the executable reference for exactly that purpose.

## 3. Repository layout

```
app-flutter/           # the retired Flutter app, moved intact. Reference only:
                       # no CI, no further changes. Its tests still describe the
                       # behaviour the rewrite must reproduce.
desktop/               # the new Electron workspace (npm workspaces)
  packages/
    core/              # pure TypeScript: domain + data. No Electron, no Vue.
      src/domain/      #   ActiveSession timing state machine (port)
      src/db/          #   schema.sql (v1 verbatim), migrations, connection
      src/data/        #   subject/session/survey/interruption repositories
    ui/                # Vue 3 component library: Modernist theme + views
    app/               # nerdyapp.exe      — main + preload + renderer
    lab/               # nerdyapp-lab.exe  — developer harness
docs/                  # unchanged and still governing
```

`core` importing neither Electron nor Vue is the same rule as architecture.md §3.1 ("the domain layer imports neither Flutter nor Drift"), restated for this stack — it is what keeps the correctness-critical logic testable without a window, and what would let a future Tauri move reuse it.

## 4. What is carried across verbatim (non-negotiable)

The rewrite reproduces behaviour that was designed, reviewed and verified; it must not re-litigate it.

1. **Schema v1, unchanged** — the seven tables, nine foreign keys, six indexes, survey rating CHECKs, sync columns. Transcribed to `schema.sql` from the frozen drift definition and the committed snapshot. **Still additive-only** (masterplan §5). The existing `nerdyapp.db` must open unmodified.
2. **The session timer laws** (architecture.md §3.4): elapsed time always computed from stored timestamps, never a tick counter; state persisted on every change; crash recovery closes unterminated sessions as `end_reason='crashed'` at the last persisted write, clamped at zero.
3. **Post-end immutability** — writes to an ended session are refused at the data layer (`AND ended_at IS NULL`), not merely avoided by callers.
4. **One append-only `manual_pause` row per completed pause**, written when the pause closes, with the state cleared before the write await (spec `2026-07-26-phase-2-signal-design.md` §4.2 — this exact bug was found twice, by two separate agent passes).
5. **Survey rules**: `focus_rating` mandatory, dismissible in one interaction, two for the common path, insert-only, refused for any session that is not normally ended.
6. **The privacy line**: one writer for `interruptions`, no parameter capable of carrying app identity, `kind` validated as a bare token.
7. **The Modernist design**: `#F3F2F2` ground, `#201E1D` ink, `#EC3013` accent, zero radius everywhere, 2px section rules, Archivo, flush-left button labels. Same seven views, same real-vs-stamped-mock honesty rule.

## 5. The two executables

Per Isaac's clarification (2026-07-27): **the test build does not connect to a database at all** — it runs on example data — while the real build is the database-backed stable release.

| | `nerdyapp.exe` — the product | `nerdyapp-test.exe` — the demo/debug build |
|---|---|---|
| Data | the real SQLite file (`%APPDATA%/com.nerdyapp/nerdyapp/nerdyapp.db`) | **none — no database is opened.** An in-memory fixture set of example subjects, sessions, surveys and interruptions |
| Purpose | daily use; stable release | walk and debug the whole UX without touching real study history, and without a DB to corrupt |
| Errors | minimal and handled: user-facing failures are surfaced quietly and recoverably, never a stack trace | verbose: unhandled errors surface loudly, devtools available |
| Risk it removes | — | every UX experiment currently writes to the same real database the user's streak depends on |

**The product starts on a FRESH database** (decided by Isaac, 2026-07-27). The existing `nerdyapp.db` holds one subject and two sessions from testing — nothing worth migrating — so V3 creates its own file rather than opening the V3 one. Consequences: no import path to build, no risk to the old file, and `schema.sql` is still ported byte-faithfully (§4.1) because the *schema* remains frozen even though the *data* does not carry over. The V3 database stays on disk untouched as a fallback.

**This is the seam that makes it possible:** `core` exposes repository *interfaces*; the product binds them to SQLite, the test build binds them to an in-memory fixture implementation. Same `ui` package, same views, same design — only the binding differs. That also means the fixture implementation doubles as the test double for unit tests, and the renderer never learns which one it is talking to.

The example data is the natural home for what `mock_data.dart` held in the Flutter app, and the honesty rule carries over: anything the fixtures show that the product cannot yet do stays visibly stamped.

## 6. Test strategy

Vitest for `core` (domain + repositories against an in-memory/temp SQLite file) and for `ui` components via `@vue/test-utils`; Playwright for the handful of end-to-end flows that need a real window. The three Phase 2 exit criteria keep their teeth: the interaction budget is counted mechanically from real events (never hand-counted), `blocked` is pinned in both directions, and identity is made unrepresentable plus guarded by a source scan — the Dart versions of all three are in `app-flutter/test/` as the reference.

## 7. Consequences for the plan

- masterplan §3 decision 1 is superseded; §10 gains a row. Phases 0–2 are **re-implementation work**, not new design — their specs stand.
- CI must build and test `desktop/`; the Flutter guards (schema dump/freeze) retire with the Flutter app, so **the schema freeze needs a new enforcement mechanism in the new stack** (a checked-in `schema.sql` plus a test that the live database matches it).
- Phase 3's spike is unchanged in substance but moves to Electron main-process APIs.
- Android is deferred and unowned. Whether it is Dart (reusing `app-flutter`) or the new stack is a decision for whenever Android actually starts.
