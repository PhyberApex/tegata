<script setup lang="ts">
import { computed } from 'vue'
import FormActions from './FormActions.vue'
import FormError from './FormError.vue'
import ModalOverlay from './ModalOverlay.vue'

const props = defineProps<{
  /** The noun in the title: "Create Bundle", "Edit Group". */
  entity: string
  /** Edit locks the name, which is the entity's key; create requires it. */
  editing: boolean
  loading: boolean
  error: string
}>()

defineEmits<{ submit: [], close: [] }>()

const name = defineModel<string>('name', { required: true })
const description = defineModel<string>('description', { required: true })

const idPrefix = computed(() => props.editing ? 'edit' : 'create')
const title = computed(() => `${props.editing ? 'Edit' : 'Create'} ${props.entity}`)
</script>

<template>
  <ModalOverlay :title="title" @close="$emit('close')">
    <form class="tg-form" @submit.prevent="$emit('submit')">
      <div class="tg-form-field">
        <label :for="`${idPrefix}-name`" class="tg-form-label">Name</label>
        <input :id="`${idPrefix}-name`" v-model="name" type="text" class="tg-input" :disabled="editing" :required="!editing">
      </div>
      <div class="tg-form-field">
        <label :for="`${idPrefix}-description`" class="tg-form-label">Description</label>
        <input :id="`${idPrefix}-description`" v-model="description" type="text" class="tg-input">
      </div>
      <slot />
      <FormError :message="error" />
      <FormActions
        :loading="loading"
        :loading-label="editing ? 'Saving...' : 'Creating...'"
        :submit-label="editing ? 'Save' : 'Create'"
        @cancel="$emit('close')"
      />
    </form>
  </ModalOverlay>
</template>
