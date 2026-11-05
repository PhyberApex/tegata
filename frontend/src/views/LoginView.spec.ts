import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { siteName } from '../composables/useSiteName'
import LoginView from './LoginView.vue'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Every test talks to Tegata the way the page does: fetch, stubbed at the boundary.
const fetchMock = vi.fn()

/** The backend decides which doors this client is offered; the card never guesses. */
function respondWithMethods(nativePasswordLogin: boolean, siteName?: string) {
  fetchMock.mockImplementation((url: string) => {
    if (url === '/api/auth/methods')
      return Promise.resolve(jsonResponse({ nativePasswordLogin, siteName }))
    return Promise.resolve(jsonResponse({ success: true }))
  })
}

async function mountView(initialRoute = '/login') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'users',
        component: { template: '<div />' },
      },
      { path: '/login', name: 'login', component: LoginView },
    ],
  })
  router.push(initialRoute)
  await router.isReady()
  const wrapper = mount(LoginView, {
    global: {
      plugins: [router],
    },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  siteName.value = 'Tegata'
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('loginView', () => {
  it('titles the card and the tab with the configured SITE_NAME', async () => {
    respondWithMethods(false, 'Example Family SSO')

    const wrapper = await mountView()

    expect(wrapper.find('.login-title').text()).toBe('Example Family SSO')
    expect(document.title).toBe('Example Family SSO - User Management')
    expect(wrapper.find('.login-powered').text()).toContain('Tegata')
  })

  it('keeps the Tegata title when the backend sends no site name', async () => {
    respondWithMethods(false)

    const wrapper = await mountView()

    expect(wrapper.find('.login-title').text()).toBe('Tegata')
  })

  it('always offers SSO as the primary action', async () => {
    respondWithMethods(false)

    const wrapper = await mountView()

    const sso = wrapper.find('a.login-sso')
    expect(sso.exists()).toBe(true)
    expect(sso.attributes('href')).toBe('/api/auth/oidc/login')
    expect(sso.classes()).toContain('tg-btn-primary')
  })

  describe('a client inside the fence', () => {
    it('offers the password form as the break-glass path, below SSO', async () => {
      respondWithMethods(true)

      const wrapper = await mountView()

      expect(wrapper.find('#password').exists()).toBe(true)

      const card = wrapper.find('.login-card').element
      const ssoIndex = [...card.children].indexOf(wrapper.find('a.login-sso').element)
      const breakGlassIndex = [...card.children].indexOf(wrapper.find('.login-breakglass').element)
      expect(ssoIndex).toBeGreaterThanOrEqual(0)
      expect(ssoIndex).toBeLessThan(breakGlassIndex)
    })

    it('says when to use it', async () => {
      respondWithMethods(true)

      const wrapper = await mountView()

      expect(wrapper.find('.login-breakglass-note').text()).toContain('Authelia')
      expect(wrapper.find('.login-remote-note').exists()).toBe(false)
    })

    it('posts the password to the login endpoint on submit', async () => {
      respondWithMethods(true)

      const wrapper = await mountView()
      await wrapper.find('#password').setValue('hunter2')
      await wrapper.find('form.login-breakglass').trigger('submit')
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ password: 'hunter2' }),
      }))
    })
  })

  describe('a client outside the fence', () => {
    it('offers no password form', async () => {
      respondWithMethods(false)

      const wrapper = await mountView()

      expect(wrapper.find('#password').exists()).toBe(false)
      expect(wrapper.find('.login-breakglass').exists()).toBe(false)
    })

    it('says password login works only from a trusted network', async () => {
      respondWithMethods(false)

      const wrapper = await mountView()

      expect(wrapper.find('.login-remote-note').text()).toContain('trusted network')
    })
  })

  it('offers no password form when the backend could not be asked', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))

    const wrapper = await mountView()

    expect(wrapper.find('#password').exists()).toBe(false)
    expect(wrapper.find('a.login-sso').exists()).toBe(true)
  })

  it('reports the refusal when a login is rejected by the fence', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/methods')
        return Promise.resolve(jsonResponse({ nativePasswordLogin: true }))
      return Promise.resolve(jsonResponse({ message: 'Password login is only available from a trusted network' }, 403))
    })

    const wrapper = await mountView()
    await wrapper.find('#password').setValue('hunter2')
    await wrapper.find('form.login-breakglass').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.login-error').text()).toContain('trusted network')
  })

  it('shows the SSO failure message carried on the query string', async () => {
    respondWithMethods(false)

    const wrapper = await mountView('/login?error=sso_failed')

    expect(wrapper.text()).toContain('SSO authentication failed')
  })
})
