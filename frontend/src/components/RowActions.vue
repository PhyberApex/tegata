<script setup lang="ts" generic="T">
export interface RowAction<T> {
  label: string
  danger?: boolean
  run: (row: T) => void
}

defineProps<{
  actions: RowAction<T>[]
  row: T
}>()
</script>

<template>
  <div class="tg-table-actions">
    <button
      v-for="action in actions"
      :key="action.label"
      class="tg-btn"
      :class="action.danger ? 'tg-btn-danger' : 'tg-btn-ghost'"
      @click="action.run(row)"
    >
      {{ action.label }}
    </button>
  </div>
</template>
