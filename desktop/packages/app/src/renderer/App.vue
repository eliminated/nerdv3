<script setup lang="ts">
// Unstyled on purpose. Masterplan L3 requires a slice to end in something
// runnable, not a blank shell — but the Modernist theme and the seven views
// are V3-C's, and dressing this now would mean throwing it away twice.
const versions = window.nerdy.versions;
</script>

<template>
  <main>
    <h1>NerdyApp</h1>
    <p>Electron {{ versions.electron }} · Node {{ versions.node }} · Chromium {{ versions.chrome }}</p>
  </main>
</template>
