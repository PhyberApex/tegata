<script setup lang="ts">
import type { Bundle } from '../types'
import type { CreateUserForm } from '../types/forms'
import { usernameError, usernameRule } from '../composables/useRegisterForm'
import FormActions from './FormActions.vue'
import FormError from './FormError.vue'
import GroupsField from './GroupsField.vue'
import ModalOverlay from './ModalOverlay.vue'

defineProps<{
  bundles: Bundle[]
  availableGroups: string[]
  error: string
  loading: boolean
}>()

defineEmits<{ submit: [], close: [] }>()

const form = defineModel<CreateUserForm>('form', { required: true })
</script>

<template>
  <ModalOverlay title="Create User" @close="$emit('close')">
    <form class="tg-form" @submit.prevent="$emit('submit')">
      <div class="tg-form-field">
        <label for="create-username" class="tg-form-label">Username</label>
        <input id="create-username" v-model="form.username" type="text" class="tg-input" required>
        <p :class="usernameError(form.username) ? 'tg-form-error' : 'tg-form-hint'">
          {{ usernameRule() }}
        </p>
      </div>
      <div class="tg-form-field">
        <label for="create-displayname" class="tg-form-label">Display Name</label>
        <input id="create-displayname" v-model="form.displayname" type="text" class="tg-input" required>
      </div>
      <div class="tg-form-field">
        <label for="create-email" class="tg-form-label">Email</label>
        <input id="create-email" v-model="form.email" type="email" class="tg-input" required>
      </div>
      <div class="tg-form-field">
        <label for="create-password" class="tg-form-label">Password</label>
        <input id="create-password" v-model="form.password" type="password" class="tg-input" minlength="8" required>
      </div>
      <GroupsField v-model:groups="form.groups" :bundles="bundles" :available-groups="availableGroups" />
      <FormError :message="error" />
      <FormActions :loading="loading" loading-label="Creating..." submit-label="Create" @cancel="$emit('close')" />
    </form>
  </ModalOverlay>
</template>
