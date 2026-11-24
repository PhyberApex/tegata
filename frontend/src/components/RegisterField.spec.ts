import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RegisterField from './RegisterField.vue'

const HINT = 'Username must use lowercase letters'

function mountField(error?: string) {
  return mount(RegisterField, {
    props: {
      id: 'username',
      label: 'Username',
      type: 'text',
      placeholder: 'Choose a username',
      autocomplete: 'username',
      hint: HINT,
      error,
      modelValue: error ? 'Bad Name!' : '',
    },
  })
}

function describedBy(wrapper: ReturnType<typeof mountField>): HTMLElement | null {
  const ids = wrapper.get('input').attributes('aria-describedby')
  expect(ids).toBeTruthy()
  return (wrapper.element as HTMLElement).querySelector<HTMLElement>(`[id="${ids}"]`)
}

describe('registerField validation state', () => {
  it('marks an invalid value with aria-invalid and describes it with a distinct message', () => {
    const wrapper = mountField(`Invalid username: ${HINT}`)
    const input = wrapper.get('input')
    expect(input.attributes('aria-invalid')).toBe('true')
    const message = describedBy(wrapper)
    expect(message).not.toBeNull()
    expect(message!.textContent!.trim()).not.toBe(HINT)
    expect(message!.textContent).toContain('Invalid username')
    expect(message!.getAttribute('role')).toBe('alert')
  })

  it('has no aria-invalid while valid, and still describes the input with the hint', () => {
    const wrapper = mountField()
    expect(wrapper.get('input').attributes('aria-invalid')).toBeUndefined()
    const message = describedBy(wrapper)
    expect(message!.textContent!.trim()).toBe(HINT)
    expect(message!.getAttribute('role')).toBeNull()
  })

  it('inserts a fresh alert node when the value turns invalid, so the live region fires', async () => {
    const wrapper = mountField()
    const before = describedBy(wrapper)
    await wrapper.setProps({ error: `Invalid username: ${HINT}` })
    const after = describedBy(wrapper)
    expect(after).not.toBe(before)
    expect(after!.getAttribute('role')).toBe('alert')
  })

  it('omits aria-describedby when there is neither hint nor error', () => {
    const wrapper = mount(RegisterField, {
      props: {
        id: 'email',
        label: 'Email',
        type: 'email',
        placeholder: '',
        autocomplete: 'email',
        modelValue: '',
      },
    })
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.get('input').attributes('aria-invalid')).toBeUndefined()
  })
})
