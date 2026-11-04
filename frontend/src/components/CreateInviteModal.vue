<script setup lang="ts">
import type { Bundle } from '../types'
import type { CreateInviteForm } from '../types/forms'
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

const form = defineModel<CreateInviteForm>('form', { required: true })
</script>

<template>
  <ModalOverlay title="Create Invite" @close="$emit('close')">
    <form class="tg-form" @submit.prevent="$emit('submit')">
      <GroupsField
        v-model:groups="form.groups"
        :bundles="bundles"
        :available-groups="availableGroups"
        label="Groups to assign"
        @apply="name => form.bundleName = name"
      />
      <div class="tg-form-field">
        <label for="create-expiry" class="tg-form-label">Expires in (days)</label>
        <input
          id="create-expiry"
          v-model.number="form.expiresInDays"
          type="number"
          class="tg-input"
          min="1"
          max="90"
          required
        >
      </div>
      <div class="tg-form-field">
        <label for="create-displayname" class="tg-form-label">Display name (optional)</label>
        <input
          id="create-displayname"
          v-model="form.displayname"
          type="text"
          class="tg-input"
          placeholder="Leave empty to let them choose"
        >
      </div>
      <div class="tg-form-field">
        <label for="create-email" class="tg-form-label">Email (optional)</label>
        <input
          id="create-email"
          v-model="form.email"
          type="email"
          class="tg-input"
          placeholder="Leave empty to let them choose"
        >
      </div>
      <div class="tg-form-field">
        <label class="tg-form-checkbox">
          <input
            v-model="form.sendEmail"
            type="checkbox"
            :disabled="!form.email.trim()"
          >
          Email the registration link to this address
        </label>
      </div>
      <p class="tg-form-hint">
        If set, these are locked in — the recipient can't change them when registering. The link and QR code stay available either way — sending is an extra, not a replacement.
      </p>
      <FormError :message="error" />
      <FormActions :loading="loading" loading-label="Creating..." submit-label="Create Invite" @cancel="$emit('close')" />
    </form>
  </ModalOverlay>
</template>
