<script setup lang="ts">
import type { User } from '../types'
import ModalOverlay from './ModalOverlay.vue'

defineProps<{
  group: string
  members: User[]
  candidates: User[]
  /** A membership change is in flight or waiting on one of its confirmations. */
  busy: boolean
  error: string
}>()

defineEmits<{ remove: [username: string], add: [username: string], close: [] }>()

const memberToAdd = defineModel<string>('memberToAdd', { required: true })
</script>

<template>
  <ModalOverlay :title="`Members — ${group}`" @close="$emit('close')">
    <p v-if="error" class="tg-form-error" role="alert">
      {{ error }}
    </p>

    <ul v-if="members.length" class="members-list">
      <li v-for="member in members" :key="member.username" class="members-item">
        <span>{{ member.displayname }} <span class="members-username">({{ member.username }})</span></span>
        <button class="tg-btn tg-btn-ghost" :disabled="busy" @click="$emit('remove', member.username)">
          Remove
        </button>
      </li>
    </ul>
    <p v-else class="tg-form-hint">
      No members yet.
    </p>

    <div class="tg-form-field">
      <label for="members-add-select" class="tg-form-label">Add member</label>
      <div class="members-add-row">
        <select id="members-add-select" v-model="memberToAdd" class="tg-input">
          <option value="" disabled>
            Select a user…
          </option>
          <option v-for="candidate in candidates" :key="candidate.username" :value="candidate.username">
            {{ candidate.displayname }} ({{ candidate.username }})
          </option>
        </select>
        <button class="tg-btn tg-btn-primary" :disabled="!memberToAdd || busy" @click="$emit('add', memberToAdd)">
          Add
        </button>
      </div>
    </div>
  </ModalOverlay>
</template>

<style scoped>
.members-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-sm);
}

.members-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--tg-space-sm);
}

.members-username {
  color: var(--tg-text-secondary);
}

.members-add-row {
  display: flex;
  gap: var(--tg-space-sm);
}

.members-add-row .tg-input {
  flex: 1;
  min-width: 0;
}
</style>
