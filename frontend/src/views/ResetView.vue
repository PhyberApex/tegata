<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../composables/useApi'
import { passwordMatchError } from '../composables/useRegisterForm'

const route = useRoute()
const api = useApi()

const token = route.params.token as string
const valid = ref<boolean | null>(null)
const username = ref('')
const success = ref(false)
const error = ref('')
const loading = ref(false)

const form = ref({
  password: '',
  confirmPassword: '',
})

onMounted(async () => {
  try {
    const res = await api.get<{ valid: boolean, username?: string }>(`/api/reset-tokens/${token}/validate`)
    valid.value = res.valid
    if (res.username)
      username.value = res.username
  }
  catch {
    valid.value = false
  }
})

async function handleReset() {
  error.value = passwordMatchError(form.value)
  if (error.value)
    return

  loading.value = true
  try {
    await api.post(`/api/reset-tokens/${token}/redeem`, {
      password: form.value.password,
    })
    success.value = true
  }
  catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Password reset failed'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="reset">
    <!-- Loading state -->
    <div v-if="valid === null" class="reset-card tg-card">
      <p class="reset-loading">
        Validating reset link...
      </p>
    </div>

    <!-- Invalid token -->
    <div v-else-if="!valid" class="reset-card tg-card">
      <div class="reset-brand">
        <span class="reset-logo">&#x624B;&#x5F62;</span>
        <h1 class="reset-title">
          Invalid Reset Link
        </h1>
      </div>
      <p class="reset-message">
        This reset link is invalid, expired, or has already been used. Ask your admin to send you a new one.
      </p>
    </div>

    <!-- Success state -->
    <div v-else-if="success" class="reset-card tg-card">
      <div class="reset-brand">
        <span class="reset-logo">&#x624B;&#x5F62;</span>
        <h1 class="reset-title">
          Password Updated
        </h1>
      </div>
      <p class="reset-message">
        Your password has been changed. You can now log in with it to any service protected by Authelia.
      </p>
    </div>

    <!-- Reset form -->
    <form v-else class="reset-card tg-card" @submit.prevent="handleReset">
      <div class="reset-brand">
        <span class="reset-logo">&#x624B;&#x5F62;</span>
        <h1 class="reset-title">
          Tegata
        </h1>
        <p class="reset-subtitle">
          Set a new password for <strong>{{ username }}</strong>
        </p>
      </div>

      <div class="reset-fields">
        <div class="reset-field">
          <label for="password" class="reset-label">New Password</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            class="tg-input reset-input"
            placeholder="Minimum 8 characters"
            autocomplete="new-password"
            minlength="8"
            required
          >
        </div>

        <div class="reset-field">
          <label for="confirm-password" class="reset-label">Confirm Password</label>
          <input
            id="confirm-password"
            v-model="form.confirmPassword"
            type="password"
            class="tg-input reset-input"
            placeholder="Repeat your password"
            autocomplete="new-password"
            minlength="8"
            required
          >
        </div>
      </div>

      <p v-if="error" class="reset-error" role="alert">
        {{ error }}
      </p>

      <button
        type="submit"
        class="tg-btn tg-btn-primary reset-submit"
        :disabled="loading"
      >
        {{ loading ? 'Updating password...' : 'Set New Password' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.reset {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--tg-space-xl);
}

.reset-card {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-xl);
}

.reset-brand {
  text-align: center;
}

.reset-logo {
  font-size: 2.5rem;
  display: block;
  margin-bottom: var(--tg-space-sm);
}

.reset-title {
  font-size: var(--tg-font-2xl);
  font-weight: 700;
  color: var(--tg-text-primary);
  margin: 0;
  letter-spacing: 0.04em;
}

.reset-subtitle {
  color: var(--tg-text-muted);
  font-size: var(--tg-font-sm);
  margin: var(--tg-space-xs) 0 0;
}

.reset-loading {
  text-align: center;
  color: var(--tg-text-muted);
}

.reset-message {
  text-align: center;
  color: var(--tg-text-secondary);
  line-height: 1.6;
}

.reset-fields {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-lg);
}

.reset-field {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-xs);
}

.reset-label {
  font-size: var(--tg-font-xs);
  font-weight: 600;
  color: var(--tg-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.reset-input {
  width: 100%;
}

.reset-error {
  color: var(--tg-danger);
  font-size: var(--tg-font-sm);
  margin: 0;
}

.reset-submit {
  width: 100%;
  padding: var(--tg-space-md);
}
</style>
