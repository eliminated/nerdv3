# Data Model

**Build iteration:** V3 · **Status:** design phase · **Last updated:** 2026-07-25

Entities, relationships, and derived metrics. Schema shown in PostgreSQL dialect; the
SQLite/Drift local schema mirrors it with the sync columns intact.

---

## 1. Entity overview

```
users
  │
  ├──< subjects
  │       │
  │       ├──< topics ──< topics          (self-referencing: subtopics)
  │       │
  │       └──< sessions >── topics        (optional link)
  │               │
  │               ├──1 session_surveys
  │               └──< interruptions
  │
  ├──< goals >── subjects                 (optional link)
  │
  └──< daily_summaries                    (derived cache)
```

## 2. Sync columns

**Every table** carries these. They are the backbone of offline-first — see
[architecture.md §5](./architecture.md#5-offline-first-sync).

```sql
id          UUID PRIMARY KEY,             -- UUIDv7, generated client-side
created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
deleted_at  TIMESTAMPTZ                   -- soft delete; NULL = live
```

All queries filter `WHERE deleted_at IS NULL`. The local SQLite copy adds
`sync_state TEXT NOT NULL DEFAULT 'local'` (`local` | `pending` | `synced`), which is
device-only and never transmitted.

## 3. Core entities

### 3.1 `users`

```sql
CREATE TABLE users (
    id            UUID PRIMARY KEY,
    email         CITEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,          -- Argon2id
    display_name  TEXT,
    timezone      TEXT NOT NULL DEFAULT 'UTC',   -- IANA, e.g. 'Asia/Kuala_Lumpur'
    day_start_hour SMALLINT NOT NULL DEFAULT 4,  -- see note below
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);
```

**`day_start_hour` is not cosmetic.** Students study past midnight constantly. If the day
boundary is 00:00, a session ending at 01:30 breaks a streak the user feels they earned.
Defaulting the boundary to 04:00 local time makes streaks match lived experience. Store
`timezone` per user, not per device — travel shouldn't rewrite history.

### 3.2 `subjects`

```sql
CREATE TABLE subjects (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id),
    name        TEXT NOT NULL,
    color       TEXT,                     -- hex, for UI
    source      TEXT NOT NULL DEFAULT 'self',  -- 'school'|'university'|'course'|'self'
    source_name TEXT,                     -- e.g. 'Coursera', 'Udemy'
    archived    BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_subjects_user ON subjects(user_id) WHERE deleted_at IS NULL;
```

`source` / `source_name` are how external-course tracking works without a separate entity.
A Udemy course is a subject with `source='course'`. No integration needed for v1 — the
user types the name. Actual API integration can populate the same fields later.

`archived` exists so a finished semester's subjects leave the active UI without deleting
the history the analytics depend on.

### 3.3 `topics`

Self-referencing tree. One table handles topics and subtopics at any depth.

```sql
CREATE TABLE topics (
    id              UUID PRIMARY KEY,
    subject_id      UUID NOT NULL REFERENCES subjects(id),
    parent_topic_id UUID REFERENCES topics(id),   -- NULL = top-level topic
    name            TEXT NOT NULL,
    order_index     INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'not_started',
                    -- 'not_started'|'in_progress'|'needs_review'|'confident'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_topics_subject ON topics(subject_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_topics_parent  ON topics(parent_topic_id);
```

**Depth limit: 3 levels.** Not a database constraint — a UI one. Deeper trees become
unnavigable on a phone and users stop maintaining them.

`status` is user-set. **Mastery is computed separately** (§5.3) from survey data, because
self-reported status drifts optimistic while comprehension ratings don't.

### 3.4 `sessions`

The central fact table. **Immutable once ended** — this is what makes sync trivial.

```sql
CREATE TABLE sessions (
    id                 UUID PRIMARY KEY,
    user_id            UUID NOT NULL REFERENCES users(id),
    subject_id         UUID NOT NULL REFERENCES subjects(id),
    topic_id           UUID REFERENCES topics(id),
    goal_id            UUID REFERENCES goals(id),
    mode               TEXT NOT NULL,     -- 'plain'|'focused'|'ultra_focus'
    planned_duration_s INTEGER,           -- NULL = open-ended
    actual_duration_s  INTEGER,           -- excludes paused time
    paused_duration_s  INTEGER NOT NULL DEFAULT 0,
    started_at         TIMESTAMPTZ NOT NULL,
    ended_at           TIMESTAMPTZ,       -- NULL = in progress
    end_reason         TEXT,
                       -- 'completed'|'user_ended'|'abandoned'|'crashed'
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user_time ON sessions(user_id, started_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_topic ON sessions(topic_id);
```

Notes:

- `actual_duration_s` **excludes** paused time; `paused_duration_s` is tracked separately.
  Reporting them merged makes streaks dishonest.
- `end_reason = 'crashed'` is written by the recovery routine on next launch when an
  unterminated session is found. Crashed sessions **do not count** toward streaks — they
  cannot be trusted — but they are kept, because a pattern of crashes is a bug report.
- Only `ended_at`, `actual_duration_s`, and `end_reason` are ever written after creation.
  Nothing else mutates.

### 3.5 `session_surveys`

One-to-one with a session. **This is the app's core signal**, not a nice-to-have.

```sql
CREATE TABLE session_surveys (
    id                   UUID PRIMARY KEY,
    session_id           UUID UNIQUE NOT NULL REFERENCES sessions(id),
    focus_rating         SMALLINT NOT NULL CHECK (focus_rating BETWEEN 1 AND 5),
    comprehension_rating SMALLINT CHECK (comprehension_rating BETWEEN 1 AND 5),
    difficulty_rating    SMALLINT CHECK (difficulty_rating BETWEEN 1 AND 5),
    note                 TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ
);
```

**Design rule: only `focus_rating` is mandatory, and the survey must be dismissible in one
tap.** A survey that feels like homework gets skipped, and once skipped it stops being
data. Two taps maximum for the common path.

The three ratings answer different questions and shouldn't be collapsed:

| Rating | Question | Feeds |
|---|---|---|
| `focus_rating` | Were you actually present? | Streak quality, focus-mode effectiveness |
| `comprehension_rating` | Did you understand it? | Topic mastery, spaced repetition |
| `difficulty_rating` | How hard was the material? | Planning, workload calibration |

### 3.6 `interruptions`

Append-only event log. What makes analytics diagnostic rather than merely descriptive.

```sql
CREATE TABLE interruptions (
    id          UUID PRIMARY KEY,
    session_id  UUID NOT NULL REFERENCES sessions(id),
    kind        TEXT NOT NULL,
                -- 'app_switch'|'exit_attempt'|'notification'
                -- |'manual_pause'|'idle_timeout'|'device_locked'
    occurred_at TIMESTAMPTZ NOT NULL,
    duration_s  INTEGER,                  -- how long away, if measurable
    blocked     BOOLEAN NOT NULL DEFAULT false,  -- did enforcement stop it?
    detail      TEXT,                     -- optional context
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_interruptions_session ON interruptions(session_id);
```

**`blocked` is how focus modes get evaluated.** Comparing blocked vs. successful escape
attempts across modes answers whether Ultra-Focus actually works or just annoys people.

**Privacy line:** `detail` records *kind*, never *identity*. Store `app_switch`, not the
name of the app switched to. Recording which apps a student opens is surveillance, and it
would also make an Accessibility Service permission far harder to justify to Google.

### 3.7 `goals`

```sql
CREATE TABLE goals (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users(id),
    subject_id   UUID REFERENCES subjects(id),   -- NULL = cross-subject
    title        TEXT NOT NULL,
    target_type  TEXT NOT NULL,   -- 'hours'|'sessions'|'topics_confident'
    target_value NUMERIC NOT NULL,
    period       TEXT,            -- 'once'|'daily'|'weekly' (NULL = once)
    deadline     DATE,
    status       TEXT NOT NULL DEFAULT 'active',
                 -- 'active'|'achieved'|'missed'|'abandoned'
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);
```

Progress is **computed from sessions**, never stored — a stored counter is a
denormalisation bug waiting to happen when a session is edited or deleted.

## 4. Derived data

### 4.1 `daily_summaries` (cache)

```sql
CREATE TABLE daily_summaries (
    id                UUID PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES users(id),
    local_date        DATE NOT NULL,      -- user's timezone + day_start_hour applied
    total_seconds     INTEGER NOT NULL DEFAULT 0,
    session_count     INTEGER NOT NULL DEFAULT 0,
    avg_focus_rating  NUMERIC(3,2),
    qualified         BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ,
    UNIQUE (user_id, local_date)
);
```

**Fully recomputable from `sessions` and `session_surveys`.** Never synced — each device
rebuilds it locally. This avoids the entire class of sync conflicts that derived data
otherwise creates. Ship a `recomputeSummaries()` function and call it after any sync.

## 5. Computed metrics

### 5.1 Qualified day

A day counts toward a streak when:

```
total_seconds >= 900              (15 minutes, configurable)
AND session_count >= 1
AND avg_focus_rating >= 3.0       (only over sessions that have surveys)
AND at least one session has end_reason IN ('completed','user_ended')
```

This is the **quality-weighted streak** from the README. A distracted 15 minutes with a
focus rating of 1 shouldn't buy a streak day — that's how streak mechanics become
something to game rather than something that reflects work.

> **Open question.** Should a missing survey block qualification? Blocking coerces survey
> completion (good data, bad feel). Suggested compromise: unsurveyed sessions count at a
> neutral 3.0 so the day can still qualify, while surveyed sessions carry real weight.

### 5.2 Streak length

```
Walk daily_summaries backwards from today (user's local_date).
Count consecutive qualified = true.
Today not yet qualified does NOT break the streak — the day isn't over.
```

That last line matters: a streak that reads "0" at 9am when the user studied yesterday is
a demoralising bug, not a feature.

> **Consider a grace mechanic.** One missed day per week forgiven, or a limited "freeze"
> token. Research on habit formation is fairly consistent that a single miss doesn't break
> a habit — but an app that resets a 40-day streak to zero often makes users quit outright.
> Cheap to add, disproportionately effective at retention.

### 5.3 Topic mastery

```
mastery(topic) = weighted_avg(comprehension_rating)
                 over sessions on that topic and its descendants,
                 weighted by recency (exponential decay, ~14-day half-life)
                 and by session duration
```

Recency decay is what makes this useful for spaced repetition later: a topic understood
well two months ago and untouched since should surface for review, and decay expresses
that without any extra scheduling machinery.

Requires ≥2 surveyed sessions before displaying, or a single bad day mislabels a topic.

## 6. Indexing summary

| Index | Serves |
|---|---|
| `sessions(user_id, started_at DESC)` | History, analytics range queries |
| `sessions(topic_id)` | Topic mastery |
| `topics(subject_id)`, `topics(parent_topic_id)` | Tree loading |
| `daily_summaries(user_id, local_date)` | Streak walk |
| `interruptions(session_id)` | Session detail |

All partial (`WHERE deleted_at IS NULL`) where soft deletes apply.

## 7. Open questions

- **Multi-device same-session** — user starts on desktop, continues on phone. Split into
  two sessions, or merge? Splitting is far simpler and probably correct.
- **Editing history** — can a user fix a mis-tagged subject after the fact? It breaks
  session immutability. Suggested: allow editing `subject_id`/`topic_id` only, treat as an
  exception, and re-run `recomputeSummaries()`.
- **Retention** — do interruption logs stay forever? They're the highest-volume table and
  the most privacy-sensitive. Consider auto-purge after 90 days.
- **Timezone changes** — recompute historical `local_date` on change, or freeze it? Freeze
  is simpler and arguably more honest to what happened.