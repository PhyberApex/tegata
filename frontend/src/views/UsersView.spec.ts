import type { ResetToken, User } from '../types'
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

describe('usersView reset-link email delivery after generate', () => {
  const created: ResetToken = {
    id: 'rt-1',
    token: 'tok-1',
    username: 'alice',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    used_at: null,
    created_at: new Date().toISOString(),
    email_sent_at: null,
    email_error: null,
  }

  /** `/api/reset-tokens` GETs answer from the queue in order, the last one repeating. */
  function respondWithResetTokens(lists: ResetToken[][]) {
    const queue = [...lists]
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/reset-tokens' && opts?.method === 'POST')
        return Promise.resolve(jsonResponse(created, 201))
      if (url === '/api/reset-tokens' && !opts?.method) {
        return Promise.resolve(jsonResponse(queue.length > 1
          ? queue.shift()
          : queue[0]))
      }
      return base(url, opts)
    })
  }

  function resetTokenListRequests() {
    return fetchMock.mock.calls.filter(([url, opts]) => url === '/api/reset-tokens' && !opts?.method).length
  }

  async function generateLink(options: { sendEmail: boolean }) {
    buttonByText('Reset Link').click()
    await flushPromises()
    if (options.sendEmail) {
      const checkbox = document.body.querySelector<HTMLInputElement>('.tg-form-checkbox input[type="checkbox"]')!
      checkbox.checked = true
      checkbox.dispatchEvent(new Event('change'))
    }
    buttonByText('Generate Link').click()
    await flushPromises()
  }

  async function advance(ms: number) {
    await vi.advanceTimersByTimeAsync(ms)
    await flushPromises()
  }

  function sendButton() {
    return buttonByText('Send') as HTMLButtonElement
  }

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows "Sending…" and then "Emailed" once the background send records success', async () => {
    respondWithResetTokens([
      [],
      [created],
      [
        {
          ...created,
          email_sent_at: new Date().toISOString(),
        },
      ],
    ])
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()

    await generateLink({ sendEmail: true })
    expect(document.body.textContent).toContain('Sending…')
    expect(sendButton().disabled).toBe(true)

    await advance(1000)
    expect(document.body.textContent).toContain('✓ Emailed')
    expect(document.body.textContent).not.toContain('Sending…')
    expect(buttonByText('Resend').disabled).toBe(false)
    wrapper.unmount()
  })

  it('shows "Sending…" and then "Email failed" once the background send records an error', async () => {
    respondWithResetTokens([
      [],
      [created],
      [
        { ...created, email_error: 'SMTP unreachable' },
      ],
    ])
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()

    await generateLink({ sendEmail: true })
    expect(document.body.textContent).toContain('Sending…')

    await advance(1000)
    expect(document.body.textContent).toContain('✗ Email failed')
    expect(document.body.textContent).not.toContain('Sending…')
    expect(sendButton().disabled).toBe(false)
    wrapper.unmount()
  })

  it('does not poll when the email was not requested', async () => {
    respondWithResetTokens([
      [],
      [created],
    ])
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()

    await generateLink({ sendEmail: false })
    const afterGenerate = resetTokenListRequests()
    expect(document.body.textContent).not.toContain('Sending…')

    await advance(60_000)
    expect(resetTokenListRequests()).toBe(afterGenerate)
    wrapper.unmount()
  })

  it('clears its timers on unmount', async () => {
    respondWithResetTokens([
      [],
      [created],
    ])
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()
    await generateLink({ sendEmail: true })
    const afterGenerate = resetTokenListRequests()

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
    await advance(60_000)
    expect(resetTokenListRequests()).toBe(afterGenerate)
  })
})

describe('usersView edit user', () => {
  interface Fixture {
    user: User
    patchStatus?: number
    patchBody?: unknown
  }

  function respondWithEditFixture({ user, patchStatus = 200, patchBody }: Fixture) {
    const patchBodies: unknown[] = []
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'PATCH') {
        expect(url).toBe('/api/users/svc')
        patchBodies.push(JSON.parse(opts.body as string))
        const status = patchBodies.length === 1
          ? patchStatus
          : 200
        return Promise.resolve(jsonResponse(status === 200
          ? { success: true }
          : patchBody, status))
      }
      if (url === '/api/users')
        return Promise.resolve(jsonResponse([user]))
      if (url === '/api/access-preview')
        return Promise.resolve(jsonResponse({ available: true, previews: [], guardedGroups: [] }))
      if (url === '/api/groups' || url === '/api/reset-tokens' || url === '/api/bundles')
        return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse({}))
    })
    return patchBodies
  }

  function svcUser(email: string | undefined): User {
    const user: User = {
      username: 'svc',
      displayname: 'Service',
      groups: ['users'],
      disabled: false,
    }
    if (email !== undefined)
      user.email = email
    return user
  }

  // A dialog's accessible name comes from the title its aria-labelledby points at.
  function findDialog(label: string): HTMLElement {
    const dialog = [
      ...document.body.querySelectorAll<HTMLElement>('[role="dialog"]'),
    ]
      .find((el) => {
        const labelId = el.getAttribute('aria-labelledby')
        return labelId !== null && document.getElementById(labelId)?.textContent?.trim() === label
      })
    if (!dialog)
      throw new Error(`No dialog found labelled "${label}"`)
    return dialog
  }

  function clickButtonIn(root: HTMLElement, text: string) {
    const button = [
      ...root.querySelectorAll('button'),
    ].find(el => el.textContent?.trim() === text)
    if (!button)
      throw new Error(`No button found with text "${text}"`)
    button.click()
  }

  function editForm() {
    const form = findDialog('Edit User').querySelector('form')
    if (!form)
      throw new Error('No edit form found')
    return form
  }

  async function openEditAndAddGroup(group: string) {
    buttonByText('Edit').click()
    await flushPromises()
    const input = findDialog('Edit User').querySelector<HTMLInputElement>('input[placeholder="Add group..."]')!
    input.value = group
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    buttonByText('Add').click()
    await flushPromises()
  }

  async function submitEditAndConfirmAccessChange() {
    editForm().dispatchEvent(new Event('submit'))
    await flushPromises()
    const diffDialog = findDialog('Confirm Access Change')
    clickButtonIn(diffDialog, 'Confirm')
    await flushPromises()
  }

  it.each([
    ['an address the backend email check rejects', 'admin@localhost'],
    ['an empty email', ''],
    ['no email', undefined],
  ])('sends only the groups when editing the groups of a user with %s', async (_label, email) => {
    const patchBodies = respondWithEditFixture({
      user: svcUser(email),
    })
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()

    await openEditAndAddGroup('media')
    expect(editForm().checkValidity()).toBe(true)
    await submitEditAndConfirmAccessChange()

    expect(patchBodies).toEqual([
      {
        groups: ['users', 'media'],
      },
    ])
    wrapper.unmount()
  })

  it('still requires an email for a user who has one on file', async () => {
    respondWithEditFixture({
      user: svcUser('svc@example.com'),
    })
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()

    buttonByText('Edit').click()
    await flushPromises()
    const email = document.body.querySelector<HTMLInputElement>('#edit-email')!
    email.value = ''
    email.dispatchEvent(new Event('input'))
    await flushPromises()

    expect(editForm().checkValidity()).toBe(false)
    wrapper.unmount()
  })

  it('sends the email when it was changed', async () => {
    const patchBodies = respondWithEditFixture({
      user: svcUser('admin@localhost'),
    })
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()

    buttonByText('Edit').click()
    await flushPromises()
    const email = document.body.querySelector<HTMLInputElement>('#edit-email')!
    email.value = 'svc@example.com'
    email.dispatchEvent(new Event('input'))
    await flushPromises()
    editForm().dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(patchBodies).toEqual([
      { email: 'svc@example.com' },
    ])
    wrapper.unmount()
  })

  it('closes the modal without a request when nothing was changed', async () => {
    const patchBodies = respondWithEditFixture({
      user: svcUser('admin@localhost'),
    })
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()

    buttonByText('Edit').click()
    await flushPromises()
    editForm().dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(patchBodies).toEqual([])
    expect(document.body.textContent).not.toContain('Edit User')
    wrapper.unmount()
  })

  it('retries a late confirmRequired with the same changed fields plus confirm', async () => {
    const patchBodies = respondWithEditFixture({
      user: svcUser('admin@localhost'),
      patchStatus: 409,
      patchBody: {
        message: 'This would leave no enabled members in admins',
        confirmRequired: true,
        enabledCount: 1,
        emptiedGroups: ['admins'],
      },
    })
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()

    await openEditAndAddGroup('media')
    await submitEditAndConfirmAccessChange()

    const retryDialog = findDialog('Confirm Action')
    clickButtonIn(retryDialog, 'Confirm')
    await flushPromises()

    expect(patchBodies).toEqual([
      {
        groups: ['users', 'media'],
      },
      {
        groups: ['users', 'media'],
        confirm: true,
      },
    ])
    wrapper.unmount()
  })

  it('retries an enabled-count guard on a displayname-only edit with confirm', async () => {
    const patchBodies = respondWithEditFixture({
      user: svcUser('admin@localhost'),
      patchStatus: 409,
      patchBody: { message: 'This would leave no enabled admins', confirmRequired: true },
    })
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()

    buttonByText('Edit').click()
    await flushPromises()
    const name = document.body.querySelector<HTMLInputElement>('#edit-displayname')!
    name.value = 'Service Account'
    name.dispatchEvent(new Event('input'))
    await flushPromises()
    editForm().dispatchEvent(new Event('submit'))
    await flushPromises()

    const retryDialog = findDialog('Confirm Action')
    clickButtonIn(retryDialog, 'Confirm')
    await flushPromises()

    expect(patchBodies).toEqual([
      { displayname: 'Service Account' },
      { displayname: 'Service Account', confirm: true },
    ])
    wrapper.unmount()
  })
})
