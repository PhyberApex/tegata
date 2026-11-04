<script setup lang="ts">
import type { ResetToken } from '../types'
import type { ResetLinkForm } from '../types/forms'
import ModalOverlay from './ModalOverlay.vue'
import ResetLinkGenerateForm from './ResetLinkGenerateForm.vue'
import ResetLinkStatus from './ResetLinkStatus.vue'

defineProps<{
  target: string
  outstandingToken: ResetToken | null
  tokenExpired: boolean
  copied: boolean
  sending: boolean
  error: string
  loading: boolean
}>()

defineEmits<{ generate: [], revoke: [], send: [], copy: [], close: [] }>()

const form = defineModel<ResetLinkForm>('form', { required: true })
</script>

<template>
  <ModalOverlay title="Password Reset Link" @close="$emit('close')">
    <ResetLinkStatus
      v-if="outstandingToken"
      :target="target"
      :token="outstandingToken"
      :token-expired="tokenExpired"
      :copied="copied"
      :sending="sending"
      :error="error"
      :loading="loading"
      @revoke="$emit('revoke')"
      @send="$emit('send')"
      @copy="$emit('copy')"
    />
    <ResetLinkGenerateForm
      v-else
      v-model:form="form"
      :target="target"
      :error="error"
      :loading="loading"
      @generate="$emit('generate')"
      @close="$emit('close')"
    />
  </ModalOverlay>
</template>
