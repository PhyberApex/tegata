<script setup lang="ts">
import type { AccessPreviewResponse, Bundle, Group, ResetToken, User } from '../types'
import type { CreateUserForm, EditUserForm, ResetLinkForm } from '../types/forms'
import { computed, onMounted, ref } from 'vue'
import CreateUserModal from '../components/CreateUserModal.vue'
import DeleteConfirmModal from '../components/DeleteConfirmModal.vue'
import EditUserModal from '../components/EditUserModal.vue'
import EnabledCountConfirmModal from '../components/EnabledCountConfirmModal.vue'
import ResetLinkModal from '../components/ResetLinkModal.vue'
import UserTable from '../components/UserTable.vue'
import { computeEffectiveAccess, computeEmptiedGuardedGroups } from '../composables/effectiveAccess'
import { confirmAccessDiffWithGuardFallback, useAccessDiffConfirm } from '../composables/useAccessDiffConfirm'
import { isEnabledCountGuardError, useApi } from '../composables/useApi'
import { useEnabledCountConfirm } from '../composables/useEnabledCountConfirm'
import { useModalAction } from '../composables/useModalAction'
import { outstandingResetTokenFor, resetLinkUrl } from '../utils/resetTokens'

const api = useApi()
const users = ref<User[]>([])
const groups = ref<string[]>([])
const bundles = ref<Bundle[]>([])
const resetTokens = ref<ResetToken[]>([])
const accessPreview = ref<AccessPreviewResponse | null>(null)
const error = ref('')

const accessDiffConfirm = useAccessDiffConfirm()
const enabledCountConfirm = useEnabledCountConfirm()
const modalAction = useModalAction()

const normalizedAccessPreview = computed<AccessPreviewResponse>(() =>
  accessPreview.value ?? { available: false, reason: 'Access preview could not be loaded.', guardedGroups: [] },
)

// Modal states
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showResetLinkModal = ref(false)
const showDeleteConfirm = ref(false)

const createForm = ref<CreateUserForm>({
  username: '',
  displayname: '',
  email: '',
  password: '',
  groups: [],
})
const editForm = ref<EditUserForm>({
  username: '',
  displayname: '',
  email: '',
  groups: [],
})
const originalEditGroups = ref<string[]>([])
const resetLinkTarget = ref('')
const resetLinkForm = ref<ResetLinkForm>({ expiresInDays: 1, sendEmail: false })
const resetLinkCopied = ref(false)
const sendingResetLink = ref(false)
const deleteTarget = ref('')
const togglingUsername = ref<string | null>(null)

const outstandingResetToken = computed(() => outstandingResetTokenFor(resetTokens.value, resetLinkTarget.value))
const outstandingTokenExpired = computed(() =>
  outstandingResetToken.value !== null && new Date(outstandingResetToken.value.expires_at) <= new Date(),
)

const editEffectiveAccess = computed(() => computeEffectiveAccess(normalizedAccessPreview.value, editForm.value.groups))

async function loadData() {
  const accessPreviewPromise = api.get<AccessPreviewResponse>('/api/access-preview').catch(() => null)

  try {
    const [u, g, rt, b] = await Promise.all([
      api.get<User[]>('/api/users'),
      api.get<Group[]>('/api/groups'),
      api.get<ResetToken[]>('/api/reset-tokens'),
      api.get<Bundle[]>('/api/bundles'),
    ])
    users.value = u
    groups.value = g.map(gr => gr.name)
    resetTokens.value = rt
    bundles.value = b
  }
  catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Failed to load data'
  }

  accessPreview.value = await accessPreviewPromise
}

onMounted(loadData)

function openCreate() {
  createForm.value = {
    username: '',
    displayname: '',
    email: '',
    password: '',
    groups: ['users'],
  }
  modalAction.error.value = ''
  showCreateModal.value = true
}

function openEdit(user: User) {
  editForm.value = {
    username: user.username,
    displayname: user.displayname,
    email: user.email,
    groups: [...user.groups],
  }
  originalEditGroups.value = [...user.groups]
  modalAction.error.value = ''
  showEditModal.value = true
}

function openResetLink(username: string) {
  resetLinkTarget.value = username
  resetLinkForm.value = { expiresInDays: 1, sendEmail: false }
  resetLinkCopied.value = false
  sendingResetLink.value = false
  modalAction.error.value = ''
  showResetLinkModal.value = true
}

function openDelete(username: string) {
  deleteTarget.value = username
  showDeleteConfirm.value = true
}

async function handleCreate() {
  await modalAction.run(async () => {
    await api.post('/api/users', createForm.value)
    showCreateModal.value = false
    await loadData()
  }, 'Failed to create user')
}

async function saveEditedUser(confirm: boolean) {
  const { username, ...updates } = editForm.value
  await api.patch(`/api/users/${encodeURIComponent(username)}`, confirm
    ? { ...updates, confirm: true }
    : updates)
  showEditModal.value = false
  await loadData()
}

async function handleEdit() {
  modalAction.loading.value = true
  modalAction.error.value = ''
  try {
    const emptiedGroups = computeEmptiedGuardedGroups(
      users.value,
      normalizedAccessPreview.value.guardedGroups,
      editForm.value.username,
      editForm.value.groups,
    )
    await accessDiffConfirm.requestSave(
      normalizedAccessPreview.value,
      originalEditGroups.value,
      editForm.value.groups,
      saveEditedUser,
      emptiedGroups,
    )
  }
  catch (err) {
    if (isEnabledCountGuardError(err)) {
      showEditModal.value = false
      accessDiffConfirm.cancel()
      enabledCountConfirm.open(err.message, () => saveEditedUser(true))
    }
    else {
      modalAction.error.value = err instanceof Error
        ? err.message
        : 'Failed to update user'
    }
  }
  finally {
    modalAction.loading.value = false
  }
}

function handleAccessDiffConfirm() {
  return confirmAccessDiffWithGuardFallback(accessDiffConfirm, enabledCountConfirm, () => {
    showEditModal.value = false
  })
}

async function handleGenerateResetLink() {
  await modalAction.run(async () => {
    await api.post<ResetToken>('/api/reset-tokens', {
      username: resetLinkTarget.value,
      expiresInDays: resetLinkForm.value.expiresInDays,
      ...resetLinkForm.value.sendEmail
        ? { sendEmail: true }
        : {},
    })
    await loadData()
  }, 'Failed to generate reset link')
}

async function handleRevokeResetLink() {
  if (!outstandingResetToken.value)
    return
  await modalAction.run(async () => {
    await api.del(`/api/reset-tokens/${outstandingResetToken.value!.id}`)
    await loadData()
  }, 'Failed to revoke reset link')
}

async function handleSendResetLink() {
  if (!outstandingResetToken.value)
    return
  sendingResetLink.value = true
  modalAction.error.value = ''
  try {
    await api.post(`/api/reset-tokens/${outstandingResetToken.value.id}/send`)
    await loadData()
  }
  catch (err) {
    modalAction.error.value = err instanceof Error
      ? err.message
      : 'Failed to send reset link email'
  }
  finally {
    sendingResetLink.value = false
  }
}

async function copyResetLink(token: ResetToken) {
  try {
    await navigator.clipboard.writeText(resetLinkUrl(token.token))
    resetLinkCopied.value = true
    setTimeout(() => {
      resetLinkCopied.value = false
    }, 2000)
  }
  catch {
    modalAction.error.value = 'Could not copy — try using HTTPS or copy the link manually'
  }
}

function handleToggleDisabledError(err: unknown, user: User) {
  if (isEnabledCountGuardError(err)) {
    enabledCountConfirm.open(err.message, async () => {
      await api.patch(`/api/users/${encodeURIComponent(user.username)}`, { disabled: !user.disabled, confirm: true })
      await loadData()
    })
    return
  }
  error.value = err instanceof Error
    ? err.message
    : 'Failed to update user'
}

async function handleToggleDisabled(user: User) {
  if (togglingUsername.value)
    return
  togglingUsername.value = user.username
  error.value = ''
  try {
    await api.patch(`/api/users/${encodeURIComponent(user.username)}`, { disabled: !user.disabled })
    await loadData()
  }
  catch (err) {
    handleToggleDisabledError(err, user)
  }
  finally {
    togglingUsername.value = null
  }
}

async function handleDelete() {
  modalAction.loading.value = true
  modalAction.error.value = ''
  try {
    await api.del(`/api/users/${encodeURIComponent(deleteTarget.value)}`)
    showDeleteConfirm.value = false
    await loadData()
  }
  catch (err) {
    if (isEnabledCountGuardError(err)) {
      showDeleteConfirm.value = false
      const target = deleteTarget.value
      enabledCountConfirm.open(err.message, async () => {
        await api.del(`/api/users/${encodeURIComponent(target)}`, { confirm: true })
        await loadData()
      })
    }
    else {
      modalAction.error.value = err instanceof Error
        ? err.message
        : 'Failed to delete user'
    }
  }
  finally {
    modalAction.loading.value = false
  }
}
</script>

<template>
  <div class="users">
    <div class="users-header">
      <h1 class="users-title">
        Users
      </h1>
      <button class="tg-btn tg-btn-primary" @click="openCreate">
        + New User
      </button>
    </div>

    <p v-if="error" class="tg-error" role="alert">
      {{ error }}
    </p>

    <div v-if="users.length === 0 && !error" class="tg-empty">
      <span class="tg-empty-icon">&#x1F465;</span>
      <p class="tg-empty-text">
        No users yet. Create your first user or generate an invite link to get started.
      </p>
      <button class="tg-btn tg-btn-primary" @click="openCreate">
        + Create First User
      </button>
    </div>

    <UserTable
      v-else
      :users="users"
      :reset-tokens="resetTokens"
      :toggling-username="togglingUsername"
      @edit="openEdit"
      @reset-link="openResetLink"
      @toggle="handleToggleDisabled"
      @delete="openDelete"
    />

    <!-- Create Modal -->
    <CreateUserModal
      v-if="showCreateModal"
      v-model:form="createForm"
      :bundles="bundles"
      :available-groups="groups"
      :error="modalAction.error.value"
      :loading="modalAction.loading.value"
      @submit="handleCreate"
      @close="showCreateModal = false"
    />

    <!-- Edit Modal -->
    <EditUserModal
      v-if="showEditModal"
      v-model:form="editForm"
      :bundles="bundles"
      :available-groups="groups"
      :effective-access="editEffectiveAccess"
      :error="modalAction.error.value"
      :loading="modalAction.loading.value"
      :access-diff-show="accessDiffConfirm.show.value"
      :access-diff-diff="accessDiffConfirm.diff.value"
      :access-diff-notes="accessDiffConfirm.notes.value"
      :access-diff-emptied-groups="accessDiffConfirm.emptiedGroups.value"
      :access-diff-loading="accessDiffConfirm.confirmLoading.value"
      :access-diff-error="accessDiffConfirm.confirmError.value"
      @submit="handleEdit"
      @close="showEditModal = false; accessDiffConfirm.cancel()"
      @access-diff-confirm="handleAccessDiffConfirm"
      @access-diff-cancel="accessDiffConfirm.cancel"
    />

    <!-- Reset Link Modal -->
    <ResetLinkModal
      v-if="showResetLinkModal"
      v-model:form="resetLinkForm"
      :target="resetLinkTarget"
      :outstanding-token="outstandingResetToken"
      :token-expired="outstandingTokenExpired"
      :copied="resetLinkCopied"
      :sending="sendingResetLink"
      :error="modalAction.error.value"
      :loading="modalAction.loading.value"
      @generate="handleGenerateResetLink"
      @revoke="handleRevokeResetLink"
      @send="handleSendResetLink"
      @copy="outstandingResetToken && copyResetLink(outstandingResetToken)"
      @close="showResetLinkModal = false"
    />

    <!-- Delete Confirm -->
    <DeleteConfirmModal
      v-if="showDeleteConfirm"
      title="Delete User"
      :target="deleteTarget"
      :loading="modalAction.loading.value"
      :error="modalAction.error.value"
      @confirm="handleDelete"
      @close="showDeleteConfirm = false"
    />

    <!-- Enabled-Count Guard Confirm -->
    <EnabledCountConfirmModal
      v-if="enabledCountConfirm.show.value"
      :message="enabledCountConfirm.message.value"
      :error="enabledCountConfirm.error.value"
      :loading="enabledCountConfirm.loading.value"
      @confirm="enabledCountConfirm.confirm"
      @close="enabledCountConfirm.close"
    />
  </div>
</template>

<style scoped>
.users-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--tg-space-xl);
}

.users-title {
  font-size: var(--tg-font-xl);
  font-weight: 600;
  margin: 0;
}
</style>
