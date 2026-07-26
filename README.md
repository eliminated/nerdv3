# NerdyApp Companion

> A study companion that helps learners hold focus, stay consistent, and see the work they actually did.

**Build iteration: V3** · **Release version: v0.1.0 (pre-alpha)** · **Status: in development**

<!-- TODO: add badges once the repo is public — build status, license, release -->

---

## Table of contents

- [Overview](#overview)
- [About "V3"](#about-v3)
- [Challenges this addresses](#challenges-this-addresses)
- [Features](#features)
- [Who it serves](#who-it-serves)
- [Tech stack](#tech-stack)
- [Focus enforcement — platform reality](#focus-enforcement--platform-reality)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Roadmap](#roadmap)
- [Development workflow](#development-workflow)
- [Privacy](#privacy)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

---

## Overview

NerdyApp is a study companion built for students and self-directed learners. It helps you hold your attention on one thing at a time, keep a study habit alive past the first week, and see real progress in the subjects you care about.

It isn't tied to a school timetable. Whether you're revising for a university exam, working through a Udemy course, or teaching yourself something with no syllabus at all, NerdyApp treats it the same way: a goal, a plan, and a record of the work you actually did.

## About "V3"

This project tracks two separate numbers. They are not the same thing.

| | What it means | Current |
|---|---|---|
| **Build iteration** | Which attempt at building this app the codebase represents. Increments only when the project is restarted from scratch. | **V3** |
| **Release version** | Standard [SemVer](https://semver.org/) version of the shipped software. | **v0.1.0** |

**V3** means this is the third attempt at making NerdyApp functional and usable — not a sequel to a released product. Nothing has shipped publicly yet. If this iteration is abandoned and restarted, the next one becomes V4, while the release version resets accordingly.

### Iteration history

| Iteration | Period | Outcome | Lessons carried forward |
|---|---|---|---|
| V1 | — 2026 | Abandoned. Focus enforcement, session-timer correctness and offline sync were all in flight before any one of them worked. Separately, unreliable migrations corrupted the database roughly weekly, so it had to be wiped and rebuilt — no continuous record of real use ever accumulated. | One hard problem in flight at a time. Lock the schema before feature code; make migrations additive-only and tested. |
| V2 | 2026 | Abandoned mid-foundation. **Not a technical failure** — see the post-mortem below. | Match process weight to risk. Keep progress visible. Stress-test the plan before implementing it, not during. |
| V3 | 2026 – present | In progress | — |

#### V2 post-mortem

Honesty is the point here. A post-mortem that flatters the decision is worthless to V4.

**What actually got built.** V2 reached 6 of 10 foundation tasks and 3 of Phase 0's 4 exit
criteria. Working at the moment it was abandoned: a Flutter Windows app, CI green on
`windows-latest`, a frozen SQLite schema (7 tables, 8 foreign keys, 6 indexes), a migration
harness whose guards were *demonstrated* capable of failing, a transaction-safe local-user
bootstrap, and a subject repository — 24 passing tests. None of it was broken.

**Why it was abandoned.** Velocity and confidence, not correctness. Execution ran roughly four
agent round-trips per task — implement, review, fix, re-review — at about 40 minutes each, so a
ten-task phase implied something near seven hours. Progress was invisible between round-trips,
so it read as stalling rather than converging.
Slow progress, and slow harvest. No production quality at all. 

**The uncomfortable finding.** Every defect the reviews caught was in the *plan*, not in the
implementations: a foreign key SQLite could never add after the schema freeze; a schema-guard
test that compared a snapshot against itself and could never fail; a hole that let an additive
change plus a version bump pass both guards; a non-atomic bootstrap; and four assertions that
passed whether the code was right or wrong. The plan was written assuming its own correctness,
and that assumption was paid for later, at review prices.

**What V3 should change.** The design was not the problem, and it carries forward intact. Change
the *execution*: review in proportion to risk (deep on schema and migrations, light on docs and
UI), smaller phases whose completion is reachable in one sitting, and a plan stress-tested
before implementation rather than during it.

<!-- Keep this table honest as iterations accumulate. Recording what worked, not only what
     failed, is what stops the next attempt discarding something that was fine. -->

## Challenges this addresses

- **Focus breaks within minutes**, and getting back into a locked-in state is hard.
- **Consistency collapses after a few days**, and there's no visible cost to stopping.
- **Progress is invisible**, so the effort feels wasted.
- **Most capable study tools are institution-bound** — tied to a school account, a course platform, or a usage quota.

## Features

Legend: ✅ Shipped · 🔨 In progress · 📋 Planned · 💡 Idea

| Feature | Description | Status |
|---|---|---|
| **Session timer** | The core loop: pick a subject, start a session, log the work. | ✅ Shipped (start/pause/end + history; crash recovery 🔨) |
| **Focused mode** | Light-touch session mode — suppresses notifications and reduces on-screen distraction. | 📋 Planned |
| **Ultra-Focus mode** | Hard lockdown. Blocks app switching and exit attempts, suppresses all notifications, and keeps you inside the app with built-in companion tools. See [platform reality](#focus-enforcement--platform-reality). | 📋 Planned |
| **Post-session survey** | Short check-in after each session rating focus quality and difficulty. Feeds streak quality and topic evaluation — this is the app's core signal, not a side feature. | 📋 Planned |
| **Interruption log** | Records what pulled you away and how often, so analytics point at a cause rather than a number. | 📋 Planned |
| **Streak & consistency tracking** | Consecutive active days, weighted by session quality rather than raw time. | 📋 Planned |
| **Goal setting** | Define a target, break it into a plan, divide the plan into sessions. | 📋 Planned |
| **Topics & subtopics planner** | Organize a subject into a topic tree, evaluated against post-session feedback. | 📋 Planned |
| **Progress analytics** | Time studied per subject and topic, trends over weeks. | 📋 Planned |
| **In-app editor, notepad, music** | Companion tools so Ultra-Focus mode doesn't require leaving the app. Music via third-party service integration. | 📋 Planned |
| **Offline-first** | Full functionality with no connection; syncs when available. | 📋 Planned |
| **Data export** | Export study logs as CSV/JSON. Your data stays yours. | 📋 Planned |
| **Spaced repetition** | Schedule topic reviews from the existing topic tree and session feedback. | 💡 Idea |
| **External course tracking** | Track Udemy / Coursera / self-study progress alongside formal subjects. | 💡 Idea |
| **Accountability / social** | Shared streaks or study groups. | 💡 Idea |

## Who it serves

- **Secondary and university students** managing several subjects at once.
- **Self-taught learners** working through online courses with no external accountability.
- **Anyone** trying to turn studying into a habit rather than a panic response before a deadline.

## Tech stack

Decided in [docs/masterplan.md](docs/masterplan.md) §3 (locked decisions 1–3): the client is
Flutter, the device is the only datastore until after v1.0, and no server exists on the
critical path.

| Layer | Technology | Why |
|---|---|---|
| Client | Flutter (Dart) | One codebase for Windows and (post-1.0) Android; platform channels give a clean path down to native code for lockdown features. |
| State / DI | Riverpod | Long-running timer surviving screen changes — the core of the app. |
| Local storage | SQLite (Drift, pinned 2.34.0) | Offline-first source of truth on device. Schema v1 is frozen; migrations are additive-only. |
| Native modules | C++/Win32 (Windows); Kotlin (Android, post-1.0) | Required for focus enforcement. |
| Backend (post-1.0, optional) | FastAPI + PostgreSQL | Deferred until after the finish line; sync/auth are not v1.0 features. |
| Platforms | Windows first; Android post-1.0 | Desktop-first for study sessions. |

## Focus enforcement — platform reality

Ultra-Focus mode is the app's differentiator, and it's a platform-permissions problem more than a coding problem. Capabilities differ sharply per OS:

| Capability | Android | Windows |
|---|---|---|
| Suppress notifications | Do Not Disturb API (needs user grant) | Focus Assist API |
| Block app switching | Screen pinning / kiosk mode, or Accessibility Service | Low-level keyboard hooks (fragile) |
| Prevent app exit | Screen pinning | No reliable supported method |
| Detect escape attempts | Lifecycle callbacks | Window focus events |

**Play Store caveat:** using an Accessibility Service for non-accessibility purposes is grounds for rejection unless clearly justified. Screen pinning is the safer route.

**Recommended approach — soft enforcement first:**

1. Fullscreen + immersive mode, notifications suppressed.
2. A friction screen on exit attempts ("You have 12 minutes left — leave anyway?").
3. Log every escape attempt and surface it in the interruption log.

Soft enforcement covers most real use, ships far sooner, and carries no store risk. True lockdown lands later as an optional platform-specific module.

## Getting started

<!-- TODO: fill in once the build is runnable -->

### Prerequisites

```
# Flutter 3.x
# Python 3.11+
# PostgreSQL 16
```

### Installation

```bash
git clone https://github.com/<user>/nerdyapp.git
cd nerdyapp

# Client
cd app && flutter pub get

# Server
cd ../server && pip install -r requirements.txt
```

### Running locally

```bash
# Server
uvicorn app.main:app --reload

# Client
cd app && flutter run
```

## Project structure

```
nerdyapp/
├── app/                          # Flutter client
│   ├── lib/
│   │   ├── core/                 # theme, routing, constants, DI
│   │   ├── data/                 # repositories, local db, api client
│   │   ├── domain/               # entities, use cases
│   │   ├── features/
│   │   │   ├── session/          # timer, session lifecycle
│   │   │   ├── focus/            # focused + ultra-focus modes
│   │   │   ├── planner/          # subjects, topics, goals
│   │   │   ├── analytics/        # dashboard, streaks
│   │   │   └── settings/
│   │   └── main.dart
│   ├── android/                  # Kotlin: screen pinning, DND
│   ├── windows/                  # native focus-enforcement hooks
│   └── test/
├── server/
│   ├── app/
│   │   ├── api/v1/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── main.py
│   ├── migrations/
│   └── tests/
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   └── focus-enforcement.md      # per-platform capability matrix
├── .github/workflows/
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

Feature-first folders inside `lib/` matter more than the layer names — they keep each feature self-contained as the app grows.

## Roadmap

The governing sequencing document is [docs/masterplan.md](docs/masterplan.md) §7 — this list
mirrors it and supersedes earlier README roadmaps (notably: **no authentication and no server
before v1.0**, per masterplan decision 3). Delivery is slice-based: every merge ends in a
runnable, usable app.

- [x] **Slice 1 — usable study session**: scaffold, frozen schema v1, subjects, session timer
      with pause/resume, persistence, history
- [x] **Harden slice**: CI on `windows-latest`, schema verification harness + drift guards
      (proven able to fail), one-button database backup, project docs
- [ ] **Phase 1 — Core loop remainder**: crash recovery (`end_reason='crashed'`), full subject
      CRUD, session-immutability tests, wall-clock accuracy check
- [ ] **Phase 2 — The signal**: post-session survey (≤2 taps), interruption log
- [ ] **Phase 3 — Focused mode (Tier 1, Windows)**: fullscreen sessions, escapes detected,
      logged, and gently frictioned
- [ ] **Phase 4 — Topics & mastery**: topic tree, session tagging, computed mastery
- [ ] **Phase 5 — Consistency & insight**: strict quality-weighted streaks, calendar heatmap,
      analytics
- [ ] **Phase 6 — Goals & routines**: recurring schedule with derived adherence
- [ ] **Phase 7 — Companion tools**: notepad, parking list, ambient sound
- [ ] **Phase 8 — Export & durability**: CSV/JSON export, backup/restore, delete-all
- [ ] **Phase 9 — Finish**: onboarding, polish, Windows installer, `v1.0.0`

**Post-1.0:** Android port (screen pinning, DND), server & sync, Ultra-Focus hard lockdown,
spaced repetition, external course tracking, accountability/social.

## Development workflow

- **Branching:** GitHub Flow. `main` stays deployable; short-lived branches (`feat/session-timer`, `fix/streak-reset`) merged via squash PR.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`. Enables automatic changelog generation.
- **Issues:** one per feature row above; link the issue number from the roadmap so status lives in one place.
- **CI:** lint and test on every push, from v0.1.0. Cheap now, painful to retrofit.
- **Releases:** tag every release, notes via GitHub Releases, changelog follows [Keep a Changelog](https://keepachangelog.com/).
- **Pre-1.0:** breaking changes in minor versions are expected and acceptable.

## Privacy

NerdyApp observes notification state and app-switching behaviour to make focus modes work. That is sensitive, so the commitment is stated plainly:

<!-- TODO: confirm and keep accurate as the implementation lands -->

- Session logs and survey responses are stored locally by default.
- No study content, notes, or interruption data is sold or shared with third parties.
- Sync is opt-in.
- All user data can be exported or deleted on request.

## Contributing

Contributions are welcome. Please open an issue before starting significant work so the approach can be agreed first. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, hard rules (the drift pin, the schema freeze), and the PR process.

## License

[MIT](LICENSE) — Copyright (c) 2026 Nicholas Jonathan Isaac.

## Contact

**Maintainer:** Nicholas Jonathan Isaac ([@eliminated](https://github.com/eliminated))
**Email:** problemistergrey@gmail.com
**Issues:** [Issues](https://github.com/eliminated/nerdv3/issues)

## Changelog
**App Changelog**: [File Changelog](CHANGELOG.md)

**README changelog**:
<!-- REQUIRED: Update/Add changelog logs at the table below for any changes made to README.md -->

| Version | Changes | Author/Co-author |
| ------- | ------- | ---------------- |
| 1.0 | - Foundation | Claude\nIsaac |
| 1.1 | - Build iteration V2 → V3 after a from-scratch restart<br>- Filled the iteration-history table, including an honest V1 and V2 post-mortem<br>- Repointed issues link to the nerdv3 repository | Claude\nIsaac |
| 1.2 | -Truer statement | Isaac |
| 1.3 | - Roadmap rewritten to mirror masterplan §7 (slice-based; auth/server moved post-1.0)<br>- Tech stack marked decided per masterplan §3; Riverpod/Drift pins recorded<br>- Session timer marked shipped (slice 1)<br>- License (MIT), CONTRIBUTING link, maintainer filled in | Claude\nIsaac |

