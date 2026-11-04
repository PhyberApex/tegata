import { describe, expect, it, vi } from 'vitest'
import { useEnabledCountConfirm } from './useEnabledCountConfirm'

describe('useEnabledCountConfirm', () => {
  it('opens with the given message and no error', () => {
    const confirm = useEnabledCountConfirm()

    confirm.open('This would leave only 1 enabled user', vi.fn())

    expect(confirm.show.value).toBe(true)
    expect(confirm.message.value).toBe('This would leave only 1 enabled user')
    expect(confirm.error.value).toBe('')
  })

  it('runs the pending retry and closes on confirm', async () => {
    const confirm = useEnabledCountConfirm()
    const retry = vi.fn().mockResolvedValue(undefined)
    confirm.open('msg', retry)

    await confirm.confirm()

    expect(retry).toHaveBeenCalledTimes(1)
    expect(confirm.show.value).toBe(false)
    expect(confirm.loading.value).toBe(false)
  })

  it('keeps the confirmation open and records the error when the retry fails', async () => {
    const confirm = useEnabledCountConfirm()
    confirm.open('msg', vi.fn().mockRejectedValue(new Error('still failing')))

    await confirm.confirm()

    expect(confirm.show.value).toBe(true)
    expect(confirm.error.value).toBe('still failing')
    expect(confirm.loading.value).toBe(false)
  })

  it('does nothing when confirm is called without a pending retry', async () => {
    const confirm = useEnabledCountConfirm()

    await expect(confirm.confirm()).resolves.toBeUndefined()
    expect(confirm.show.value).toBe(false)
  })

  it('close discards the pending retry', async () => {
    const confirm = useEnabledCountConfirm()
    const retry = vi.fn().mockResolvedValue(undefined)
    confirm.open('msg', retry)

    confirm.close()
    expect(confirm.show.value).toBe(false)

    await confirm.confirm()
    expect(retry).not.toHaveBeenCalled()
  })
})
