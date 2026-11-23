import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import RegisterView from './RegisterView.vue'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn()

async function mountView(token = 'good-token') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/register/:token', name: 'register', component: RegisterView },
    ],
  })
  router.push(`/register/${encodeURIComponent(token)}`)
  await router.isReady()
  const wrapper = mount(RegisterView, {
    global: {
      plugins: [router],
    },
  })
  await flushPromises()
  return wrapper
}

function retryButton(wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findAll('button').find(b => b.text() === 'Retry')
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('registerView', () => {
  it('offers a retry, not "Invalid Invite", when the validate request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Could not check this link. Try again.')
    expect(retryButton(wrapper)).toBeDefined()
    expect(wrapper.text()).not.toContain('Invalid Invite')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('offers a retry when the server answers 503', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 503 }))

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Could not check this link. Try again.')
    expect(wrapper.text()).not.toContain('Invalid Invite')
  })

  it('shows the form once Retry validates the link', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce(jsonResponse({
      valid: true,
      groups: ['family'],
    }))

    const wrapper = await mountView()
    await retryButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Could not check this link')
    expect(wrapper.text()).toContain('family')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('still shows the invalid card for { valid: false }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ valid: false }))

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Invalid Invite')
    expect(wrapper.text()).not.toContain('Could not check this link')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('encodes the token into the validate and redeem paths', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      valid: true,
      groups: ['family'],
    }))

    const wrapper = await mountView('a/b?c#d')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/invites/a%2Fb%3Fc%23d/validate')

    await wrapper.get('#username').setValue('alice')
    await wrapper.get('#displayname').setValue('Alice')
    await wrapper.get('#email').setValue('alice@example.com')
    await wrapper.get('#password').setValue('password123')
    await wrapper.get('#confirm-password').setValue('password123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fetchMock.mock.calls[1][0]).toBe('/api/invites/a%2Fb%3Fc%23d/redeem')
  })
})
