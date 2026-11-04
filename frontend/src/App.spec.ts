import type { LogLevel } from './composables/useLogLevel'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from './App.vue'
import { authenticated, role } from './composables/useAuth'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Every test talks to Tegata the way the page does: fetch, stubbed at the boundary.
const fetchMock = vi.fn()

function respondWithLevel(level: LogLevel) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/control/log-level' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as { level: LogLevel }
      return Promise.resolve(jsonResponse({ success: true, level: body.level }))
    }
    if (url === '/api/control/log-level')
      return Promise.resolve(jsonResponse({ level }))
    return Promise.resolve(jsonResponse({}))
  })
}

async function mountApp() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'users',
        component: { template: '<div />' },
      },
    ],
  })
  router.push('/')
  await router.isReady()
  const wrapper = mount(App, {
    global: {
      plugins: [router],
    },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function logLevelSelect(wrapper: Awaited<ReturnType<typeof mountApp>>) {
  return wrapper.find('[aria-label="Log level"]')
}

function integrityBanner(wrapper: Awaited<ReturnType<typeof mountApp>>) {
  return wrapper.find('.integrity-banner')
}

function respondWithIntegrity(status: { matches: boolean, unreadable: boolean, unreadableReason: string | null }) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/control/log-level' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as { level: LogLevel }
      return Promise.resolve(jsonResponse({ success: true, level: body.level }))
    }
    if (url === '/api/control/log-level')
      return Promise.resolve(jsonResponse({ level: 'log' }))
    if (url === '/api/users/database-integrity')
      return Promise.resolve(jsonResponse(status))
    return Promise.resolve(jsonResponse({}))
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  respondWithLevel('log')
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  authenticated.value = false
  role.value = null
  document.body.innerHTML = ''
})

describe('log level select visibility', () => {
  it('renders no select for a self session', async () => {
    authenticated.value = true
    role.value = 'self'
    const wrapper = await mountApp()
    expect(logLevelSelect(wrapper).exists()).toBe(false)
  })

  it('renders the select for an admin session', async () => {
    authenticated.value = true
    role.value = 'admin'
    const wrapper = await mountApp()
    expect(logLevelSelect(wrapper).exists()).toBe(true)
  })
})

describe('log level select value', () => {
  it('loads the live backend level once the admin session is established', async () => {
    respondWithLevel('debug')
    authenticated.value = true
    role.value = 'admin'
    const wrapper = await mountApp()
    expect((logLevelSelect(wrapper).element as HTMLSelectElement).value).toBe('debug')
  })

  it('shows the level set on a previous session after a reload', async () => {
    respondWithLevel('log')
    authenticated.value = true
    role.value = 'admin'
    const wrapper = await mountApp()
    await logLevelSelect(wrapper).setValue('debug')
    await flushPromises()
    expect((logLevelSelect(wrapper).element as HTMLSelectElement).value).toBe('debug')

    // Simulate a reload: a fresh session re-establishes admin from scratch.
    wrapper.unmount()
    role.value = null
    respondWithLevel('debug')
    role.value = 'admin'
    await flushPromises()
    const reloaded = await mountApp()
    expect((logLevelSelect(reloaded).element as HTMLSelectElement).value).toBe('debug')
  })

  it('reverts the select to the last known backend level when the POST fails', async () => {
    respondWithLevel('log')
    authenticated.value = true
    role.value = 'admin'
    const wrapper = await mountApp()

    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({ message: 'boom' }, 500)))
    await logLevelSelect(wrapper).setValue('debug')
    await flushPromises()

    expect((logLevelSelect(wrapper).element as HTMLSelectElement).value).toBe('log')
  })
})

describe('database integrity banner', () => {
  it('shows the unreadable message and reason, with no Accept Baseline action, when the database is unreadable', async () => {
    respondWithIntegrity({ matches: false, unreadable: true, unreadableReason: 'The users database file could not be parsed: bad indentation' })
    authenticated.value = true
    role.value = 'admin'
    const wrapper = await mountApp()

    const banner = integrityBanner(wrapper)
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('can\'t be read')
    expect(banner.text()).toContain('bad indentation')
    expect(banner.text()).not.toContain('modified outside Tegata')
    expect(banner.find('button').exists()).toBe(false)
  })

  it('shows the out-of-band edit message and Accept Baseline action when not unreadable but out of sync', async () => {
    respondWithIntegrity({ matches: false, unreadable: false, unreadableReason: null })
    authenticated.value = true
    role.value = 'admin'
    const wrapper = await mountApp()

    const banner = integrityBanner(wrapper)
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('modified outside Tegata')
    expect(banner.find('button').exists()).toBe(true)
  })

  it('shows no banner when the database matches baseline and is readable', async () => {
    respondWithIntegrity({ matches: true, unreadable: false, unreadableReason: null })
    authenticated.value = true
    role.value = 'admin'
    const wrapper = await mountApp()

    expect(integrityBanner(wrapper).exists()).toBe(false)
  })
})
