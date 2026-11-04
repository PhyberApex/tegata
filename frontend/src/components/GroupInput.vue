<script setup lang="ts">
import { ref, useId } from 'vue'

const props = defineProps<{
  modelValue: string[]
  availableGroups: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [groups: string[]] }>()

const listId = useId()
const newGroup = ref('')

function addGroup(group: string) {
  const trimmed = group.trim()
  if (trimmed && !props.modelValue.includes(trimmed)) {
    emit('update:modelValue', [...props.modelValue, trimmed])
  }
  newGroup.value = ''
}

function removeGroup(group: string) {
  emit('update:modelValue', props.modelValue.filter(g => g !== group))
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addGroup(newGroup.value)
  }
}
</script>

<template>
  <div class="group-input">
    <div v-if="modelValue.length" class="group-tags">
      <span v-for="g in modelValue" :key="g" class="tg-badge group-tag">
        {{ g }}
        <button type="button" class="group-remove" aria-label="Remove group" @click="removeGroup(g)">&times;</button>
      </span>
    </div>

    <div class="group-add">
      <input
        v-model="newGroup"
        type="text"
        class="tg-input group-add-input"
        placeholder="Add group..."
        :list="listId"
        @keydown="handleKeydown"
      >
      <datalist :id="listId">
        <option
          v-for="g in availableGroups.filter(ag => !modelValue.includes(ag))"
          :key="g"
          :value="g"
        />
      </datalist>
      <button
        type="button"
        class="tg-btn tg-btn-ghost"
        :disabled="!newGroup.trim()"
        @click="addGroup(newGroup)"
      >
        Add
      </button>
    </div>
  </div>
</template>

<style scoped>
.group-input {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-sm);
}

.group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tg-space-xs);
}

.group-tag {
  gap: var(--tg-space-xs);
}

.group-remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  font-size: 1rem;
  line-height: 1;
  opacity: 0.7;
}

.group-remove:hover {
  opacity: 1;
}

.group-add {
  display: flex;
  gap: var(--tg-space-sm);
}

.group-add-input {
  flex: 1;
  min-width: 0;
}
</style>
