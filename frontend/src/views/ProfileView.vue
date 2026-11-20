<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useApi } from '../composables/useApi'
import { passwordMatchError } from '../composables/useRegisterForm'

interface ProfileFields { displayname: string, email: string }

const api = useApi()

const username = ref('')
/** What is on file, as last read or saved; the form sends only what differs from it. */
const saved = ref<ProfileFields | null>(null)
const profileForm = ref<ProfileFields>({ displayname: '', email: '' })
const profileLoading = ref(false)
const profileError = ref('')
const profileSuccess = ref(false)
const profileUnchanged = ref(false)

onMounted(async () => {
  try {
    const profile = await api.get<ProfileFields & { username: string }>('/api/profile')
    username.value = profile.username
    saved.value = { displayname: profile.displayname, email: profile.email }
    profileForm.value = { ...saved.value }
  }
  catch (err) {
    profileError.value = err instanceof Error
      ? err.message
      : 'Failed to load profile'
  }
})

function changedFields(): Partial<ProfileFields> {
  const changes: Partial<ProfileFields> = {}
  if (profileForm.value.displayname !== saved.value?.displayname)
    changes.displayname = profileForm.value.displayname
  if (profileForm.value.email !== saved.value?.email)
    changes.email = profileForm.value.email
  return changes
}

const passwordForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' })
const passwordLoading = ref(false)
const passwordError = ref('')
const passwordSuccess = ref(false)

async function handleUpdateProfile() {
  profileError.value = ''
  profileSuccess.value = false
  profileUnchanged.value = false
  const changes = changedFields()
  if (Object.keys(changes).length === 0) {
    profileUnchanged.value = true
    return
  }

  profileLoading.value = true
  try {
    await api.patch('/api/profile', changes)
    saved.value = {
      ...saved.value!,
      ...changes,
    }
    profileSuccess.value = true
  }
  catch (err) {
    profileError.value = err instanceof Error
      ? err.message
      : 'Failed to update profile'
  }
  finally {
    profileLoading.value = false
  }
}

async function handleChangePassword() {
  passwordError.value = passwordMatchError({
    password: passwordForm.value.newPassword,
    confirmPassword: passwordForm.value.confirmPassword,
  })
  if (passwordError.value)
    return

  passwordLoading.value = true
  passwordSuccess.value = false
  try {
    await api.post('/api/profile/password', {
      currentPassword: passwordForm.value.currentPassword,
      newPassword: passwordForm.value.newPassword,
    })
    passwordSuccess.value = true
    passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
  }
  catch (err) {
    passwordError.value = err instanceof Error
      ? err.message
      : 'Failed to change password'
  }
  finally {
    passwordLoading.value = false
  }
}
</script>

<template>
  <div class="profile">
    <h1 class="profile-title">
      Profile
    </h1>

    <div class="tg-card profile-card">
      <h2 class="profile-card-title">
        Display Name & Email
      </h2>
      <form class="tg-form" @submit.prevent="handleUpdateProfile">
        <div class="tg-form-field">
          <label for="profile-username" class="tg-form-label">Username</label>
          <input
            id="profile-username"
            :value="username"
            type="text"
            class="tg-input"
            readonly
          >
        </div>
        <div class="tg-form-field">
          <label for="profile-displayname" class="tg-form-label">Display Name</label>
          <input
            id="profile-displayname"
            v-model="profileForm.displayname"
            type="text"
            class="tg-input"
            required
          >
        </div>
        <div class="tg-form-field">
          <label for="profile-email" class="tg-form-label">Email</label>
          <input
            id="profile-email"
            v-model="profileForm.email"
            type="email"
            class="tg-input"
          >
        </div>
        <p v-if="profileError" class="tg-form-error" role="alert">
          {{ profileError }}
        </p>
        <p v-if="profileSuccess" class="profile-success" role="status">
          Saved.
        </p>
        <p v-if="profileUnchanged" class="profile-unchanged" role="status">
          Nothing changed.
        </p>
        <div class="tg-form-actions">
          <button type="submit" class="tg-btn tg-btn-primary" :disabled="profileLoading || !saved">
            {{ profileLoading ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </form>
    </div>

    <div class="tg-card profile-card">
      <h2 class="profile-card-title">
        Change Password
      </h2>
      <form class="tg-form" @submit.prevent="handleChangePassword">
        <div class="tg-form-field">
          <label for="profile-current-password" class="tg-form-label">Current Password</label>
          <input
            id="profile-current-password"
            v-model="passwordForm.currentPassword"
            type="password"
            class="tg-input"
            autocomplete="current-password"
            required
          >
        </div>
        <div class="tg-form-field">
          <label for="profile-new-password" class="tg-form-label">New Password</label>
          <input
            id="profile-new-password"
            v-model="passwordForm.newPassword"
            type="password"
            class="tg-input"
            autocomplete="new-password"
            minlength="8"
            required
          >
        </div>
        <div class="tg-form-field">
          <label for="profile-confirm-password" class="tg-form-label">Confirm New Password</label>
          <input
            id="profile-confirm-password"
            v-model="passwordForm.confirmPassword"
            type="password"
            class="tg-input"
            autocomplete="new-password"
            minlength="8"
            required
          >
        </div>
        <p v-if="passwordError" class="tg-form-error" role="alert">
          {{ passwordError }}
        </p>
        <p v-if="passwordSuccess" class="profile-success" role="status">
          Password changed.
        </p>
        <div class="tg-form-actions">
          <button type="submit" class="tg-btn tg-btn-primary" :disabled="passwordLoading">
            {{ passwordLoading ? 'Changing...' : 'Change Password' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-xl);
  max-width: 480px;
}

.profile-title {
  font-size: var(--tg-font-xl);
  font-weight: 600;
  margin: 0;
}

.profile-card {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-md);
}

.profile-card-title {
  font-size: var(--tg-font-base);
  font-weight: 600;
  margin: 0;
}

.profile-success {
  color: var(--tg-success);
  font-size: var(--tg-font-sm);
  margin: 0;
}
.profile-unchanged {
  color: var(--tg-text-secondary);
  font-size: var(--tg-font-sm);
  margin: 0;
}
</style>
