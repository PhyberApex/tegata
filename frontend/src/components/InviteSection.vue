<script setup lang="ts">
import type { Invite } from '../types'
import InviteCard from './InviteCard.vue'

defineProps<{
  title: string
  invites: Invite[]
  variant: 'active' | 'used' | 'expired'
  copiedId: string | null
  sendingId: string | null
}>()

defineEmits<{
  qr: [invite: Invite]
  copy: [invite: Invite]
  send: [invite: Invite]
  revoke: [invite: Invite]
  remove: [id: string]
}>()
</script>

<template>
  <section v-if="invites.length" class="invites-section">
    <h2 class="invites-section-title">
      {{ title }}
    </h2>
    <div class="invites-list">
      <InviteCard
        v-for="invite in invites"
        :key="invite.id"
        :invite="invite"
        :variant="variant"
        :copied-id="copiedId"
        :sending-id="sendingId"
        @qr="$emit('qr', $event)"
        @copy="$emit('copy', $event)"
        @send="$emit('send', $event)"
        @revoke="$emit('revoke', $event)"
        @remove="$emit('remove', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.invites-section {
  margin-bottom: var(--tg-space-xl);
}

.invites-section-title {
  font-size: var(--tg-font-xs);
  font-weight: 600;
  color: var(--tg-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 var(--tg-space-md);
}

.invites-list {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-sm);
}
</style>
