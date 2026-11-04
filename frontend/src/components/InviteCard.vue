<script setup lang="ts">
import type { Invite } from '../types'
import { computed } from 'vue'
import { timeUntilExpiry } from '../utils/time'

// `strong` renders as `prefix` + a bolded segment (only the "Used by" meta line needs this); every other item uses plain `text`.
interface MetaItem {
  key: string
  class: string
  title?: string
  text?: string
  prefix?: string
  strong?: string
}

interface ActionItem {
  key: string
  label: string
  class: string
  disabled?: boolean
  onClick: () => void
}

const props = defineProps<{
  invite: Invite
  variant: 'active' | 'used' | 'expired'
  copiedId: string | null
  sendingId: string | null
}>()

const emit = defineEmits<{
  qr: [invite: Invite]
  copy: [invite: Invite]
  send: [invite: Invite]
  revoke: [invite: Invite]
  remove: [id: string]
}>()

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function bundleItem(): MetaItem | null {
  return props.invite.bundle_name
    ? { key: 'bundle', class: 'invite-bundle', text: `From bundle ${props.invite.bundle_name}` }
    : null
}

function prefillItem(): MetaItem | null {
  const label = props.invite.displayname || props.invite.email
  return label
    ? { key: 'prefill', class: 'invite-prefill', text: `For ${label}` }
    : null
}

function emailStatusItem(): MetaItem | null {
  if (props.invite.email_sent_at) {
    return {
      key: 'email-status',
      class: 'invite-email-sent',
      text: '✓ Emailed',
      title: `Emailed ${formatDate(props.invite.email_sent_at)}`,
    }
  }
  if (props.invite.email_error) {
    return {
      key: 'email-status',
      class: 'invite-email-failed',
      text: '✗ Email failed',
      title: props.invite.email_error,
    }
  }
  return null
}

function activeMetaItems(): MetaItem[] {
  return [
    prefillItem(),
    bundleItem(),
    emailStatusItem(),
    { key: 'expiry', class: 'invite-expiry', text: `Expires in ${timeUntilExpiry(props.invite.expires_at)}` },
    { key: 'created', class: 'invite-created', text: `Created ${formatDate(props.invite.created_at)}` },
  ].filter((item): item is MetaItem => item !== null)
}

function usedMetaItems(): MetaItem[] {
  return [
    {
      key: 'used-by',
      class: 'invite-used-by',
      prefix: 'Used by ',
      strong: props.invite.used_by ?? '',
    },
    bundleItem(),
    {
      key: 'created',
      class: 'invite-created',
      text: formatDate(props.invite.used_at!),
    },
  ].filter((item): item is MetaItem => item !== null)
}

function expiredMetaItems(): MetaItem[] {
  return [
    bundleItem(),
    { key: 'expired', class: 'invite-expired', text: `Expired ${formatDate(props.invite.expires_at)}` },
  ].filter((item): item is MetaItem => item !== null)
}

function sendActionItem(): ActionItem | null {
  if (!props.invite.email)
    return null
  return {
    key: 'send',
    label: props.sendingId === props.invite.id
      ? 'Sending...'
      : (props.invite.email_sent_at ? 'Resend' : 'Send'),
    class: 'tg-btn tg-btn-ghost',
    disabled: props.sendingId === props.invite.id,
    onClick: () => emit('send', props.invite),
  }
}

function activeActionItems(): ActionItem[] {
  return [
    {
      key: 'qr',
      label: 'QR Code',
      class: 'tg-btn tg-btn-ghost',
      onClick: () => emit('qr', props.invite),
    },
    {
      key: 'copy',
      label: props.copiedId === props.invite.id
        ? 'Copied!'
        : 'Copy Link',
      class: 'tg-btn tg-btn-ghost',
      onClick: () => emit('copy', props.invite),
    },
    sendActionItem(),
    {
      key: 'revoke',
      label: 'Revoke',
      class: 'tg-btn tg-btn-danger',
      onClick: () => emit('revoke', props.invite),
    },
  ].filter((item): item is ActionItem => item !== null)
}

interface VariantView {
  metaItems: MetaItem[]
  actionItems: ActionItem[]
  cardModifierClass: string
}

const view = computed<VariantView>(() => {
  if (props.variant === 'active') {
    return {
      metaItems: activeMetaItems(),
      actionItems: activeActionItems(),
      cardModifierClass: '',
    }
  }
  if (props.variant === 'used') {
    return {
      metaItems: usedMetaItems(),
      actionItems: [],
      cardModifierClass: 'invite-card--used',
    }
  }
  return {
    metaItems: expiredMetaItems(),
    actionItems: [
      {
        key: 'remove',
        label: 'Remove',
        class: 'tg-btn tg-btn-danger',
        onClick: () => emit('remove', props.invite.id),
      },
    ],
    cardModifierClass: 'invite-card--expired',
  }
})
</script>

<template>
  <div class="invite-card tg-card" :class="view.cardModifierClass">
    <div class="invite-info">
      <div class="invite-groups">
        <span v-for="g in invite.groups" :key="g" class="tg-badge">{{ g }}</span>
      </div>
      <div class="invite-meta">
        <span v-for="item in view.metaItems" :key="item.key" :class="item.class" :title="item.title">
          <template v-if="item.strong !== undefined">{{ item.prefix }}<strong>{{ item.strong }}</strong></template>
          <template v-else>{{ item.text }}</template>
        </span>
      </div>
    </div>
    <div v-if="view.actionItems.length" class="invite-actions">
      <button
        v-for="action in view.actionItems"
        :key="action.key"
        :class="action.class"
        :disabled="action.disabled"
        @click="action.onClick"
      >
        {{ action.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.invite-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--tg-space-lg);
}

.invite-card--used {
  opacity: 0.6;
}

.invite-card--expired {
  opacity: 0.4;
}

.invite-info {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-sm);
}

.invite-groups {
  display: flex;
  gap: var(--tg-space-xs);
  flex-wrap: wrap;
}

.invite-meta {
  display: flex;
  gap: var(--tg-space-lg);
  font-size: var(--tg-font-xs);
  color: var(--tg-text-muted);
}

.invite-expiry {
  color: var(--tg-accent);
}

.invite-used-by {
  color: var(--tg-success);
}

.invite-email-sent {
  color: var(--tg-success);
}

.invite-email-failed {
  color: var(--tg-danger);
}

.invite-expired {
  color: var(--tg-danger);
}

.invite-actions {
  display: flex;
  gap: var(--tg-space-xs);
}

.invite-bundle {
  color: var(--tg-text-secondary);
}

.invite-prefill {
  color: var(--tg-text-secondary);
  font-weight: 600;
}
</style>
