<script setup lang="ts">
import { onMounted, ref } from 'vue';

import type { SubjectRow } from '@nerdyapp/core';

// Unstyled on purpose. Masterplan L3 requires a slice to end in something
// runnable, not a blank shell — but the Modernist theme and the seven views are
// V3-C's, and dressing this now would mean throwing it away twice.
//
// Task 5 builds this out into subjects + session + history. For now it proves
// the whole stack end to end: renderer -> preload allowlist -> IPC -> core ->
// SQLite (or fixtures) -> back.
const subjects = ref<SubjectRow[]>([]);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    subjects.value = await window.nerdy.listSubjects();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});
</script>

<template>
  <main>
    <h1>NerdyApp</h1>
    <p v-if="error">Error: {{ error }}</p>
    <p>{{ subjects.length }} subject(s)</p>
    <ul>
      <li v-for="s in subjects" :key="s.id">{{ s.name }}</li>
    </ul>
  </main>
</template>
