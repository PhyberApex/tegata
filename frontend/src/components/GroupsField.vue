<script setup lang="ts">
import type { Bundle } from '../types'
import { useId } from 'vue'
import BundlePicker from './BundlePicker.vue'
import GroupInput from './GroupInput.vue'

withDefaults(defineProps<{
  bundles: Bundle[]
  availableGroups: string[]
  label?: string
}>(), {
  label: 'Groups',
})

const emit = defineEmits<{ apply: [bundleName: string] }>()

const labelId = useId()
const inputId = useId()

const groups = defineModel<string[]>('groups', { required: true })
</script>

<template>
  <BundlePicker v-model="groups" :bundles="bundles" @apply="name => emit('apply', name)" />
  <div class="tg-form-field">
    <label :id="labelId" :for="inputId" class="tg-form-label">{{ label }}</label>
    <GroupInput v-model="groups" :available-groups="availableGroups" :input-id="inputId" :labelled-by="labelId" />
  </div>
</template>
