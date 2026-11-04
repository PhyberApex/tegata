<script setup lang="ts">
import DeleteConfirmModal from './DeleteConfirmModal.vue'

defineProps<{
  message: string
  error: string
  loading: boolean
}>()

defineEmits<{ confirm: [], close: [] }>()
</script>

<template>
  <DeleteConfirmModal
    title="Confirm Action"
    target=""
    confirm-label="Confirm"
    confirming-label="Confirming..."
    :loading="loading"
    :error="error"
    @confirm="$emit('confirm')"
    @close="$emit('close')"
  >
    <p class="tg-form-hint">
      {{ message }}. Proceed anyway?
    </p>
  </DeleteConfirmModal>
</template>
