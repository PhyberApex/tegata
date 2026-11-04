<script setup lang="ts">
import type { InviteValidation } from '../composables/useRegisterForm'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import RegisterField from '../components/RegisterField.vue'
import { useApi } from '../composables/useApi'
import { inviteFieldsPatch, passwordMatchError } from '../composables/useRegisterForm'

const route = useRoute()
const api = useApi()

const token = route.params.token as string
const valid = ref<boolean | null>(null)
const groups = ref<string[]>([])
const success = ref(false)
const error = ref('')
const loading = ref(false)

const form = ref({
  username: '',
  displayname: '',
  email: '',
  password: '',
  confirmPassword: '',
})

const lockedDisplayname = ref(false)
const lockedEmail = ref(false)

interface RegisterFieldSpec {
  key: keyof typeof form.value
  id: string
  label: string
  type: 'text' | 'email' | 'password'
  placeholder: string
  autocomplete: string
  minlength?: number
  locked?: boolean
}

const fields = computed<RegisterFieldSpec[]>(() => [
  {
    key: 'username',
    id: 'username',
    label: 'Username',
    type: 'text',
    placeholder: 'Choose a username',
    autocomplete: 'username',
  },
  {
    key: 'displayname',
    id: 'displayname',
    label: 'Display Name',
    type: 'text',
    placeholder: 'Your display name',
    autocomplete: 'name',
    locked: lockedDisplayname.value,
  },
  {
    key: 'email',
    id: 'email',
    label: 'Email',
    type: 'email',
    placeholder: 'your@email.com',
    autocomplete: 'email',
    locked: lockedEmail.value,
  },
  {
    key: 'password',
    id: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'Minimum 8 characters',
    autocomplete: 'new-password',
    minlength: 8,
  },
  {
    key: 'confirmPassword',
    id: 'confirm-password',
    label: 'Confirm Password',
    type: 'password',
    placeholder: 'Repeat your password',
    autocomplete: 'new-password',
    minlength: 8,
  },
])

onMounted(async () => {
  try {
    const res = await api.get<InviteValidation>(`/api/invites/${token}/validate`)
    valid.value = res.valid
    if (res.groups)
      groups.value = res.groups
    const patch = inviteFieldsPatch(form.value, res)
    form.value.displayname = patch.displayname
    form.value.email = patch.email
    lockedDisplayname.value = patch.lockedDisplayname
    lockedEmail.value = patch.lockedEmail
  }
  catch {
    valid.value = false
  }
})

async function handleRegister() {
  error.value = passwordMatchError(form.value)
  if (error.value)
    return

  loading.value = true
  try {
    await api.post(`/api/invites/${token}/redeem`, {
      username: form.value.username,
      displayname: form.value.displayname,
      email: form.value.email,
      password: form.value.password,
    })
    success.value = true
  }
  catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Registration failed'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="register">
    <!-- Loading state -->
    <div v-if="valid === null" class="register-card tg-card">
      <p class="register-loading">
        Validating invite...
      </p>
    </div>

    <!-- Invalid invite -->
    <div v-else-if="!valid" class="register-card tg-card">
      <div class="register-brand">
        <span class="register-logo">&#x624B;&#x5F62;</span>
        <h1 class="register-title">
          Invalid Invite
        </h1>
      </div>
      <p class="register-message">
        This invite link is invalid, expired, or has already been used. Ask your admin to send you a new one.
      </p>
    </div>

    <!-- Success state -->
    <div v-else-if="success" class="register-card tg-card">
      <div class="register-brand">
        <span class="register-logo">&#x624B;&#x5F62;</span>
        <h1 class="register-title">
          Welcome!
        </h1>
      </div>
      <p class="register-message">
        Your account has been created. You can now log in to any service protected by Authelia.
      </p>
      <p class="register-hint">
        Your admin can tell you which services are available.
      </p>
    </div>

    <!-- Registration form -->
    <form v-else class="register-card tg-card" @submit.prevent="handleRegister">
      <div class="register-brand">
        <span class="register-logo">&#x624B;&#x5F62;</span>
        <h1 class="register-title">
          Tegata
        </h1>
        <p class="register-subtitle">
          You've been invited to register
        </p>
      </div>

      <div v-if="groups.length" class="register-groups">
        <span class="register-groups-label">You'll be added to:</span>
        <div class="register-groups-list">
          <span v-for="g in groups" :key="g" class="tg-badge">{{ g }}</span>
        </div>
      </div>

      <div class="register-fields">
        <RegisterField
          v-for="field in fields"
          :id="field.id"
          :key="field.key"
          v-model="form[field.key]"
          :label="field.label"
          :type="field.type"
          :placeholder="field.placeholder"
          :autocomplete="field.autocomplete"
          :minlength="field.minlength"
          :locked="field.locked"
        />
      </div>

      <p v-if="error" class="register-error" role="alert">
        {{ error }}
      </p>

      <button
        type="submit"
        class="tg-btn tg-btn-primary register-submit"
        :disabled="loading"
      >
        {{ loading ? 'Creating account...' : 'Create Account' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.register {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--tg-space-xl);
}

.register-card {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-xl);
}

.register-brand {
  text-align: center;
}

.register-logo {
  font-size: 2.5rem;
  display: block;
  margin-bottom: var(--tg-space-sm);
}

.register-title {
  font-size: var(--tg-font-2xl);
  font-weight: 700;
  color: var(--tg-text-primary);
  margin: 0;
  letter-spacing: 0.04em;
}

.register-subtitle {
  color: var(--tg-text-muted);
  font-size: var(--tg-font-sm);
  margin: var(--tg-space-xs) 0 0;
}

.register-loading {
  text-align: center;
  color: var(--tg-text-muted);
}

.register-message {
  text-align: center;
  color: var(--tg-text-secondary);
  line-height: 1.6;
}

.register-groups {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-sm);
  align-items: center;
}

.register-groups-label {
  font-size: var(--tg-font-xs);
  color: var(--tg-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.register-groups-list {
  display: flex;
  gap: var(--tg-space-xs);
  flex-wrap: wrap;
  justify-content: center;
}

.register-fields {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-lg);
}

.register-error {
  color: var(--tg-danger);
  font-size: var(--tg-font-sm);
  margin: 0;
}

.register-hint {
  text-align: center;
  color: var(--tg-text-muted);
  font-size: var(--tg-font-xs);
  margin: 0;
}

.register-submit {
  width: 100%;
  padding: var(--tg-space-md);
}
</style>
