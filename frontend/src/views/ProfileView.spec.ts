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

const ON_FILE = { username: 'alice', displayname: 'Alice', email: 'alice@example.test' }

/** Answers the mount-time `GET /api/profile` with `profile`, and every PATCH with `patch` (or the patched record). */
function respond({ profile = ON_FILE, patch }: { profile?: typeof ON_FILE, patch?: () => Promise<Response> } = {}) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/profile' && (init?.method ?? 'GET') === 'GET')
      return Promise.resolve(jsonResponse(profile))
    return patch
      ? patch()
      : Promise.resolve(jsonResponse({
          ...profile,
          ...JSON.parse(init!.body as string),
        }))
  })
}

async function mountView() {
  const wrapper = mount(ProfileView, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountView>>

function profileForm(wrapper: Wrapper) {
  return wrapper.findAll('form')[0]!
}

async function submitProfile(wrapper: Wrapper, fields: { displayname?: string, email?: string } = {}) {
  if (fields.displayname !== undefined)
    await wrapper.find('#profile-displayname').setValue(fields.displayname)
  if (fields.email !== undefined)
    await wrapper.find('#profile-email').setValue(fields.email)
  await profileForm(wrapper).trigger('submit')
  await flushPromises()
}

function patchCalls() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
}

function sentBody(index = 0) {
  const [url, init] = patchCalls()[index]!
  expect(url).toBe('/api/profile')
  return JSON.parse(init.body)
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  respond()
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('profileView loading the account on file', () => {
  it('prefills both fields and shows the username read-only', async () => {
    const wrapper = await mountView()

    expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.anything())
    expect((wrapper.find('#profile-displayname').element as HTMLInputElement).value).toBe('Alice')
    expect((wrapper.find('#profile-email').element as HTMLInputElement).value).toBe('alice@example.test')
    const usernameField = wrapper.find('#profile-username')
    expect((usernameField.element as HTMLInputElement).value).toBe('alice')
    expect(usernameField.attributes('readonly')).toBeDefined()
  })

  it('drops the "leave blank" placeholders', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('#profile-displayname').attributes('placeholder')).toBeUndefined()
    expect(wrapper.find('#profile-email').attributes('placeholder')).toBeUndefined()
  })

  it('shows the load failure and keeps Save disabled', async () => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(jsonResponse({ message: 'The users database file could not be parsed' }, 503))
    const wrapper = await mountView()

    expect(profileForm(wrapper).find('[role="alert"]').text()).toBe('The users database file could not be parsed')
    expect(profileForm(wrapper).find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
})

describe('profileView handleUpdateProfile', () => {
  it('sends no displayname or email when nothing changed', async () => {
    const wrapper = await mountView()

    await submitProfile(wrapper)

    expect(patchCalls()).toHaveLength(0)
    expect(profileForm(wrapper).find('[role="alert"]').exists()).toBe(false)
    expect(profileForm(wrapper).find('[role="status"]').text()).toBe('Nothing changed.')
  })

  it('sends only the field that changed', async () => {
    const wrapper = await mountView()

    await submitProfile(wrapper, { email: 'alice@new.test' })

    expect(sentBody()).toEqual({ email: 'alice@new.test' })
    expect(profileForm(wrapper).find('[role="status"]').exists()).toBe(true)
    expect(profileForm(wrapper).find('[role="alert"]').exists()).toBe(false)
  })

  it('sends both fields when both changed', async () => {
    const wrapper = await mountView()

    await submitProfile(wrapper, { displayname: 'Alice A', email: 'alice@new.test' })

    expect(sentBody()).toEqual({ displayname: 'Alice A', email: 'alice@new.test' })
  })

  it('treats a saved value as the new baseline, so saving again sends nothing for it', async () => {
    const wrapper = await mountView()

    await submitProfile(wrapper, { displayname: 'Alice A' })
    await submitProfile(wrapper, { email: 'alice@new.test' })

    expect(sentBody(0)).toEqual({ displayname: 'Alice A' })
    expect(sentBody(1)).toEqual({ email: 'alice@new.test' })
  })

  it('shows the stored value after a save, not the one typed', async () => {
    respond({
      patch: () => Promise.resolve(jsonResponse({ ...ON_FILE, displayname: 'Alice A' })),
    })
    const wrapper = await mountView()

    await submitProfile(wrapper, { displayname: '  Alice A  ' })

    expect((wrapper.find('#profile-displayname').element as HTMLInputElement).value).toBe('Alice A')
  })

  it('shows the backend\'s validation message and no success', async () => {
    respond({
      patch: () => Promise.resolve(jsonResponse({ message: 'email must be an email' }, 400)),
    })
    const wrapper = await mountView()

    await submitProfile(wrapper, { email: 'not-an-email' })

    expect(profileForm(wrapper).find('[role="alert"]').text()).toBe('email must be an email')
    expect(profileForm(wrapper).find('[role="status"]').exists()).toBe(false)
  })

  it('falls back to a generic message when the failure is not an Error', async () => {
    respond({
      // eslint-disable-next-line prefer-promise-reject-errors -- a non-Error rejection is the case under test
      patch: () => Promise.reject('offline'),
    })
    const wrapper = await mountView()

    await submitProfile(wrapper, { displayname: 'Alice A' })

    expect(profileForm(wrapper).find('[role="alert"]').text()).toBe('Failed to update profile')
  })

  it('disables Save while the patch is in flight and re-enables it after', async () => {
    let answer!: (res: Response) => void
    respond({
      patch: () => new Promise<Response>((resolve) => {
        answer = resolve
      }),
    })
    const wrapper = await mountView()
    const save = profileForm(wrapper).find('button[type="submit"]')

    await wrapper.find('#profile-displayname').setValue('Alice A')
    await profileForm(wrapper).trigger('submit')

    expect(save.attributes('disabled')).toBeDefined()
    expect(save.text()).toBe('Saving...')

    answer(jsonResponse({ ...ON_FILE, displayname: 'Alice A' }))
    await flushPromises()

    expect(save.attributes('disabled')).toBeUndefined()
    expect(save.text()).toBe('Save')
  })

  it('clears an earlier error when the next save succeeds', async () => {
    const answers = [
      jsonResponse({ message: 'email must be an email' }, 400),
      jsonResponse({ ...ON_FILE, email: 'alice@new.test' }),
    ]
    respond({
      patch: () => Promise.resolve(answers.shift()!),
    })
    const wrapper = await mountView()

    await submitProfile(wrapper, { email: 'not-an-email' })
    expect(profileForm(wrapper).find('[role="alert"]').exists()).toBe(true)

    await submitProfile(wrapper, { email: 'alice@new.test' })

    expect(profileForm(wrapper).find('[role="alert"]').exists()).toBe(false)
    expect(profileForm(wrapper).find('[role="status"]').exists()).toBe(true)
  })
})
