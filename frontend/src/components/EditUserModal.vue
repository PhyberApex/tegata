<script setup lang="ts">
import type { EffectiveAccessDiffResult, EffectiveAccessNote, EffectiveAccessResult } from '../composables/effectiveAccess'
import type { Bundle } from '../types'
import type { EditUserForm } from '../types/forms'
import AccessDiffConfirmModal from './AccessDiffConfirmModal.vue'
import EffectiveAccessPanel from './EffectiveAccessPanel.vue'
import FormActions from './FormActions.vue'
import FormError from './FormError.vue'
import GroupsField from './GroupsField.vue'
import ModalOverlay from './ModalOverlay.vue'

defineProps<{
  bundles: Bundle[]
  availableGroups: string[]
  effectiveAccess: EffectiveAccessResult
  error: string
  loading: boolean
  accessDiffShow: boolean
  accessDiffDiff: EffectiveAccessDiffResult | null
  accessDiffNotes: EffectiveAccessNote[]
  accessDiffEmptiedGroups: string[]
  accessDiffLoading: boolean
  accessDiffError: string
}>()

defineEmits<{ submit: [], close: [], accessDiffConfirm: [], accessDiffCancel: [] }>()

const form = defineModel<EditUserForm>('form', { required: true })
</script>

<template>
  <ModalOverlay title="Edit User" @close="$emit('close')">
    <form class="tg-form" @submit.prevent="$emit('submit')">
      <div class="tg-form-field">
        <label class="tg-form-label">Username</label>
        <input :value="form.username" type="text" class="tg-input" disabled>
      </div>
      <div class="tg-form-field">
        <label for="edit-displayname" class="tg-form-label">Display Name</label>
        <input id="edit-displayname" v-model="form.displayname" type="text" class="tg-input" required>
      </div>
      <div class="tg-form-field">
        <label for="edit-email" class="tg-form-label">Email</label>
        <input id="edit-email" v-model="form.email" type="email" class="tg-input" required>
      </div>
      <GroupsField v-model:groups="form.groups" :bundles="bundles" :available-groups="availableGroups" />
      <div class="tg-form-field">
        <label class="tg-form-label">Effective Access</label>
        <EffectiveAccessPanel :result="effectiveAccess" />
      </div>
      <FormError :message="error" />
      <FormActions :loading="loading" :disabled="accessDiffShow" loading-label="Saving..." submit-label="Save" @cancel="$emit('close')" />
    </form>
  </ModalOverlay>

  <!-- Access Diff Confirm -->
  <AccessDiffConfirmModal
    v-if="accessDiffShow && accessDiffDiff"
    :diff="accessDiffDiff"
    :notes="accessDiffNotes"
    :emptied-groups="accessDiffEmptiedGroups"
    :loading="accessDiffLoading"
    :error="accessDiffError"
    @confirm="$emit('accessDiffConfirm')"
    @cancel="$emit('accessDiffCancel')"
  />
</template>
