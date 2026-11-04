import type { Ref } from 'vue'
import type { useModalAction } from './useModalAction'
import { ref } from 'vue'

interface EntityFormOptions<F> {
  /** Lower-case, for the fallback error: "Failed to create bundle". */
  noun: string
  blank: () => F
  modalAction: ReturnType<typeof useModalAction>
  create: (form: F) => Promise<unknown>
  update: (form: F) => Promise<unknown>
  reload: () => Promise<void>
}

/** The create/edit modal state a CRUD view drives `EntityFormModal` with. */
export function useEntityForm<F>(options: EntityFormOptions<F>) {
  const { modalAction } = options
  const mode = ref<'create' | 'edit' | null>(null)
  const form = ref(options.blank()) as Ref<F>

  function open(next: 'create' | 'edit', values: F) {
    form.value = values
    modalAction.error.value = ''
    mode.value = next
  }

  async function submit() {
    const editing = mode.value === 'edit'
    await modalAction.run(async () => {
      await (editing ? options.update : options.create)(form.value)
      mode.value = null
      await options.reload()
    }, `Failed to ${editing ? 'update' : 'create'} ${options.noun}`)
  }

  return {
    mode,
    form,
    openCreate: () => open('create', options.blank()),
    openEdit: (values: F) => open('edit', values),
    submit,
    close: () => { mode.value = null },
  }
}
