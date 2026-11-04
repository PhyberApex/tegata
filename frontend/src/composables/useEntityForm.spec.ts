import { describe, expect, it, vi } from 'vitest'
import { useEntityForm } from './useEntityForm'
import { useModalAction } from './useModalAction'

function setup(overrides: { create?: () => Promise<unknown>, update?: () => Promise<unknown> } = {}) {
  const modalAction = useModalAction()
  const create = vi.fn(overrides.create ?? (() => Promise.resolve()))
  const update = vi.fn(overrides.update ?? (() => Promise.resolve()))
  const reload = vi.fn(() => Promise.resolve())
  const entityForm = useEntityForm({
    noun: 'bundle',
    blank: () => ({ name: '', description: '' }),
    modalAction,
    create,
    update,
    reload,
  })
  return {
    modalAction,
    create,
    update,
    reload,
    ...entityForm,
  }
}

describe('useEntityForm', () => {
  it('opens create on a blank form and clears a stale error', () => {
    const { mode, form, modalAction, openCreate } = setup()
    form.value = { name: 'left', description: 'over' }
    modalAction.error.value = 'stale'

    openCreate()

    expect(mode.value).toBe('create')
    expect(form.value).toEqual({ name: '', description: '' })
    expect(modalAction.error.value).toBe('')
  })

  it('opens edit on the given values', () => {
    const { mode, form, openEdit } = setup()

    openEdit({ name: 'media', description: 'Jellyfin' })

    expect(mode.value).toBe('edit')
    expect(form.value).toEqual({ name: 'media', description: 'Jellyfin' })
  })

  it('submits a create, closes and reloads', async () => {
    const { mode, create, update, reload, openCreate, form, submit } = setup()
    openCreate()
    form.value.name = 'media'

    await submit()

    expect(create).toHaveBeenCalledWith({ name: 'media', description: '' })
    expect(update).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(mode.value).toBeNull()
  })

  it('submits an edit through update', async () => {
    const { create, update, openEdit, submit } = setup()
    openEdit({ name: 'media', description: 'Jellyfin' })

    await submit()

    expect(update).toHaveBeenCalledWith({ name: 'media', description: 'Jellyfin' })
    expect(create).not.toHaveBeenCalled()
  })

  it('stays open with the server\'s message when a save fails', async () => {
    const { mode, modalAction, reload, openEdit, submit } = setup({
      update: () => Promise.reject(new Error('Group is in use')),
    })
    openEdit({ name: 'media', description: '' })

    await submit()

    expect(mode.value).toBe('edit')
    expect(reload).not.toHaveBeenCalled()
    expect(modalAction.error.value).toBe('Group is in use')
  })

  it('names the operation in the fallback message for a non-Error rejection', async () => {
    const { modalAction, openCreate, submit } = setup({
      create: vi.fn().mockRejectedValue('boom'),
    })
    openCreate()

    await submit()

    expect(modalAction.error.value).toBe('Failed to create bundle')
  })

  it('closes without saving', () => {
    const { mode, openCreate, close } = setup()
    openCreate()

    close()

    expect(mode.value).toBeNull()
  })
})
