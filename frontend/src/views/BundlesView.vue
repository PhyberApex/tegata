<script setup lang="ts">
import type { RowAction } from '../components/RowActions.vue'
import type { Bundle, Group } from '../types'
import { onMounted, ref } from 'vue'
import DeleteConfirmModal from '../components/DeleteConfirmModal.vue'
import EntityFormModal from '../components/EntityFormModal.vue'
import GroupInput from '../components/GroupInput.vue'
import RowActions from '../components/RowActions.vue'
import { useApi } from '../composables/useApi'
import { useEntityForm } from '../composables/useEntityForm'
import { useModalAction } from '../composables/useModalAction'

const api = useApi()
const bundles = ref<Bundle[]>([])
const groups = ref<string[]>([])
const error = ref('')

const modalAction = useModalAction()

const { mode: formMode, form, openCreate, openEdit, submit: handleSubmit, close: closeForm } = useEntityForm({
  noun: 'bundle',
  blank: () => ({ name: '', description: '', groups: [] as string[] }),
  modalAction,
  create: values => api.post('/api/bundles', values),
  update: ({ name, description, groups }) => api.patch(`/api/bundles/${encodeURIComponent(name)}`, { description, groups }),
  reload: loadData,
})

const showDeleteConfirm = ref(false)
const deleteTarget = ref('')

const rowActions: RowAction<Bundle>[] = [
  {
    label: 'Edit',
    run: bundle => openEdit({
      name: bundle.name,
      description: bundle.description,
      groups: [...bundle.groups],
    }),
  },
  {
    label: 'Delete',
    danger: true,
    run: bundle => openDelete(bundle.name),
  },
]

async function loadData() {
  try {
    const [b, g] = await Promise.all([
      api.get<Bundle[]>('/api/bundles'),
      api.get<Group[]>('/api/groups'),
    ])
    bundles.value = b
    groups.value = g.map(gr => gr.name)
  }
  catch (err) {
    error.value = err instanceof Error
      ? err.message
      : 'Failed to load data'
  }
}

onMounted(loadData)

function openDelete(name: string) {
  deleteTarget.value = name
  showDeleteConfirm.value = true
}

async function handleDelete() {
  await modalAction.run(async () => {
    await api.del(`/api/bundles/${encodeURIComponent(deleteTarget.value)}`)
    showDeleteConfirm.value = false
    await loadData()
  }, 'Failed to delete bundle')
}
</script>

<template>
  <div class="bundles">
    <div class="bundles-header">
      <h1 class="bundles-title">
        Bundles
      </h1>
      <button class="tg-btn tg-btn-primary" @click="openCreate">
        + New Bundle
      </button>
    </div>

    <p v-if="error" class="tg-error" role="alert">
      {{ error }}
    </p>

    <div v-if="bundles.length === 0 && !error" class="tg-empty">
      <span class="tg-empty-icon">&#x1F4E6;</span>
      <p class="tg-empty-text">
        No bundles yet. Create one to give an invite or user their groups in one click.
      </p>
      <button class="tg-btn tg-btn-primary" @click="openCreate">
        + Create First Bundle
      </button>
    </div>

    <div v-else class="tg-table-wrap">
      <table class="tg-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Groups</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="bundle in bundles" :key="bundle.name">
            <td class="bundles-cell--name">
              {{ bundle.name }}
            </td>
            <td class="bundles-cell--desc">
              {{ bundle.description || '—' }}
            </td>
            <td>
              <div class="bundles-groups">
                <span v-for="g in bundle.groups" :key="g" class="tg-badge">{{ g }}</span>
              </div>
            </td>
            <td>
              <RowActions :actions="rowActions" :row="bundle" />
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
      entity="Bundle"
      :editing="formMode === 'edit'"
      :loading="modalAction.loading.value"
      :error="modalAction.error.value"
      @submit="handleSubmit"
      @close="closeForm"
    >
      <div class="tg-form-field">
        <label class="tg-form-label">Groups</label>
        <GroupInput v-model="form.groups" :available-groups="groups" />
      </div>
    </EntityFormModal>

    <!-- Delete Confirm -->
    <DeleteConfirmModal
      v-if="showDeleteConfirm"
      title="Delete Bundle"
      :target="deleteTarget"
      :loading="modalAction.loading.value"
      :error="modalAction.error.value"
      @confirm="handleDelete"
      @close="showDeleteConfirm = false"
    >
      <p class="tg-form-hint">
        Are you sure you want to delete <strong>{{ deleteTarget }}</strong>? This cannot be undone. Invites and users already created from it keep their groups unchanged.
      </p>
    </DeleteConfirmModal>
  </div>
</template>

<style scoped>
.bundles-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--tg-space-xl);
}

.bundles-title {
  font-size: var(--tg-font-xl);
  font-weight: 600;
  margin: 0;
}

.bundles-cell--name {
  font-weight: 600;
  color: var(--tg-accent);
}

.bundles-cell--desc {
  color: var(--tg-text-secondary);
}

.bundles-groups {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tg-space-xs);
}
</style>
