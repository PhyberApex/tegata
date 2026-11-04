<script setup lang="ts">
import type { EffectiveAccessResult } from '../composables/effectiveAccess'
import { computed } from 'vue'
import AccessGrantList from './AccessGrantList.vue'

const props = withDefaults(defineProps<{
  result: EffectiveAccessResult
  showGroup?: boolean
}>(), {
  showGroup: true,
})

const isEmpty = computed(() =>
  props.result.available && !props.result.domains.length && !props.result.oidcClients.length && !props.result.notes.length,
)

const domainItems = computed(() => !props.result.available
  ? []
  : props.result.domains.map(grant => ({
      key: `${grant.group}-${grant.domain}-${grant.policy}-${grant.source}`,
      name: grant.domain,
      policy: grant.policy,
      group: grant.group,
    })))

const oidcClientItems = computed(() => !props.result.available
  ? []
  : props.result.oidcClients.map(grant => ({
      key: `${grant.group}-${grant.policyName}-${grant.clientName}`,
      name: grant.clientName,
      policy: grant.policy,
      group: grant.group,
    })))
</script>

<template>
  <div class="effective-access">
    <p v-if="!result.available" class="tg-form-hint" role="alert">
      {{ result.reason }}
    </p>

    <p v-else-if="isEmpty" class="tg-form-hint">
      No effective access from current groups.
    </p>

    <template v-else>
      <AccessGrantList title="Domains" :items="domainItems" :show-group="showGroup" />
      <AccessGrantList title="Apps (OIDC)" :items="oidcClientItems" :show-group="showGroup" />

      <template v-if="result.notes.length">
        <h3 class="tg-access-section-title">
          Notes
        </h3>
        <ul class="tg-access-list">
          <li v-for="(entry, index) in result.notes" :key="`${entry.group}-${index}`" class="tg-access-note">
            {{ entry.note }} <span v-if="showGroup" class="tg-badge tg-access-item-group">{{ entry.group }}</span>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>

<style scoped>
.effective-access {
  display: flex;
  flex-direction: column;
}
</style>
