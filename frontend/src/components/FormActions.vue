<script setup lang="ts">
defineProps<{
  loading: boolean
  loadingLabel: string
  submitLabel: string
  disabled?: boolean
}>()

defineEmits<{ cancel: [] }>()
</script>

<template>
  <div class="tg-form-actions">
    <button type="button" class="tg-btn tg-btn-ghost" :disabled="disabled" @click="$emit('cancel')">
      Cancel
    </button>
    <button type="submit" class="tg-btn tg-btn-primary" :disabled="loading || disabled">
      {{ loading ? loadingLabel : submitLabel }}
    </button>
  </div>
</template>
