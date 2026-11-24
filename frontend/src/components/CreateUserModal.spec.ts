import type { CreateUserForm } from '../types/forms'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { usernameRule } from '../composables/useRegisterForm'
import CreateUserModal from './CreateUserModal.vue'

// ModalOverlay teleports to document.body, so everything is queried from there.
function usernameInput(): HTMLInputElement {
  const el = document.body.querySelector<HTMLInputElement>('#create-username')
  if (!el)
    throw new Error('No username input rendered')
  return el
}

function describedBy(): HTMLElement | null {
  const ids = usernameInput().getAttribute('aria-describedby')
  expect(ids).toBeTruthy()
  return document.getElementById(ids!)
}

function mountModal(username: string) {
  const form: CreateUserForm = {
    username,
    displayname: '',
    email: '',
    password: '',
    groups: [],
  }
  return mount(CreateUserModal, {
    props: {
      bundles: [],
      availableGroups: [],
      error: '',
      loading: false,
      form,
    },
    attachTo: document.body,
  })
}

describe('createUserModal username validation', () => {
  let wrapper: ReturnType<typeof mountModal> | undefined

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('marks an invalid username with aria-invalid and a distinct, described message', () => {
    wrapper = mountModal('Bad Name!')
    expect(usernameInput().getAttribute('aria-invalid')).toBe('true')
    const message = describedBy()
    expect(message).not.toBeNull()
    expect(message!.textContent!.trim()).not.toBe(usernameRule())
    expect(message!.textContent).toContain('Invalid username')
    expect(message!.getAttribute('role')).toBe('alert')
  })

  it.each(['', 'john.doe'])('has no aria-invalid for %j and describes the input with the rule', (username) => {
    wrapper = mountModal(username)
    expect(usernameInput().getAttribute('aria-invalid')).toBeNull()
    expect(describedBy()!.textContent!.trim()).toBe(usernameRule())
  })
})
