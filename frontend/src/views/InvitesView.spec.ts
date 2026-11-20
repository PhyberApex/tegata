import type { VueWrapper } from '@vue/test-utils'
import type { Invite } from '../types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InvitesView from './InvitesView.vue'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function invite(overrides: Partial<Invite>): Invite {
  return {
    id: 'inv-1',
    token: 'tok-1',
    groups: ['users'],
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    email: null,
    displayname: null,
    used_by: null,
    used_at: null,
    created_at: new Date().toISOString(),
    bundle_name: null,
    email_sent_at: null,
    email_error: null,
    ...overrides,
  }
}

const activeWithEmail = invite({ id: 'active', email: 'friend@example.com' })
const expired = invite({
  id: 'expired',
  expires_at: new Date(Date.now() - 86_400_000).toISOString(),
})

// Every test talks to Tegata the way the page does: fetch, stubbed at the boundary.
const fetchMock = vi.fn()

/** Routes requests to handlers; `/api/invites` GETs answer from the queue in order, the last one repeating. */
function respondWith(options: {
  invites: Array<Invite[] | Response>
  send?: Response[]
  remove?: Response[]
}) {
  const invites = [...options.invites]
  const send = options.send ?? []
  const remove = options.remove ?? []
  const shiftKeepingLast = <T>(queue: T[]) => (queue.length > 1
    ? queue.shift()!
    : queue[0])
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/invites' && method === 'GET') {
      const answer = shiftKeepingLast(invites)
      return Promise.resolve(answer instanceof Response
        ? answer
        : jsonResponse(answer))
    }
    if (url.endsWith('/send'))
      return Promise.resolve(shiftKeepingLast(send))
    if (url.startsWith('/api/invites/') && method === 'DELETE')
      return Promise.resolve(shiftKeepingLast(remove))
    if (url === '/api/groups' || url === '/api/bundles')
      return Promise.resolve(jsonResponse([]))
    return Promise.resolve(jsonResponse({}))
  })
}

type InvitesWrapper = VueWrapper<InstanceType<typeof InvitesView>>

async function mountView(): Promise<InvitesWrapper> {
  const wrapper = mount(InvitesView, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

async function clickButton(wrapper: InvitesWrapper, label: string) {
  const button = wrapper.findAll('button').find(b => b.text() === label)
  expect(button, `button "${label}"`).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}

function pageBanner(wrapper: InvitesWrapper) {
  return wrapper.find('.tg-error[role="alert"]')
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('invitesView page-level error banner', () => {
  it('clears the banner from a failed send once a later send succeeds', async () => {
    respondWith({
      invites: [
        [activeWithEmail],
      ],
      send: [
        jsonResponse({ message: 'SMTP unreachable' }, 502),
        jsonResponse({}),
      ],
    })
    const wrapper = await mountView()

    await clickButton(wrapper, 'Send')
    expect(pageBanner(wrapper).text()).toBe('SMTP unreachable')

    await clickButton(wrapper, 'Send')
    expect(pageBanner(wrapper).exists()).toBe(false)
  })

  it('clears the banner from a failed send once removing an expired invite succeeds', async () => {
    respondWith({
      invites: [
        [activeWithEmail, expired],
      ],
      send: [
        jsonResponse({ message: 'SMTP unreachable' }, 502),
      ],
      remove: [
        new Response(null, { status: 204 }),
      ],
    })
    const wrapper = await mountView()

    await clickButton(wrapper, 'Send')
    expect(pageBanner(wrapper).exists()).toBe(true)

    await clickButton(wrapper, 'Remove')
    expect(pageBanner(wrapper).exists()).toBe(false)
  })

  it('shows the empty state after a failed reload is followed by a successful one with no invites', async () => {
    respondWith({
      invites: [
        [expired],
        jsonResponse({ message: 'Service unavailable' }, 503),
        [],
      ],
      remove: [
        new Response(null, { status: 204 }),
      ],
    })
    const wrapper = await mountView()

    await clickButton(wrapper, 'Remove')
    expect(pageBanner(wrapper).text()).toBe('Service unavailable')

    await clickButton(wrapper, 'Remove')
    expect(pageBanner(wrapper).exists()).toBe(false)
    expect(wrapper.find('.tg-empty').text()).toContain('No invites yet')
  })
})
