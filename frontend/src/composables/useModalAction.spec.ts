import { describe, expect, it, vi } from 'vitest'
import { useModalAction } from './useModalAction'

describe('useModalAction', () => {
  it('tracks loading around a successful action and clears any prior error', async () => {
    const action = useModalAction()
    const fn = vi.fn().mockResolvedValue(undefined)

    const promise = action.run(fn, 'fallback')
    expect(action.loading.value).toBe(true)

    await promise

    expect(fn).toHaveBeenCalledTimes(1)
    expect(action.loading.value).toBe(false)
    expect(action.error.value).toBe('')
  })

  it('records the error message and clears loading when the action rejects with an Error', async () => {
    const action = useModalAction()
    const fn = vi.fn().mockRejectedValue(new Error('could not save'))

    await action.run(fn, 'fallback')

    expect(action.loading.value).toBe(false)
    expect(action.error.value).toBe('could not save')
  })

  it('falls back to the provided message when the rejection is not an Error', async () => {
    const action = useModalAction()
    const fn = vi.fn().mockRejectedValue('boom')

    await action.run(fn, 'fallback message')

    expect(action.error.value).toBe('fallback message')
  })

  it('clears a previous error at the start of a new run', async () => {
    const action = useModalAction()
    await action.run(vi.fn().mockRejectedValue(new Error('first failure')), 'fallback')
    expect(action.error.value).toBe('first failure')

    await action.run(vi.fn().mockResolvedValue(undefined), 'fallback')

    expect(action.error.value).toBe('')
  })
})
