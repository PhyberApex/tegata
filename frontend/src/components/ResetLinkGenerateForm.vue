<script setup lang="ts">
import type { ResetLinkForm } from '../types/forms'
import FormActions from './FormActions.vue'
import FormError from './FormError.vue'

defineProps<{
  target: string
  error: string
  loading: boolean
}>()

defineEmits<{ generate: [], close: [] }>()

const form = defineModel<ResetLinkForm>('form', { required: true })
</script>

<template>
  <form class="tg-form" @submit.prevent="$emit('generate')">
    <p class="tg-form-hint">
      Generate a single-use link that lets <strong>{{ target }}</strong> set their own password.
    </p>
    <div class="tg-form-field">
      <label for="reset-expiry" class="tg-form-label">Expires in (days)</label>
      <input
        id="reset-expiry"
        v-model.number="form.expiresInDays"
        type="number"
        class="tg-input"
        min="1"
        max="90"
        required
      >
    </div>
    <div class="tg-form-field">
      <label class="tg-form-checkbox">
        <input v-model="form.sendEmail" type="checkbox">
        Email the reset link to {{ target }}
      </label>
    </div>
    <FormError :message="error" />
    <FormActions :loading="loading" loading-label="Generating..." submit-label="Generate Link" @cancel="$emit('close')" />
  </form>
</template>
