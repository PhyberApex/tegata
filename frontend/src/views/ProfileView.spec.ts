import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProfileView from './ProfileView.vue'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Every test talks to Tegata the way the page does: fetch, stubbed at the boundary.
const fetchMock = vi.fn()

function mountView() {
  return mount(ProfileView, { attachTo: document.body })
}

function profileForm(wrapper: ReturnType<typeof mountView>) {
  return wrapper.findAll('form')[0]!
}

async function submitProfile(wrapper: ReturnType<typeof mountView>, fields: { displayname?: string, email?: string }) {
  if (fields.displayname !== undefined)
    await wrapper.find('#profile-displayname').setValue(fields.displayname)
  if (fields.email !== undefined)
    await wrapper.find('#profile-email').setValue(fields.email)
  await profileForm(wrapper).trigger('submit')
  await flushPromises()
}

function sentBody() {
  const [url, init] = fetchMock.mock.calls[0]!
  expect(url).toBe('/api/profile')
  expect(init.method).toBe('PATCH')
  return JSON.parse(init.body)
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('profileView handleUpdateProfile', () => {
  it('patches both fields and confirms the save', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }))
    const wrapper = mountView()

    await submitProfile(wrapper, { displayname: 'Alice', email: 'alice@example.test' })

    expect(sentBody()).toEqual({ displayname: 'Alice', email: 'alice@example.test' })
    expect(profileForm(wrapper).find('[role="status"]').exists()).toBe(true)
    expect(profileForm(wrapper).find('[role="alert"]').exists()).toBe(false)
  })

  it('leaves an empty field out of the patch rather than clearing it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }))
    const wrapper = mountView()

    await submitProfile(wrapper, { email: 'alice@example.test' })

    expect(sentBody()).toEqual({ email: 'alice@example.test' })
  })

  it('shows the backend\'s validation message and no success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'email must be an email' }, 400))
    const wrapper = mountView()

    await submitProfile(wrapper, { email: 'not-an-email' })

    expect(profileForm(wrapper).find('[role="alert"]').text()).toBe('email must be an email')
    expect(profileForm(wrapper).find('[role="status"]').exists()).toBe(false)
  })

  it('falls back to a generic message when the failure is not an Error', async () => {
    fetchMock.mockRejectedValue('offline')
    const wrapper = mountView()

    await submitProfile(wrapper, { displayname: 'Alice' })

    expect(profileForm(wrapper).find('[role="alert"]').text()).toBe('Failed to update profile')
  })

  it('disables Save while the patch is in flight and re-enables it after', async () => {
    let answer!: (res: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => {
      answer = resolve
    }))
    const wrapper = mountView()
    const save = profileForm(wrapper).find('button[type="submit"]')

    await wrapper.find('#profile-displayname').setValue('Alice')
    await profileForm(wrapper).trigger('submit')

    expect(save.attributes('disabled')).toBeDefined()
    expect(save.text()).toBe('Saving...')

    answer(jsonResponse({ success: true }))
    await flushPromises()

    expect(save.attributes('disabled')).toBeUndefined()
    expect(save.text()).toBe('Save')
  })

  it('clears an earlier error when the next save succeeds', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'email must be an email' }, 400))
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }))
    const wrapper = mountView()

    await submitProfile(wrapper, { email: 'not-an-email' })
    expect(profileForm(wrapper).find('[role="alert"]').exists()).toBe(true)

    await submitProfile(wrapper, { email: 'alice@example.test' })

    expect(profileForm(wrapper).find('[role="alert"]').exists()).toBe(false)
    expect(profileForm(wrapper).find('[role="status"]').exists()).toBe(true)
  })
})
