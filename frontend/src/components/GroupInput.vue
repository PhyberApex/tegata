<script setup lang="ts">
import { nextTick, ref, useId } from 'vue'

const props = defineProps<{
  modelValue: string[]
  availableGroups: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [groups: string[]] }>()

const listId = useId()
const newGroup = ref('')
const addInput = ref<HTMLInputElement | null>(null)
const removeButtons = new Map<string, HTMLButtonElement>()

function setRemoveButton(group: string, el: unknown) {
  if (el instanceof HTMLButtonElement)
    removeButtons.set(group, el)
  else
    removeButtons.delete(group)
}

function addGroup(group: string) {
  const trimmed = group.trim()
  if (trimmed && !props.modelValue.includes(trimmed)) {
    emit('update:modelValue', [...props.modelValue, trimmed])
  }
  newGroup.value = ''
}

// The removed tag's button unmounts while focused, dropping focus to <body>;
// hand it to the next tag, else the previous one, else the add input.
async function removeGroup(group: string) {
  const index = props.modelValue.indexOf(group)
  const remaining = props.modelValue.filter(g => g !== group)
  const target = remaining[index] ?? remaining[index - 1]
  emit('update:modelValue', remaining)
  await nextTick()
  ;((target && removeButtons.get(target)) || addInput.value)?.focus()
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
        <button
          :ref="el => setRemoveButton(g, el)"
          type="button"
          class="group-remove"
          :aria-label="`Remove group ${g}`"
          @click="removeGroup(g)"
        >
          &times;
        </button>
      </span>
    </div>

    <div class="group-add">
      <!-- change fires on blur, before a submit click, so a value typed or picked
           from the datalist is committed rather than dropped with the form. -->
      <input
        ref="addInput"
        v-model="newGroup"
        type="text"
        class="tg-input group-add-input"
        placeholder="Add group..."
        :list="listId"
        @keydown="handleKeydown"
        @change="addGroup(newGroup)"
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
  /* WCAG 2.5.8: at least a 24px target, centred on the glyph. */
  min-width: 24px;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
