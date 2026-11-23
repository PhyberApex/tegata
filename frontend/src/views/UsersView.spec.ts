import type { ResetToken } from '../types'
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
