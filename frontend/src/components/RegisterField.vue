<script setup lang="ts">
defineProps<{
  id: string
  label: string
  type: 'text' | 'email' | 'password'
  placeholder: string
  autocomplete: string
  minlength?: number
  /** Set by the invite: read-only, dimmed, and tagged so the user knows why. */
  locked?: boolean
  hint?: string
  /** Renders the hint as an error. */
  invalid?: boolean
}>()

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
      required
    >
    <p v-if="hint" :class="invalid ? 'tg-form-error' : 'tg-form-hint'" :role="invalid ? 'alert' : undefined">
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
