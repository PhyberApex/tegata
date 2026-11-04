<script setup lang="ts">
import type { ConfigNote } from '../types'

defineProps<{
  notes: ConfigNote[]
}>()
</script>

<template>
  <section v-if="notes.length" class="config-notes" role="status" aria-labelledby="config-notes-title">
    <h2 id="config-notes-title" class="tg-access-section-title config-notes-title">
      Authelia configuration
    </h2>
    <ul class="tg-access-list">
      <li
        v-for="note in notes"
        :key="`${note.kind}-${note.policyName}-${note.clientNames.join(',')}`"
        class="tg-access-note"
      >
        {{ note.message }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.config-notes {
  margin-bottom: var(--tg-space-xl);
  padding: var(--tg-space-md) var(--tg-space-lg);
  border: 1px solid var(--tg-border);
  border-left: 3px solid var(--tg-warning);
  border-radius: var(--tg-radius-md);
  background: var(--tg-bg-raised);
}

.config-notes-title {
  margin-top: 0;
}
</style>
