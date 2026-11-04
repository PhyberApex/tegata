<script setup lang="ts">
import type { ResetToken, User } from '../types'
import { outstandingResetTokenFor } from '../utils/resetTokens'

defineProps<{
  users: User[]
  resetTokens: ResetToken[]
  togglingUsername: string | null
}>()

defineEmits<{
  edit: [user: User]
  resetLink: [username: string]
  toggle: [user: User]
  delete: [username: string]
}>()
</script>

<template>
  <div class="tg-table-wrap">
    <table class="tg-table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Display Name</th>
          <th>Email</th>
          <th>Groups</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in users" :key="user.username">
          <td class="users-cell--username">
            {{ user.username }}
            <span v-if="user.disabled" class="tg-badge tg-badge-danger">Disabled</span>
          </td>
          <td>{{ user.displayname }}</td>
          <td class="users-cell--email">
            {{ user.email }}
          </td>
          <td>
            <div class="users-groups">
              <span v-for="g in user.groups" :key="g" class="tg-badge">{{ g }}</span>
            </div>
          </td>
          <td>
            <div class="tg-table-actions">
              <button class="tg-btn tg-btn-ghost" @click="$emit('edit', user)">
                Edit
              </button>
              <button class="tg-btn tg-btn-ghost" @click="$emit('resetLink', user.username)">
                {{ outstandingResetTokenFor(resetTokens, user.username) ? 'Reset Link ●' : 'Reset Link' }}
              </button>
              <button
                class="tg-btn tg-btn-ghost"
                :disabled="togglingUsername === user.username"
                @click="$emit('toggle', user)"
              >
                {{ user.disabled ? 'Enable' : 'Disable' }}
              </button>
              <button class="tg-btn tg-btn-danger" @click="$emit('delete', user.username)">
                Delete
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.users-cell--username {
  font-weight: 600;
  color: var(--tg-accent);
}

.users-cell--username .tg-badge {
  margin-left: var(--tg-space-sm);
  font-weight: 500;
}

.users-cell--email {
  color: var(--tg-text-secondary);
}

.users-groups {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tg-space-xs);
}
</style>
