<script setup lang="ts">
import type { EffectiveAccessDiffResult, EffectiveAccessNote, EffectiveDomainGrant, EffectiveOidcClientGrant } from '../composables/effectiveAccess'
import type { AccessDiffItem } from './AccessDiffSection.vue'
import { computed } from 'vue'
import AccessDiffSection from './AccessDiffSection.vue'
import ModalOverlay from './ModalOverlay.vue'

const props = defineProps<{
  diff: EffectiveAccessDiffResult
  notes: EffectiveAccessNote[]
  emptiedGroups: string[]
  loading: boolean
  error: string
}>()

const emit = defineEmits<{ confirm: [], cancel: [] }>()

function grantItems(side: 'added' | 'removed', domains: EffectiveDomainGrant[], clients: EffectiveOidcClientGrant[]): AccessDiffItem[] {
  return [
    ...domains.map(g => ({ key: `${side}-domain-${g.group}-${g.domain}-${g.policy}-${g.source}`, label: g.domain, group: g.group })),
    ...clients.map(g => ({ key: `${side}-oidc-${g.group}-${g.policyName}-${g.clientName}`, label: g.clientName, group: g.group })),
  ]
}

const added = computed(() =>
  props.diff.available
    ? grantItems('added', props.diff.addedDomains, props.diff.addedOidcClients)
    : [],
)
const removed = computed(() =>
  props.diff.available
    ? grantItems('removed', props.diff.removedDomains, props.diff.removedOidcClients)
    : [],
)
const noteItems = computed<AccessDiffItem[]>(() =>
  props.diff.available
    ? props.notes.map((entry, index) => ({ key: `note-${entry.group}-${index}`, label: entry.note, group: entry.group }))
    : [],
)

const isNoOp = computed(() =>
  props.diff.available
  && !added.value.length
  && !removed.value.length
  && !props.emptiedGroups.length,
)

const confirmLabel = computed(() => {
  if (props.loading)
    return 'Saving...'
  return props.diff.available ? 'Confirm' : 'Save Anyway'
})

function handleClose() {
  if (!props.loading)
    emit('cancel')
}
</script>

<template>
  <ModalOverlay title="Confirm Access Change" @close="handleClose">
    <p v-if="emptiedGroups.length" class="tg-guarded-group-warning" role="alert">
      This would leave no enabled members in <strong>{{ emptiedGroups.join(', ') }}</strong>.
    </p>

    <p v-if="!diff.available" class="tg-form-hint" role="alert">
      {{ diff.reason }}
    </p>

    <p v-else-if="isNoOp" class="tg-form-hint">
      This membership change doesn't affect access.
    </p>

    <template v-else>
      <AccessDiffSection title="Added" tone="added" :items="added" />
      <AccessDiffSection title="Removed" tone="removed" :items="removed" />
    </template>

    <AccessDiffSection title="Notes" notes :items="noteItems" />

    <p v-if="error" class="tg-form-error" role="alert">
      {{ error }}
    </p>

    <div class="tg-form-actions">
      <button class="tg-btn tg-btn-ghost" :disabled="loading" @click="$emit('cancel')">
        Cancel
      </button>
      <button class="tg-btn tg-btn-primary" :disabled="loading" @click="$emit('confirm')">
        {{ confirmLabel }}
      </button>
    </div>
  </ModalOverlay>
</template>
