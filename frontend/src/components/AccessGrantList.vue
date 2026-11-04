<script setup lang="ts">
defineProps<{
  title: string
  items: Array<{ key: string, name: string, policy: string, group: string }>
  showGroup: boolean
}>()
</script>

<template>
  <template v-if="items.length">
    <h3 class="tg-access-section-title">
      {{ title }}
    </h3>
    <ul class="tg-access-list">
      <li v-for="item in items" :key="item.key" class="tg-access-item">
        <span class="tg-access-item-name">{{ item.name }}</span>
        <span class="tg-access-item-meta">
          <span class="tg-access-item-policy">{{ item.policy }}</span>
          <span v-if="showGroup" class="tg-badge tg-access-item-group">{{ item.group }}</span>
        </span>
      </li>
    </ul>
  </template>
</template>
