# Architecture

**Build iteration:** V3 · **Status:** design phase · **Last updated:** 2026-07-25

This document describes how NerdyApp is put together and why. It covers the client, the
server, the offline-first sync model, and the decisions that constrain everything else.

---

## 1. Guiding constraints

Three requirements drive nearly every structural decision:

1. **Ultra-Focus needs native OS access.** Blocking app switching and suppressing
   notifications are privileged operations that differ per platform. The client framework
   must have a clean escape hatch to native code. See [focus-enforcement.md](./focus-enforcement.md).
2. **Studying happens offline.** Libraries, trains, dead zones, deliberately-disabled data.
   A session must start, run, and be recorded with no connection. This makes the device the
   source of truth, not the server.
3. **Two platforms, one developer.** Desktop and Android from a single codebase, or the
   project stalls on duplicated effort.

## 2. System overview

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT (Flutter)                     │
│                                                          │
│   Presentation  →  Domain  →  Data                       │
│   (widgets,        (entities,   (repositories,           │
│    state)           use cases)   local DB, API client)   │
│                                     │                    │
│                          ┌──────────┴──────────┐         │
│                          │                     │         │
│                    SQLite (Drift)        Sync engine     │
│                   [source of truth]           │          │
│                          │                    │          │
│   Platform channels ─────┴──────┐             │          │
└─────────────────────────────────┼─────────────┼──────────┘
                                  │             │
                      ┌───────────┴──┐          │ HTTPS/REST
                      │ Native layer │          │ (opt-in)
                      │ Kotlin/Win32 │          │
                      │ focus enforce│          ▼
                      └──────────────┘   ┌─────────────┐
                                         │   SERVER    │
                                         │  (FastAPI)  │
                                         │      │      │
                                         │  PostgreSQL │
                                         └─────────────┘
```

The server is **optional infrastructure**, not a dependency. v0.1–v0.5 can ship entirely
local. Sync exists to move data between a user's own devices and to back it up.

## 3. Client architecture

### 3.1 Layering

Standard three-layer separation, feature-first inside each layer:

| Layer | Contains | Depends on |
|---|---|---|
| **Presentation** | Widgets, screens, state notifiers | Domain |
| **Domain** | Entities, use cases, repository *interfaces* | Nothing |
| **Data** | Repository implementations, Drift DAOs, API client, sync engine | Domain |

Domain has no Flutter imports and no database imports. That is the rule that makes the
core logic testable without a device — and given that Ultra-Focus behaviour is painful to
test manually, that matters more here than in a typical app.

### 3.2 Feature-first organisation

```
lib/features/session/
├── data/          # session_repository_impl.dart
├── domain/        # session.dart, start_session.dart, end_session.dart
└── presentation/  # session_screen.dart, timer_widget.dart, session_controller.dart
```

Each feature owns its full vertical slice. Shared code goes in `core/`. This keeps a
feature deletable — if Ultra-Focus proves unworkable on a platform, its module comes out
without unpicking the rest.

### 3.3 State management

**Recommendation: Riverpod.** Compile-safe dependency injection, good testability, and it
handles the "long-running background timer that survives screen changes" case cleanly —
which is the session timer, i.e. the core of the app.

> **Open decision.** Bloc is the alternative; more boilerplate, more explicit event trails.
> Either works. Pick one before v0.2 and don't mix them.

### 3.4 The session timer

The single most correctness-sensitive component. Rules:

- **Never derive elapsed time from a tick counter.** Store `started_at` as a monotonic
  timestamp and compute elapsed on read. Tick counters drift and die when the process is
  suspended.
- **Persist session state on every state change**, not on completion. A crash mid-session
  must not lose the session.
- **Reconcile on resume.** On app launch, look for an unterminated session and either
  resume it or close it out with `end_reason = crashed`.
- **Run in a foreground service on Android** so the OS doesn't kill it.

## 4. Server architecture

```
server/app/
├── api/v1/        # routers — thin, no business logic
├── schemas/       # Pydantic request/response models
├── services/      # business logic
├── models/        # SQLAlchemy ORM
└── core/          # config, security, deps
```

Routers stay thin: validate, delegate to a service, return a schema. Business logic lives
in services so it's testable without HTTP.

**Auth:** JWT access token (short-lived) + refresh token. Password hashing with Argon2id.

**API versioning:** `/api/v1/` from day one. Cheap now; unavoidable later.

## 5. Offline-first sync

This is the hardest part of the architecture. Getting it wrong later means a data-loss bug
in production, so the model is fixed up front.

### 5.1 Principles

- **Device is the source of truth.** Writes go to SQLite first, always. Sync is a
  background reconciliation, never a blocking operation.
- **UUIDv7 primary keys, generated client-side.** No round-trip needed to create a record,
  no ID collisions between devices, and v7 sorts chronologically which helps index locality.
- **Soft deletes.** `deleted_at` rather than `DELETE`, so deletions propagate.
- **Every row carries `updated_at`** (UTC) and a `sync_state` enum (`local`, `pending`, `synced`).

### 5.2 Conflict resolution

Study data is overwhelmingly append-only and single-user, so conflicts are rare and mild.
**Last-write-wins on `updated_at`** is sufficient, with two exceptions:

| Entity | Strategy | Reason |
|---|---|---|
| `sessions` | **Never conflict** — immutable once ended | A completed session is a historical fact |
| `interruptions` | **Union, deduped by id** | Append-only event log |
| Everything else | Last-write-wins | User-editable, low contention |

> If multi-user study groups arrive post-1.0, revisit this. LWW is wrong for shared data.

### 5.3 Sync flow

```
1. Client sends: last_synced_at + all rows with sync_state != 'synced'
2. Server applies changes (LWW), returns all server rows where updated_at > last_synced_at
3. Client merges, marks rows 'synced', stores new last_synced_at (server's clock)
```

Use the **server's** timestamp as the watermark, not the client's — device clocks are
unreliable and users change timezones.

## 6. Key decisions

| # | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| 1 | Flutter client | React Native, native ×2, Electron+Kotlin | Single codebase across Android + desktop with real platform-channel access. RN's desktop story is weak; Electron can't do Android. |
| 2 | Offline-first, local source of truth | Server-authoritative | Studying happens without connectivity. Also lets v0.1–v0.5 ship with no backend at all. |
| 3 | Soft focus enforcement first | Hard lockdown first | Ships sooner, carries no Play Store policy risk, covers most real usage. See focus-enforcement.md. |
| 4 | FastAPI + PostgreSQL | Node/Express, Supabase, Firebase | Relational model fits subject→topic→session→survey. Avoids vendor lock-in for user-owned study data. |
| 5 | Client-generated UUIDv7 PKs | Server auto-increment | Required for offline creation. |
| 6 | Backend deferred to ~v0.5 | Backend first | Core loop needs no server. Building it early is the classic V1-stall trap. |

## 7. Testing strategy

| Level | Scope | Target |
|---|---|---|
| Unit | Domain use cases, streak calculation, sync merge logic | High coverage — this is where correctness bugs hide |
| Widget | Session screen, planner tree | Key flows only |
| Integration | Drift DAOs against in-memory SQLite | Every repository |
| Manual | Focus enforcement per platform | Documented checklist — cannot be automated |

Focus enforcement is untestable in CI. Keep a written manual test checklist per platform
and per OS version, because behaviour changes between Android releases.

## 8. Open questions

- **Riverpod vs Bloc** — decide before v0.2.
- **Music integration**: bundled local playback, or Spotify/YouTube Music SDK? The latter
  adds auth complexity and a hard network dependency to an offline-first app. Local audio
  files or generated ambient noise may be the better first move.
- **Desktop target**: Windows only, or Linux too? Linux enforcement is a third native
  implementation — probably post-1.0.
- **Does the server need to exist before v1.0?** Data export may cover backup needs well
  enough to defer sync entirely.

## 9. Related documents

- [data-model.md](./data-model.md) — entities, schema, derived metrics
- [focus-enforcement.md](./focus-enforcement.md) — per-platform capability matrix