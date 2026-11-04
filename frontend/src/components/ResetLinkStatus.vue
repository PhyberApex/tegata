<script setup lang="ts">
import type { ResetToken } from '../types'
import { resetLinkUrl } from '../utils/resetTokens'
import { timeUntilExpiry } from '../utils/time'
import FormError from './FormError.vue'

defineProps<{
  target: string
  token: ResetToken
  tokenExpired: boolean
  copied: boolean
  sending: boolean
  error: string
  loading: boolean
}>()

defineEmits<{ revoke: [], send: [], copy: [] }>()
</script>

<template>
  <p v-if="tokenExpired" class="tg-form-hint">
    The reset link for <strong>{{ target }}</strong> has expired without being used. Revoke it, then generate a new one.
  </p>
  <p v-else class="tg-form-hint">
    Single-use reset link for <strong>{{ target }}</strong> — expires in {{ timeUntilExpiry(token.expires_at) }}. Copy it to hand over directly, or send it below.
  </p>
  <p class="reset-link-url">
    {{ resetLinkUrl(token.token) }}
  </p>
  <p v-if="token.email_sent_at" class="reset-link-email-sent">
    ✓ Emailed {{ new Date(token.email_sent_at).toLocaleString() }}
  </p>
  <p v-else-if="token.email_error" class="reset-link-email-failed" :title="token.email_error">
    ✗ Email failed — share the link directly
  </p>
  <FormError :message="error" />
  <div class="tg-form-actions">
    <button class="tg-btn tg-btn-danger" :disabled="loading" @click="$emit('revoke')">
      {{ loading ? 'Revoking...' : 'Revoke' }}
    </button>
    <button
      v-if="!tokenExpired"
      class="tg-btn tg-btn-ghost"
      :disabled="sending"
      @click="$emit('send')"
    >
      {{ sending ? 'Sending...' : (token.email_sent_at ? 'Resend' : 'Send') }}
    </button>
    <button v-if="!tokenExpired" class="tg-btn tg-btn-primary" @click="$emit('copy')">
      {{ copied ? 'Copied!' : 'Copy Link' }}
    </button>
  </div>
</template>

<style scoped>
.reset-link-url {
  font-family: monospace;
  font-size: var(--tg-font-xs);
  color: var(--tg-text-secondary);
  background: var(--tg-bg-input);
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-sm);
  padding: var(--tg-space-sm);
  word-break: break-all;
  margin: 0;
  user-select: all;
}

.reset-link-email-sent {
  font-size: var(--tg-font-xs);
  color: var(--tg-success);
  margin: 0;
}

.reset-link-email-failed {
  font-size: var(--tg-font-xs);
  color: var(--tg-danger);
  margin: 0;
}
</style>
