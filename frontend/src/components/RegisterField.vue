<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  id: string
  label: string
  type: 'text' | 'email' | 'password'
  placeholder: string
  autocomplete: string
  minlength?: number
  /** Set by the invite: read-only, dimmed, and tagged so the user knows why. */
  locked?: boolean
  hint?: string
  /** Shown in place of the hint, as an alert, while the value is invalid. */
  error?: string
}>()

const messageId = computed(() => `${props.id}-message`)

const value = defineModel<string>({ required: true })
</script>

<template>
  <div class="tg-form-field">
    <label :for="id" class="tg-form-label">
      {{ label }}
      <span v-if="locked" class="register-field-locked-tag">set by invite</span>
    </label>
    <input
      :id="id"
      v-model="value"
      :type="type"
      class="tg-input register-field-input"
      :class="{ 'register-field-input--locked': locked }"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :minlength="minlength"
      :readonly="locked"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error || hint ? messageId : undefined"
      required
    >
    <!-- v-if/v-else swaps the node, so the alert is inserted with its text and announced. -->
    <p v-if="error" :id="messageId" class="tg-form-error" role="alert">
      {{ error }}
    </p>
    <p v-else-if="hint" :id="messageId" class="tg-form-hint">
      {{ hint }}
    </p>
  </div>
</template>

<style scoped>
.register-field-locked-tag {
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  color: var(--tg-text-muted);
  margin-left: var(--tg-space-xs);
}

.register-field-input {
  width: 100%;
}

.register-field-input--locked {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
