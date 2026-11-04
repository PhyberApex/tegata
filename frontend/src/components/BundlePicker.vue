<script setup lang="ts">
import type { Bundle } from '../types'
import { ref, useId } from 'vue'

const props = defineProps<{
  modelValue: string[]
  bundles: Bundle[]
}>()

const emit = defineEmits<{
  'update:modelValue': [groups: string[]]
  'apply': [bundleName: string]
}>()

const selectId = useId()
const selectedBundle = ref('')

function applyBundle() {
  const bundle = props.bundles.find(b => b.name === selectedBundle.value)
  if (!bundle)
    return

  emit('update:modelValue', [
    ...new Set([
      ...props.modelValue,
      ...bundle.groups,
    ]),
  ])
  emit('apply', bundle.name)
  selectedBundle.value = ''
}
</script>

<template>
  <div v-if="bundles.length" class="bundle-picker">
    <label :for="selectId" class="tg-form-label">Start from a bundle (optional)</label>
    <div class="bundle-picker-row">
      <select :id="selectId" v-model="selectedBundle" class="tg-input">
        <option value="">
          Select a bundle…
        </option>
        <option v-for="bundle in bundles" :key="bundle.name" :value="bundle.name">
          {{ bundle.name }}{{ bundle.description ? ` — ${bundle.description}` : '' }}
        </option>
      </select>
      <button
        type="button"
        class="tg-btn tg-btn-ghost"
        :disabled="!selectedBundle"
        @click="applyBundle"
      >
        Apply
      </button>
    </div>
  </div>
</template>

<style scoped>
.bundle-picker {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-sm);
}

.bundle-picker-row {
  display: flex;
  gap: var(--tg-space-sm);
}

.bundle-picker-row .tg-input {
  flex: 1;
  min-width: 0;
}
</style>
