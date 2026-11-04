<script setup lang="ts">
export interface AccessDiffItem {
  key: string
  label: string
  group: string
}

defineProps<{
  title: string
  tone?: 'added' | 'removed'
  items: AccessDiffItem[]
  /** Renders each item as a note's prose rather than a grant's name. */
  notes?: boolean
}>()
</script>

<template>
  <template v-if="items.length">
    <h3 class="tg-access-section-title" :class="tone && `tg-access-section-title--${tone}`">
      {{ title }}
    </h3>
    <ul class="tg-access-list">
      <li v-for="item in items" :key="item.key" :class="notes ? 'tg-access-note' : 'tg-access-item'">
        <template v-if="notes">
          {{ item.label }}{{ ' ' }}
        </template>
        <span v-else class="tg-access-item-name">{{ item.label }}</span>
        <span class="tg-badge tg-access-item-group">{{ item.group }}</span>
      </li>
    </ul>
  </template>
</template>
