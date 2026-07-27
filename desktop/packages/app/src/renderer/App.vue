<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { ActiveSession } from '@nerdyapp/core/domain';
import type {
  ActiveSessionSnapshot,
  HistoryEntry,
  SessionDetailView,
  SubjectRow,
} from '@nerdyapp/core';

/**
 * UNSTYLED ON PURPOSE.
 *
 * Masterplan L3: "a phase that ends in infrastructure and nothing to use is not
 * a phase" — so V3-B has to end in something that actually runs a session. But
 * the Modernist theme and the seven views are V3-C's, and dressing this now
 * would mean throwing it away twice. The CSS below goes exactly as far as
 * legibility and stops.
 *
 * Reactivity is a naive re-query after each mutation. That is deferred decision
 * **V3-1**, owned by V3-C: drift's `watch*` streams became plain queries in the
 * port, and designing a change-notification bus with no real views to serve
 * would have been guesswork.
 */

const subjects = ref<SubjectRow[]>([]);
const history = ref<HistoryEntry[]>([]);
const session = ref<ActiveSessionSnapshot | null>(null);
const newSubjectName = ref('');
const error = ref<string | null>(null);
const expanded = ref<string | null>(null);
const detail = ref<SessionDetailView | null>(null);

/**
 * A clock, NOT a counter.
 *
 * This ticks purely to force a re-render; the elapsed value is recomputed from
 * the session's stored timestamps every time (architecture.md §3.4). If this
 * interval is throttled, missed, or the machine sleeps, the displayed time is
 * still correct — which is exactly what a `+= 1` counter could not promise.
 */
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;

const elapsed = computed(() => {
  const s = session.value;
  if (s === null) return null;
  return ActiveSession.restore(s).elapsedMs(new Date(now.value));
});

const isPaused = computed(() => session.value?.pauseStartedAtMs !== null);

function hhmmss(ms: number): string {
  const total = Math.max(0, Math.trunc(ms / 1000));
  const h = String(Math.trunc(total / 3600)).padStart(2, '0');
  const m = String(Math.trunc((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

const subjectName = (id: string): string =>
  subjects.value.find((s) => s.id === id)?.name ?? 'unknown subject';

async function guard(work: () => Promise<void>): Promise<void> {
  try {
    error.value = null;
    await work();
  } catch (e) {
    // The IpcError carries `kind`, because structured clone would otherwise
    // collapse ValidationError and DomainStateError into a bare Error.
    const k = (e as { kind?: string }).kind;
    error.value = `${k ?? 'Error'}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function refresh(): Promise<void> {
  subjects.value = await window.nerdy.listSubjects();
  history.value = await window.nerdy.listHistory();
  session.value = await window.nerdy.getActiveSession();
}

const createSubject = (): Promise<void> =>
  guard(async () => {
    const name = newSubjectName.value.trim();
    if (name === '') return;
    await window.nerdy.createSubject(name);
    newSubjectName.value = '';
    await refresh();
  });

const start = (subjectId: string): Promise<void> =>
  guard(async () => {
    session.value = await window.nerdy.startSession(subjectId);
  });

const togglePause = (): Promise<void> =>
  guard(async () => {
    session.value = await window.nerdy.togglePause();
  });

const end = (): Promise<void> =>
  guard(async () => {
    await window.nerdy.endSession();
    await refresh();
  });

const selfReport = (): Promise<void> => guard(() => window.nerdy.logSelfReport());

const backupStatus = ref<string | null>(null);
const backup = (): Promise<void> =>
  guard(async () => {
    const path = await window.nerdy.backupDatabase();
    // Cheap insurance: V1's primary failure was losing the database repeatedly
    // (masterplan §1). The test build has nothing to back up and says so.
    backupStatus.value = path === null ? 'Backup cancelled.' : `Backed up to ${path}`;
  });

const toggleDetail = (sessionId: string): Promise<void> =>
  guard(async () => {
    if (expanded.value === sessionId) {
      expanded.value = null;
      detail.value = null;
      return;
    }
    detail.value = await window.nerdy.loadSessionDetail(sessionId);
    expanded.value = sessionId;
  });

onMounted(async () => {
  await guard(refresh);
  ticker = setInterval(() => {
    now.value = Date.now();
  }, 500);
});
onUnmounted(() => {
  if (ticker !== undefined) clearInterval(ticker);
});
</script>

<template>
  <main>
    <h1>NerdyApp</h1>
    <p v-if="error" class="error" data-testid="error">{{ error }}</p>

    <section>
      <h2>Session</h2>
      <div v-if="session === null" data-testid="no-session">No session running.</div>
      <div v-else data-testid="session">
        <p>
          <strong data-testid="elapsed">{{ hhmmss(elapsed ?? 0) }}</strong>
          — {{ subjectName(session.subjectId) }}
          <span v-if="isPaused"> (paused)</span>
        </p>
        <button data-testid="toggle-pause" @click="togglePause()">
          {{ isPaused ? 'Resume' : 'Pause' }}
        </button>
        <button data-testid="self-report" @click="selfReport()">Distracted</button>
        <button data-testid="end" @click="end()">End session</button>
      </div>
    </section>

    <section>
      <h2>Database</h2>
      <button data-testid="backup" @click="backup()">Back up the database</button>
      <span v-if="backupStatus" data-testid="backup-status"> {{ backupStatus }}</span>
    </section>

    <section>
      <h2>Subjects ({{ subjects.length }})</h2>
      <form @submit.prevent="createSubject()">
        <input v-model="newSubjectName" data-testid="subject-name" placeholder="New subject" />
        <button type="submit" data-testid="create-subject">Add</button>
      </form>
      <ul>
        <li v-for="s in subjects" :key="s.id" data-testid="subject">
          {{ s.name }}
          <button v-if="session === null" :data-testid="`start-${s.name}`" @click="start(s.id)">
            Start
          </button>
        </li>
      </ul>
    </section>

    <section>
      <h2>History ({{ history.length }})</h2>
      <p v-if="history.length === 0" data-testid="no-history">Nothing recorded yet.</p>
      <ul>
        <li v-for="h in history" :key="h.sessionId" data-testid="history-row">
          {{ h.subjectName }} — {{ hhmmss(h.actualDurationS * 1000) }}
          <span v-if="h.endReason !== 'user_ended'"> · {{ h.endReason }}</span>
          <button @click="toggleDetail(h.sessionId)">Details</button>
          <div v-if="expanded === h.sessionId && detail !== null" data-testid="detail">
            <span v-if="detail.hasSurvey">Focus {{ detail.focusRating }}/5</span>
            <span v-else>Not rated</span>
            · {{ detail.interruptions.length }} interruption(s)
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

<style>
/* Legibility only. The Modernist theme is V3-C. */
body {
  font-family: system-ui, sans-serif;
  margin: 2rem;
  line-height: 1.5;
}
section {
  margin-block: 1.5rem;
}
button {
  margin-inline-start: 0.5rem;
}
.error {
  color: #ec3013;
}
</style>
