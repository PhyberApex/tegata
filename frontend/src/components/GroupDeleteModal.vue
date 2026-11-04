<script setup lang="ts">
import type { GroupInUseConflict } from '../types'
import { computed } from 'vue'
import DeleteConfirmModal from './DeleteConfirmModal.vue'

const props = defineProps<{
  target: string
  memberCount: number
  /** The backend's 409 — set once a first delete has been refused, turning this into the confirm step. */
  conflict: GroupInUseConflict | null
  loading: boolean
  error: string
}>()

defineEmits<{ confirm: [], close: [] }>()

const references = computed(() => {
  const conflict = props.conflict
  if (!conflict)
    return []
  return [
    { label: 'Members', items: conflict.members },
    {
      label: 'Pending invites',
      items: conflict.invites.map(invite => invite.email ?? invite.id),
    },
    { label: 'Bundles', items: conflict.bundles },
  ].filter(section => section.items.length > 0)
})
</script>

<template>
  <DeleteConfirmModal
    title="Delete Group"
    :target="target"
    :confirm-label="conflict ? 'Delete Anyway' : 'Delete'"
    :loading="loading"
    :error="error"
    @confirm="$emit('confirm')"
    @close="$emit('close')"
  >
    <template v-if="conflict">
      <p v-if="conflict.emptiedGroups.length" class="tg-guarded-group-warning" role="alert">
        This would leave no enabled members in <strong>{{ conflict.emptiedGroups.join(', ') }}</strong>.
      </p>
      <p class="tg-form-hint">
        <strong>{{ target }}</strong> is still in use. Deleting it removes it from all of these:
      </p>
      <dl class="group-delete-refs">
        <template v-for="section in references" :key="section.label">
          <dt class="tg-form-label">
            {{ section.label }}
          </dt>
          <dd class="group-delete-items">
            {{ section.items.join(', ') }}
          </dd>
        </template>
      </dl>
    </template>
    <p v-else class="tg-form-hint">
      Are you sure you want to delete <strong>{{ target }}</strong>?
      It has {{ memberCount }} member{{ memberCount === 1 ? '' : 's' }}. This cannot be undone.
    </p>
  </DeleteConfirmModal>
</template>

<style scoped>
.group-delete-refs {
  display: grid;
  gap: var(--tg-space-xs);
  margin: 0;
}

.group-delete-items {
  margin: 0;
  font-size: var(--tg-font-sm);
  overflow-wrap: anywhere;
}
</style>
