import type { AccessPreviewResponse } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { confirmAccessDiffWithGuardFallback, useAccessDiffConfirm } from './useAccessDiffConfirm'
import { ApiError } from './useApi'
import { useEnabledCountConfirm } from './useEnabledCountConfirm'

const RESPONSE: AccessPreviewResponse = {
  available: true,
  previews: [
    {
      group: 'media',
      domains: [
        { domain: 'media.example.com', policy: 'two_factor', source: 'group-placeholder' },
      ],
      oidcClients: [],
      notes: ['unparsed rule referencing media'],
    },
  ],
  configNotes: [],
  guardedGroups: [],
}

describe('useAccessDiffConfirm', () => {
  it('saves directly without opening the confirmation when groups are unchanged', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockResolvedValue(undefined)

    await confirm.requestSave(RESPONSE, ['media'], ['media'], performSave)

    expect(performSave).toHaveBeenCalledTimes(1)
    expect(confirm.show.value).toBe(false)
  })

  it('propagates a direct-save error to the caller without opening the confirmation', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(confirm.requestSave(RESPONSE, ['media'], ['media'], performSave)).rejects.toThrow('boom')
    expect(confirm.show.value).toBe(false)
  })

  it('opens the confirmation with the computed diff when groups change', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockResolvedValue(undefined)

    await confirm.requestSave(RESPONSE, [], ['media'], performSave)

    expect(performSave).not.toHaveBeenCalled()
    expect(confirm.show.value).toBe(true)
    expect(confirm.diff.value).toEqual({
      available: true,
      addedDomains: [
        {
          domain: 'media.example.com',
          policy: 'two_factor',
          source: 'group-placeholder',
          group: 'media',
        },
      ],
      removedDomains: [],
      addedOidcClients: [],
      removedOidcClients: [],
    })
  })

  it('carries the proposed side\'s notes through for display alongside the diff', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockResolvedValue(undefined)

    await confirm.requestSave(RESPONSE, [], ['media'], performSave)

    expect(confirm.notes.value).toEqual([
      { group: 'media', note: 'unparsed rule referencing media' },
    ])
  })

  it('reports no notes when the proposed side is unavailable', async () => {
    const confirm = useAccessDiffConfirm()
    const unavailable: AccessPreviewResponse = { available: false, reason: 'boom', guardedGroups: [] }
    const performSave = vi.fn().mockResolvedValue(undefined)

    await confirm.requestSave(unavailable, [], ['media'], performSave)

    expect(confirm.notes.value).toEqual([])
  })

  it('runs the pending save and closes on confirm', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockResolvedValue(undefined)
    await confirm.requestSave(RESPONSE, [], ['media'], performSave)

    await confirm.confirm()

    expect(performSave).toHaveBeenCalledTimes(1)
    expect(confirm.show.value).toBe(false)
    expect(confirm.confirmLoading.value).toBe(false)
  })

  it('keeps the confirmation open and records the error when the pending save fails', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockRejectedValue(new Error('save failed'))
    await confirm.requestSave(RESPONSE, [], ['media'], performSave)

    await confirm.confirm()

    expect(confirm.show.value).toBe(true)
    expect(confirm.confirmError.value).toBe('save failed')
    expect(confirm.confirmLoading.value).toBe(false)
  })

  it('does nothing when confirm is called without a pending save', async () => {
    const confirm = useAccessDiffConfirm()

    await expect(confirm.confirm()).resolves.toBeUndefined()
    expect(confirm.show.value).toBe(false)
  })

  it('cancel closes the confirmation and discards the pending save', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockResolvedValue(undefined)
    await confirm.requestSave(RESPONSE, [], ['media'], performSave)

    confirm.cancel()
    expect(confirm.show.value).toBe(false)

    await confirm.confirm()
    expect(performSave).not.toHaveBeenCalled()
  })

  it('surfaces an unavailable diff instead of a clean confirmation', async () => {
    const confirm = useAccessDiffConfirm()
    const unavailable: AccessPreviewResponse = { available: false, reason: 'Could not read Authelia configuration', guardedGroups: [] }
    const performSave = vi.fn().mockResolvedValue(undefined)

    await confirm.requestSave(unavailable, [], ['media'], performSave)

    expect(confirm.show.value).toBe(true)
    expect(confirm.diff.value).toEqual({ available: false, reason: 'Could not read Authelia configuration' })
  })

  it('calls performSave without confirm when groups are unchanged', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockResolvedValue(undefined)

    await confirm.requestSave(RESPONSE, ['media'], ['media'], performSave)

    expect(performSave).toHaveBeenCalledWith(false)
  })

  it('defaults emptiedGroups to empty when requestSave is not given any', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockResolvedValue(undefined)

    await confirm.requestSave(RESPONSE, [], ['media'], performSave)

    expect(confirm.emptiedGroups.value).toEqual([])
  })

  it('exposes the emptiedGroups passed to requestSave for the modal to warn with', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockResolvedValue(undefined)

    await confirm.requestSave(RESPONSE, [], ['media'], performSave, ['admins'])

    expect(confirm.emptiedGroups.value).toEqual(['admins'])
  })

  it('sends confirm: true on confirm when the modal already warned about an emptied group', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockResolvedValue(undefined)
    await confirm.requestSave(RESPONSE, [], ['media'], performSave, ['admins'])

    await confirm.confirm()

    expect(performSave).toHaveBeenCalledWith(true)
  })

  it('sends confirm: false on confirm when no group was flagged as emptied', async () => {
    const confirm = useAccessDiffConfirm()
    const performSave = vi.fn().mockResolvedValue(undefined)
    await confirm.requestSave(RESPONSE, [], ['media'], performSave)

    await confirm.confirm()

    expect(performSave).toHaveBeenCalledWith(false)
  })

  it('rethrows a late confirmRequired 409 instead of swallowing it as a generic error', async () => {
    const confirm = useAccessDiffConfirm()
    const guardError = new ApiError('This would leave only 1 enabled user', 409, { confirmRequired: true })
    const performSave = vi.fn().mockRejectedValue(guardError)
    await confirm.requestSave(RESPONSE, [], ['media'], performSave)

    await expect(confirm.confirm()).rejects.toBe(guardError)

    expect(confirm.confirmError.value).toBe('')
    expect(confirm.confirmLoading.value).toBe(false)
  })

  it('retryWithConfirm re-runs the pending save with confirm: true after a rethrown 409', async () => {
    const confirm = useAccessDiffConfirm()
    const guardError = new ApiError('This would leave only 1 enabled user', 409, { confirmRequired: true })
    const performSave = vi.fn()
      .mockRejectedValueOnce(guardError)
      .mockResolvedValueOnce(undefined)
    await confirm.requestSave(RESPONSE, [], ['media'], performSave)
    await expect(confirm.confirm()).rejects.toBe(guardError)

    await confirm.retryWithConfirm()

    expect(performSave).toHaveBeenLastCalledWith(true)
    expect(confirm.show.value).toBe(false)
  })

  it('retryWithConfirm does nothing without a pending save', async () => {
    const confirm = useAccessDiffConfirm()

    await expect(confirm.retryWithConfirm()).resolves.toBeUndefined()
  })
})

describe('confirmAccessDiffWithGuardFallback', () => {
  it('does nothing extra when the diff confirm succeeds', async () => {
    const confirm = useAccessDiffConfirm()
    const enabledCountConfirm = useEnabledCountConfirm()
    const performSave = vi.fn().mockResolvedValue(undefined)
    await confirm.requestSave(RESPONSE, [], ['media'], performSave)

    await confirmAccessDiffWithGuardFallback(confirm, enabledCountConfirm)

    expect(enabledCountConfirm.show.value).toBe(false)
  })

  it('leaves a non-guard error as the diff modal\'s own error, not the fallback modal', async () => {
    const confirm = useAccessDiffConfirm()
    const enabledCountConfirm = useEnabledCountConfirm()
    const performSave = vi.fn().mockRejectedValue(new Error('boom'))
    await confirm.requestSave(RESPONSE, [], ['media'], performSave)

    await confirmAccessDiffWithGuardFallback(confirm, enabledCountConfirm)

    expect(confirm.confirmError.value).toBe('boom')
    expect(enabledCountConfirm.show.value).toBe(false)
  })

  it('opens the confirm-and-retry modal on a late confirmRequired, closing the diff modal', async () => {
    const confirm = useAccessDiffConfirm()
    const enabledCountConfirm = useEnabledCountConfirm()
    const guardError = new ApiError('This would leave no enabled members in admins', 409, { confirmRequired: true })
    const performSave = vi.fn()
      .mockRejectedValueOnce(guardError)
      .mockResolvedValueOnce(undefined)
    await confirm.requestSave(RESPONSE, [], ['media'], performSave)

    await confirmAccessDiffWithGuardFallback(confirm, enabledCountConfirm)

    expect(confirm.show.value).toBe(false)
    expect(enabledCountConfirm.show.value).toBe(true)
    expect(enabledCountConfirm.message.value).toBe('This would leave no enabled members in admins')

    await enabledCountConfirm.confirm()

    expect(performSave).toHaveBeenLastCalledWith(true)
    expect(enabledCountConfirm.show.value).toBe(false)
  })

  it('runs the onFallback callback when falling back to the retry modal', async () => {
    const confirm = useAccessDiffConfirm()
    const enabledCountConfirm = useEnabledCountConfirm()
    const guardError = new ApiError('boom', 409, { confirmRequired: true })
    const performSave = vi.fn().mockRejectedValue(guardError)
    await confirm.requestSave(RESPONSE, [], ['media'], performSave)
    const onFallback = vi.fn()

    await confirmAccessDiffWithGuardFallback(confirm, enabledCountConfirm, onFallback)

    expect(onFallback).toHaveBeenCalledTimes(1)
  })
})
