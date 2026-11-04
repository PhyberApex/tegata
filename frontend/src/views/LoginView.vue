<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../composables/useApi'
import { useAuth } from '../composables/useAuth'

const { login } = useAuth()
const api = useApi()
const route = useRoute()
const password = ref('')
const error = ref('')
const loading = ref(false)

// Which doors this client is offered comes from the backend — it knows the
// source address, the card does not. Fail closed: if the backend can't be
// asked, the break-glass form stays hidden rather than 403ing on submit.
const nativePasswordLogin = ref(false)

const ssoError = computed(() => {
  const e = route.query.error
  if (e === 'sso_failed')
    return 'SSO authentication failed. Please try again.'
  return ''
})

onMounted(async () => {
  try {
    const methods = await api.get<{ nativePasswordLogin: boolean }>('/api/auth/methods')
    nativePasswordLogin.value = methods.nativePasswordLogin
  }
  catch {
    nativePasswordLogin.value = false
  }
})

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await login(password.value)
  }
  catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Login failed'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login-card tg-card">
      <div class="login-brand">
        <span class="login-logo">&#x624B;&#x5F62;</span>
        <h1 class="login-title">
          Tegata
        </h1>
        <p class="login-subtitle">
          User Management
        </p>
      </div>

      <p v-if="ssoError" class="login-error" role="alert">
        {{ ssoError }}
      </p>

      <a
        href="/api/auth/oidc/login"
        class="tg-btn tg-btn-primary login-submit login-sso"
      >
        Login with Authelia
      </a>

      <p v-if="!nativePasswordLogin" class="login-remote-note">
        Password login works only from a trusted network.
      </p>

      <form v-else class="login-breakglass" @submit.prevent="handleLogin">
        <div class="login-divider">
          <span>break glass</span>
        </div>

        <p class="login-breakglass-note">
          Use the admin password only when Authelia is down and SSO can't answer.
        </p>

        <div class="login-field">
          <label for="password" class="login-label">Admin Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="tg-input login-input"
            placeholder="Enter admin password"
            autocomplete="current-password"
            required
          >
        </div>

        <p v-if="error" class="login-error" role="alert">
          {{ error }}
        </p>

        <button
          type="submit"
          class="tg-btn tg-btn-ghost login-submit"
          :disabled="loading || !password"
        >
          {{ loading ? 'Authenticating...' : 'Unlock' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--tg-space-xl);
}

.login-card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-xl);
}

.login-brand {
  text-align: center;
}

.login-logo {
  font-size: 2.5rem;
  display: block;
  margin-bottom: var(--tg-space-sm);
}

.login-title {
  font-size: var(--tg-font-2xl);
  font-weight: 700;
  color: var(--tg-text-primary);
  margin: 0;
  letter-spacing: 0.04em;
}

.login-subtitle {
  color: var(--tg-text-muted);
  font-size: var(--tg-font-sm);
  margin: var(--tg-space-xs) 0 0;
}

.login-breakglass {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-md);
}

.login-breakglass-note,
.login-remote-note {
  color: var(--tg-text-muted);
  font-size: var(--tg-font-xs);
  margin: 0;
  text-align: center;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-xs);
}

.login-label {
  font-size: var(--tg-font-xs);
  font-weight: 600;
  color: var(--tg-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.login-input {
  width: 100%;
}

.login-error {
  color: var(--tg-danger);
  font-size: var(--tg-font-sm);
  margin: 0;
}

.login-submit {
  width: 100%;
  padding: var(--tg-space-md);
}

.login-sso {
  text-align: center;
  text-decoration: none;
  display: block;
}

.login-divider {
  display: flex;
  align-items: center;
  gap: var(--tg-space-md);
  color: var(--tg-text-muted);
  font-size: var(--tg-font-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.login-divider::before,
.login-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--tg-border);
}
</style>
