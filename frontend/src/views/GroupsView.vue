<script setup lang="ts">
import type { RowAction } from '../components/RowActions.vue'
import type { AccessPreviewResponse, Group, GroupInUseConflict, User } from '../types'
import { computed, onMounted, ref } from 'vue'
import AccessDiffConfirmModal from '../components/AccessDiffConfirmModal.vue'
import ConfigNotesPanel from '../components/ConfigNotesPanel.vue'
import EffectiveAccessPanel from '../components/EffectiveAccessPanel.vue'
import EnabledCountConfirmModal from '../components/EnabledCountConfirmModal.vue'
import EntityFormModal from '../components/EntityFormModal.vue'
import GroupDeleteModal from '../components/GroupDeleteModal.vue'
import GroupMembersModal from '../components/GroupMembersModal.vue'
import ModalOverlay from '../components/ModalOverlay.vue'
import RowActions from '../components/RowActions.vue'
import { computeEffectiveAccess, computeEmptiedGuardedGroups } from '../composables/effectiveAccess'
import { confirmAccessDiffWithGuardFallback, useAccessDiffConfirm } from '../composables/useAccessDiffConfirm'
import { isEnabledCountGuardError, useApi } from '../composables/useApi'
import { useEnabledCountConfirm } from '../composables/useEnabledCountConfirm'
import { useEntityForm } from '../composables/useEntityForm'
import { useModalAction } from '../composables/useModalAction'

const api = useApi()
const groups = ref<Group[]>([])
const users = ref<User[]>([])
const error = ref('')

const accessDiffConfirm = useAccessDiffConfirm()
const enabledCountConfirm = useEnabledCountConfirm()
const modalAction = useModalAction()

const { mode: formMode, form, openCreate, openEdit, submit: handleSubmit, close: closeForm } = useEntityForm({
  noun: 'group',
  blank: () => ({ name: '', description: '' }),
  modalAction,
  create: values => api.post('/api/groups', values),
  update: ({ name, description }) => api.patch(`/api/groups/${encodeURIComponent(name)}`, { description }),
  reload: loadData,
})

const showDeleteConfirm = ref(false)
const showMembersModal = ref(false)
const deleteTarget = ref('')
const deleteConflict = ref<GroupInUseConflict | null>(null)

const rowActions: RowAction<Group>[] = [
  {
    label: 'Access',
    run: group => openAccess(group.name),
  },
  {
    label: 'Members',
    run: group => openMembers(group.name),
  },
  {
    label: 'Edit',
    run: group => openEdit({ name: group.name, description: group.description }),
  },
  {
    label: 'Delete',
    danger: true,
    run: group => openDelete(group.name),
  },
]

const membersTarget = ref('')
const memberToAdd = ref('')

const showAccessModal = ref(false)
const accessTarget = ref('')
const accessPreview = ref<AccessPreviewResponse | null>(null)

const normalizedAccessPreview = computed<AccessPreviewResponse>(() =>
  accessPreview.value ?? { available: false, reason: 'Access preview could not be loaded.', guardedGroups: [] },
)
const groupAccess = computed(() => computeEffectiveAccess(normalizedAccessPreview.value, [accessTarget.value]))
const configNotes = computed(() => accessPreview.value?.available
  ? accessPreview.value.configNotes
  : [])

const currentMembers = computed(() =>
  users.value
    .filter(u => u.groups.includes(membersTarget.value))
    .sort((a, b) => a.username.localeCompare(b.username)),
)
/** A membership change is in flight or waiting on one of its confirmations. */
const membershipBusy = computed(() =>
  modalAction.loading.value || accessDiffConfirm.show.value || enabledCountConfirm.show.value,
)
const availableToAdd = computed(() =>
  users.value
    .filter(u => !u.groups.includes(membersTarget.value))
    .sort((a, b) => a.username.localeCompare(b.username)),
)

function memberCount(name: string): number {
  return users.value.filter(u => u.groups.includes(name)).length
}

async function loadData() {
  const accessPreviewPromise = api.get<AccessPreviewResponse>('/api/access-preview').catch(() => null)

  try {
    const [g, u] = await Promise.all([
      api.get<Group[]>('/api/groups'),
      api.get<User[]>('/api/users'),
    ])
    groups.value = g
    users.value = u
  }
  catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Failed to load data'
  }

  accessPreview.value = await accessPreviewPromise
}

onMounted(loadData)

function openDelete(name: string) {
  deleteTarget.value = name
  deleteConflict.value = null
  modalAction.error.value = ''
  showDeleteConfirm.value = true
}

function openAccess(name: string) {
  accessTarget.value = name
  showAccessModal.value = true
}

function openMembers(name: string) {
  membersTarget.value = name
  memberToAdd.value = ''
  modalAction.error.value = ''
  showMembersModal.value = true
}

function closeMembers() {
  showMembersModal.value = false
  accessDiffConfirm.cancel()
  enabledCountConfirm.close()
}

/**
 * The first delete goes out bare; while anything still names the group the backend refuses with the members,
 * invites and bundles it would strip, which turns the modal into its confirm step for a `confirm: true` retry.
 */
async function deleteGroup(): Promise<boolean> {
  const confirm = deleteConflict.value !== null
  try {
    await api.del(`/api/groups/${encodeURIComponent(deleteTarget.value)}`, confirm
      ? { confirm: true }
      : undefined)
    return true
  }
  catch (err) {
    // The group-in-use 409 shares the Enabled-Count Guard's `confirmRequired` marker, so the same check spots it.
    if (confirm || !isEnabledCountGuardError(err))
      throw err
    deleteConflict.value = err.body as unknown as GroupInUseConflict
    return false
  }
}

async function handleDelete() {
  await modalAction.run(async () => {
    if (!await deleteGroup())
      return
    showDeleteConfirm.value = false
    await loadData()
  }, 'Failed to delete group')
}

async function performMembershipUpdate(username: string, nextGroups: string[], confirm: boolean) {
  await api.patch(`/api/users/${encodeURIComponent(username)}`, confirm
    ? { groups: nextGroups, confirm: true }
    : { groups: nextGroups })
  await loadData()
}

async function requestMembershipChange(
  username: string,
  originalGroups: string[],
  nextGroups: string[],
  fallbackMessage: string,
  onSuccess?: () => void,
) {
  // requestSave may only open the diff modal, so onSuccess rides on the save itself, wherever it ends up running.
  async function save(confirm: boolean) {
    await performMembershipUpdate(username, nextGroups, confirm)
    onSuccess?.()
  }

  modalAction.loading.value = true
  modalAction.error.value = ''
  try {
    const emptiedGroups = computeEmptiedGuardedGroups(users.value, normalizedAccessPreview.value.guardedGroups, username, nextGroups)
    await accessDiffConfirm.requestSave(
      normalizedAccessPreview.value,
      originalGroups,
      nextGroups,
      save,
      emptiedGroups,
    )
  }
  catch (err) {
    if (isEnabledCountGuardError(err)) {
      accessDiffConfirm.cancel()
      enabledCountConfirm.open(err.message, () => save(true))
    }
    else {
      modalAction.error.value = err instanceof Error
        ? err.message
        : fallbackMessage
    }
  }
  finally {
    modalAction.loading.value = false
  }
}

function handleAccessDiffConfirm() {
  return confirmAccessDiffWithGuardFallback(accessDiffConfirm, enabledCountConfirm)
}

async function removeMember(username: string) {
  const user = users.value.find(u => u.username === username)
  if (!user)
    return

  const nextGroups = user.groups.filter(g => g !== membersTarget.value)
  await requestMembershipChange(username, user.groups, nextGroups, 'Failed to remove member')
}

async function addMember(username: string) {
  const user = users.value.find(u => u.username === username)
  if (!user)
    return

  const nextGroups = [...user.groups, membersTarget.value]
  await requestMembershipChange(username, user.groups, nextGroups, 'Failed to add member', () => {
    memberToAdd.value = ''
  })
}
</script>

<template>
  <div class="groups">
    <div class="groups-header">
      <h1 class="groups-title">
        Groups
      </h1>
      <button class="tg-btn tg-btn-primary" @click="openCreate">
        + New Group
      </button>
    </div>

    <p v-if="error" class="tg-error" role="alert">
      {{ error }}
    </p>

    <ConfigNotesPanel :notes="configNotes" />

    <div v-if="groups.length === 0 && !error" class="tg-empty">
      <span class="tg-empty-icon">&#x1F3F7;</span>
      <p class="tg-empty-text">
        No groups yet. Create a group to organise users and control access.
      </p>
      <button class="tg-btn tg-btn-primary" @click="openCreate">
        + Create First Group
      </button>
    </div>

    <div v-else-if="groups.length > 0" class="tg-table-wrap">
      <table class="tg-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Members</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="group in groups" :key="group.name">
            <td class="groups-cell--name">
              {{ group.name }}
            </td>
            <td class="groups-cell--desc">
              {{ group.description || '—' }}
            </td>
            <td>
              {{ memberCount(group.name) }}
            </td>
            <td>
              <RowActions :actions="rowActions" :row="group" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create / Edit Modal -->
    <EntityFormModal
      v-if="formMode"
      v-model:name="form.name"
      v-model:description="form.description"
      entity="Group"
      :editing="formMode === 'edit'"
      :loading="modalAction.loading.value"
      :error="modalAction.error.value"
      @submit="handleSubmit"
      @close="closeForm"
    />

    <!-- Members Modal -->
    <GroupMembersModal
      v-if="showMembersModal"
      v-model:member-to-add="memberToAdd"
      :group="membersTarget"
      :members="currentMembers"
      :candidates="availableToAdd"
      :busy="membershipBusy"
      :error="modalAction.error.value"
      @remove="removeMember"
      @add="addMember"
      @close="closeMembers"
    />

    <!-- Access Diff Confirm -->
    <AccessDiffConfirmModal
      v-if="accessDiffConfirm.show.value && accessDiffConfirm.diff.value"
      :diff="accessDiffConfirm.diff.value"
      :notes="accessDiffConfirm.notes.value"
      :emptied-groups="accessDiffConfirm.emptiedGroups.value"
      :loading="accessDiffConfirm.confirmLoading.value"
      :error="accessDiffConfirm.confirmError.value"
      @confirm="handleAccessDiffConfirm"
      @cancel="accessDiffConfirm.cancel"
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

    <!-- Access Preview Modal -->
    <ModalOverlay v-if="showAccessModal" :title="`Access — ${accessTarget}`" @close="showAccessModal = false">
      <EffectiveAccessPanel :result="groupAccess" :show-group="false" />
    </ModalOverlay>

    <!-- Delete Confirm -->
    <GroupDeleteModal
      v-if="showDeleteConfirm"
      :target="deleteTarget"
      :member-count="memberCount(deleteTarget)"
      :conflict="deleteConflict"
      :loading="modalAction.loading.value"
      :error="modalAction.error.value"
      @confirm="handleDelete"
      @close="showDeleteConfirm = false"
    />
  </div>
</template>

<style scoped>
.groups-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--tg-space-xl);
}

.groups-title {
  font-size: var(--tg-font-xl);
  font-weight: 600;
  margin: 0;
}

.groups-cell--name {
  font-weight: 600;
  color: var(--tg-accent);
}

.groups-cell--desc {
  color: var(--tg-text-secondary);
}
</style>
