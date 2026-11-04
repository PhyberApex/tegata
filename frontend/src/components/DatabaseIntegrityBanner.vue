<script setup lang="ts">
import { ref } from 'vue'
import { useDatabaseIntegrity } from '../composables/useDatabaseIntegrity'

const {
  matches: databaseMatchesBaseline,
  unreadable: databaseUnreadable,
  unreadableReason: databaseUnreadableReason,
  acceptBaseline,
} = useDatabaseIntegrity()

const acceptingBaseline = ref(false)
const acceptBaselineError = ref('')

async function handleAcceptBaseline() {
  acceptingBaseline.value = true
  acceptBaselineError.value = ''
  try {
    await acceptBaseline()
  }
  catch (err) {
    acceptBaselineError.value = err instanceof Error
      ? err.message
      : 'Failed to accept baseline'
  }
  finally {
    acceptingBaseline.value = false
  }
}
</script>

<template>
  <div v-if="databaseUnreadable" class="integrity-banner integrity-banner--unreadable" role="alert">
    <span>The users database can't be read — writes are paused until it's fixed.<template v-if="databaseUnreadableReason"> ({{ databaseUnreadableReason }})</template></span>
  </div>
  <div v-else-if="!databaseMatchesBaseline" class="integrity-banner" role="alert">
    <span>The users database was modified outside Tegata.</span>
    <span v-if="acceptBaselineError" class="integrity-banner-error">{{ acceptBaselineError }}</span>
    <button class="tg-btn tg-btn-ghost integrity-banner-action" :disabled="acceptingBaseline" @click="handleAcceptBaseline">
      {{ acceptingBaseline ? 'Accepting...' : 'Accept current state' }}
    </button>
  </div>
</template>

<style scoped>
.integrity-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--tg-space-lg);
  padding: var(--tg-space-sm) var(--tg-space-xl);
  background: rgba(234, 179, 8, 0.15);
  color: var(--tg-warning);
  border-bottom: 1px solid var(--tg-warning);
  font-size: var(--tg-font-sm);
  font-weight: 500;
}

.integrity-banner--unreadable {
  background: var(--tg-danger-muted);
  color: var(--tg-danger);
  border-bottom-color: var(--tg-danger);
}

.integrity-banner-error {
  color: var(--tg-danger);
}

.integrity-banner-action {
  flex-shrink: 0;
  color: var(--tg-warning);
  border-color: var(--tg-warning);
}

.integrity-banner-action:hover {
  background: var(--tg-warning);
  color: var(--tg-bg-base);
}
</style>
