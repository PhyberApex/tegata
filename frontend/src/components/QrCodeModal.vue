<script setup lang="ts">
import type { Invite } from '../types'
import { renderSVG } from 'uqr'
import { computed } from 'vue'
import { inviteUrl } from '../utils/invites'
import ModalOverlay from './ModalOverlay.vue'

const props = defineProps<{
  invite: Invite
}>()

defineEmits<{ close: [] }>()

const url = computed(() => inviteUrl(props.invite.token))
const qrSvg = computed(() => renderSVG(url.value))
</script>

<template>
  <ModalOverlay title="Invite QR Code" @close="$emit('close')">
    <div class="qr-modal">
      <!-- eslint-disable-next-line vue/no-v-html — uqr output is generated locally from the invite token, not user HTML -->
      <div class="qr-tile" v-html="qrSvg" />
      <p class="qr-url">
        {{ url }}
      </p>
      <p class="tg-form-hint">
        Scan with a phone to open the registration page.
      </p>
    </div>
  </ModalOverlay>
</template>

<style scoped>
.qr-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--tg-space-md);
}

/* QR codes need a light quiet zone to scan reliably on the dark theme */
.qr-tile {
  background: #fff;
  border-radius: var(--tg-radius-md);
  padding: var(--tg-space-md);
  max-width: 260px;
  width: 100%;
}

.qr-tile :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}

.qr-url {
  font-size: var(--tg-font-xs);
  color: var(--tg-text-muted);
  word-break: break-all;
  text-align: center;
  margin: 0;
}
</style>
