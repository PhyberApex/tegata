<script setup lang="ts">
import type { Bundle, Group, Invite } from '../types'
import type { CreateInviteForm } from '../types/forms'
import { computed, onMounted, ref } from 'vue'
import CreateInviteModal from '../components/CreateInviteModal.vue'
import DeleteConfirmModal from '../components/DeleteConfirmModal.vue'
import InviteSection from '../components/InviteSection.vue'
import QrCodeModal from '../components/QrCodeModal.vue'
import { useApi } from '../composables/useApi'
import { useModalAction } from '../composables/useModalAction'
import { inviteUrl } from '../utils/invites'
import { timeUntilExpiry } from '../utils/time'

const api = useApi()
const invites = ref<Invite[]>([])
const groups = ref<string[]>([])
const bundles = ref<Bundle[]>([])
const error = ref('')
const copiedId = ref<string | null>(null)
const sendingId = ref<string | null>(null)

const showCreateModal = ref(false)
const showRevokeConfirm = ref(false)
const revokeTarget = ref<Invite | null>(null)
const qrTarget = ref<Invite | null>(null)
const modalAction = useModalAction()
const createForm = ref<CreateInviteForm>({
  groups: [],
  expiresInDays: 7,
  email: '',
  displayname: '',
  bundleName: null,
  sendEmail: false,
})

const activeInvites = computed(() =>
  invites.value.filter(i => !i.used_by && new Date(i.expires_at) > new Date()),
)

const usedInvites = computed(() =>
  invites.value.filter(i => i.used_by),
)

const expiredInvites = computed(() =>
  invites.value.filter(i => !i.used_by && new Date(i.expires_at) <= new Date()),
)

async function loadData() {
  try {
    const [inv, grp, bnd] = await Promise.all([
      api.get<Invite[]>('/api/invites'),
      api.get<Group[]>('/api/groups'),
      api.get<Bundle[]>('/api/bundles'),
    ])
    invites.value = inv
    groups.value = grp.map(g => g.name)
    bundles.value = bnd
  }
  catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Failed to load data'
  }
}

onMounted(loadData)

function openCreate() {
  createForm.value = {
    groups: ['users'],
    expiresInDays: 7,
    email: '',
    displayname: '',
    bundleName: null,
    sendEmail: false,
  }
  modalAction.error.value = ''
  showCreateModal.value = true
}

function buildInvitePayload(form: typeof createForm.value) {
  const { groups: inviteGroups, expiresInDays, email, displayname, bundleName, sendEmail } = form
  const trimmedEmail = email.trim()
  const optionalFields: [string, unknown][] = [
    ['email', trimmedEmail],
    [
      'displayname',
      displayname.trim(),
    ],
    ['bundleName', bundleName],
    ['sendEmail', trimmedEmail && sendEmail],
  ]
  return {
    groups: inviteGroups,
    expiresInDays,
    ...Object.fromEntries(optionalFields.filter(([, value]) => value)),
  }
}

async function handleCreate() {
  await modalAction.run(async () => {
    await api.post('/api/invites', buildInvitePayload(createForm.value))
    showCreateModal.value = false
    await loadData()
  }, 'Failed to create invite')
}

function openRevoke(invite: Invite) {
  revokeTarget.value = invite
  modalAction.error.value = ''
  showRevokeConfirm.value = true
}

async function handleRevoke() {
  if (!revokeTarget.value)
    return
  await modalAction.run(async () => {
    await api.del(`/api/invites/${revokeTarget.value!.id}`)
    showRevokeConfirm.value = false
    revokeTarget.value = null
    await loadData()
  }, 'Failed to revoke invite')
}

async function handleSend(invite: Invite) {
  sendingId.value = invite.id
  try {
    await api.post(`/api/invites/${invite.id}/send`)
    await loadData()
  }
  catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Failed to send invite email'
  }
  finally {
    sendingId.value = null
  }
}

async function handleRemove(id: string) {
  try {
    await api.del(`/api/invites/${id}`)
    await loadData()
  }
  catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Failed to remove invite'
  }
}

async function copyLink(invite: Invite) {
  try {
    await navigator.clipboard.writeText(inviteUrl(invite.token))
    copiedId.value = invite.id
    setTimeout(() => {
      if (copiedId.value === invite.id)
        copiedId.value = null
    }, 2000)
  }
  catch {
    error.value = 'Could not copy — try using HTTPS or copy the link manually'
  }
}
</script>

<template>
  <div class="invites">
    <div class="invites-header">
      <h1 class="invites-title">
        Invites
      </h1>
      <button class="tg-btn tg-btn-primary" @click="openCreate">
        + New Invite
      </button>
    </div>

    <p v-if="error" class="tg-error" role="alert">
      {{ error }}
    </p>

    <InviteSection
      title="Active"
      :invites="activeInvites"
      variant="active"
      :copied-id="copiedId"
      :sending-id="sendingId"
      @qr="invite => qrTarget = invite"
      @copy="copyLink"
      @send="handleSend"
      @revoke="openRevoke"
    />

    <InviteSection
      title="Used"
      :invites="usedInvites"
      variant="used"
      :copied-id="copiedId"
      :sending-id="sendingId"
    />

    <InviteSection
      title="Expired"
      :invites="expiredInvites"
      variant="expired"
      :copied-id="copiedId"
      :sending-id="sendingId"
      @remove="handleRemove"
    />

    <div v-if="invites.length === 0 && !error" class="tg-empty">
      <span class="tg-empty-icon">&#x2709;</span>
      <p class="tg-empty-text">
        No invites yet. Create one to share a registration link with someone you'd like to add.
      </p>
      <button class="tg-btn tg-btn-primary" @click="openCreate">
        + Create First Invite
      </button>
    </div>

    <!-- QR Code -->
    <QrCodeModal
      v-if="qrTarget"
      :invite="qrTarget"
      @close="qrTarget = null"
    />

    <!-- Revoke Confirm -->
    <DeleteConfirmModal
      v-if="showRevokeConfirm"
      title="Revoke Invite"
      target=""
      confirm-label="Revoke"
      confirming-label="Revoking..."
      :loading="modalAction.loading.value"
      :error="modalAction.error.value"
      @confirm="handleRevoke"
      @close="showRevokeConfirm = false"
    >
      <p class="tg-form-hint">
        Are you sure you want to revoke this invite? Anyone with the link will no longer be able to register.
      </p>
      <div v-if="revokeTarget" class="revoke-detail">
        <div class="invite-groups">
          <span v-for="g in revokeTarget.groups" :key="g" class="tg-badge">{{ g }}</span>
        </div>
        <span class="invite-meta-text">Expires in {{ timeUntilExpiry(revokeTarget.expires_at) }}</span>
      </div>
    </DeleteConfirmModal>

    <!-- Create Modal -->
    <CreateInviteModal
      v-if="showCreateModal"
      v-model:form="createForm"
      :bundles="bundles"
      :available-groups="groups"
      :error="modalAction.error.value"
      :loading="modalAction.loading.value"
      @submit="handleCreate"
      @close="showCreateModal = false"
    />
  </div>
</template>

<style scoped>
.invites-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--tg-space-xl);
}

.invites-title {
  font-size: var(--tg-font-xl);
  font-weight: 600;
  margin: 0;
}

.invite-groups {
  display: flex;
  gap: var(--tg-space-xs);
  flex-wrap: wrap;
}

.revoke-detail {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-sm);
}

.invite-meta-text {
  font-size: var(--tg-font-xs);
  color: var(--tg-text-muted);
}
</style>
