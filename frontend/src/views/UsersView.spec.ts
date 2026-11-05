import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UsersView from './UsersView.vue'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
    if (url === '/api/users' && !opts?.method) {
      return Promise.resolve(jsonResponse([
        {
          username: 'alice',
          displayname: 'Alice',
          email: 'a@example.com',
          groups: ['users'],
          disabled: false,
        },
      ]))
    }
    if (url === '/api/reset-tokens' && opts?.method === 'POST')
      return Promise.resolve(jsonResponse({ message: 'Token backend exploded' }, 500))
    if (url === '/api/groups' || url === '/api/reset-tokens')
      return Promise.resolve(jsonResponse([]))
    return Promise.resolve(jsonResponse({}))
  })
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function buttonByText(text: string) {
  const button = [
    ...document.body.querySelectorAll('button'),
  ]
    .find(el => el.textContent?.trim() === text)
  if (!button)
    throw new Error(`No button found with text "${text}"`)
  return button
}

describe('usersView modal error', () => {
  it('does not show a stale reset-link error in the Delete User dialog', async () => {
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()

    buttonByText('Reset Link').click()
    await flushPromises()
    buttonByText('Generate Link').click()
    await flushPromises()
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull()

    buttonByText('Cancel').click()
    await flushPromises()
    buttonByText('Delete').click()
    await flushPromises()

    expect(document.body.textContent).toContain('Are you sure you want to delete')
    expect(document.body.querySelector('[role="alert"]')).toBeNull()
    wrapper.unmount()
  })
})
