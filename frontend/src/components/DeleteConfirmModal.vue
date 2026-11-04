<script setup lang="ts">
import ModalOverlay from './ModalOverlay.vue'

const props = withDefaults(defineProps<{
  title: string
  target: string
  loading: boolean
  error: string
  confirmLabel?: string
  confirmingLabel?: string
}>(), {
  confirmLabel: 'Delete',
  confirmingLabel: 'Deleting...',
})

defineEmits<{ confirm: [], close: [] }>()
</script>

<template>
  <ModalOverlay :title="title" @close="$emit('close')">
    <slot>
      <p class="tg-form-hint">
        Are you sure you want to delete <strong>{{ target }}</strong>? This cannot be undone.
      </p>
    </slot>
    <p v-if="error" class="tg-form-error" role="alert">
      {{ error }}
    </p>
    <div class="tg-form-actions">
      <button class="tg-btn tg-btn-ghost" @click="$emit('close')">
        Cancel
      </button>
      <button class="tg-btn tg-btn-danger" :disabled="loading" @click="$emit('confirm')">
        {{ loading ? props.confirmingLabel : props.confirmLabel }}
      </button>
    </div>
  </ModalOverlay>
</template>
