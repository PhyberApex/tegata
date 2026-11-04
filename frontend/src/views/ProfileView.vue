<script setup lang="ts">
import { ref } from 'vue'
import { useApi } from '../composables/useApi'
import { passwordMatchError } from '../composables/useRegisterForm'

const api = useApi()

const profileForm = ref({ displayname: '', email: '' })
const profileLoading = ref(false)
const profileError = ref('')
const profileSuccess = ref(false)

const passwordForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' })
const passwordLoading = ref(false)
const passwordError = ref('')
const passwordSuccess = ref(false)

async function handleUpdateProfile() {
  profileLoading.value = true
  profileError.value = ''
  profileSuccess.value = false
  try {
    await api.patch('/api/profile', {
      displayname: profileForm.value.displayname || undefined,
      email: profileForm.value.email || undefined,
    })
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
          <label for="profile-displayname" class="tg-form-label">Display Name</label>
          <input
            id="profile-displayname"
            v-model="profileForm.displayname"
            type="text"
            class="tg-input"
            placeholder="Leave blank to keep unchanged"
          >
        </div>
        <div class="tg-form-field">
          <label for="profile-email" class="tg-form-label">Email</label>
          <input
            id="profile-email"
            v-model="profileForm.email"
            type="email"
            class="tg-input"
            placeholder="Leave blank to keep unchanged"
          >
        </div>
        <p v-if="profileError" class="tg-form-error" role="alert">
          {{ profileError }}
        </p>
        <p v-if="profileSuccess" class="profile-success" role="status">
          Saved.
        </p>
        <div class="tg-form-actions">
          <button type="submit" class="tg-btn tg-btn-primary" :disabled="profileLoading">
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
</style>
