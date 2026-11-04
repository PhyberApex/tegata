import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GroupsView from './GroupsView.vue'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Every test talks to Tegata the way the page does: fetch, stubbed at the boundary.
const fetchMock = vi.fn()

function respondWith(accessPreview: unknown) {
  fetchMock.mockImplementation((url: string) => {
    if (url === '/api/groups') {
      return Promise.resolve(jsonResponse([
        { name: 'media', description: 'Media apps' },
      ]))
    }
    if (url === '/api/users')
      return Promise.resolve(jsonResponse([]))
    if (url === '/api/access-preview')
      return Promise.resolve(jsonResponse(accessPreview))
    return Promise.resolve(jsonResponse({}))
  })
}

async function mountView() {
  const wrapper = mount(GroupsView, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('groupsView config notes section', () => {
  it('renders both config note messages once, above the groups table', async () => {
    respondWith({
      available: true,
      previews: [
        {
          group: 'media',
          domains: [],
          oidcClients: [],
          notes: [],
        },
      ],
      configNotes: [
        {
          kind: 'open-policy',
          policyName: 'tegata',
          clientNames: ['Tegata'],
          message: 'Policy "tegata" is open by default.',
        },
        {
          kind: 'unreferenced-policy',
          policyName: 'chaptarr',
          clientNames: [],
          message: 'Policy "chaptarr" is not referenced by any OIDC client.',
        },
      ],
    })

    const wrapper = await mountView()

    const section = wrapper.find('[aria-labelledby="config-notes-title"]')
    expect(section.exists()).toBe(true)
    expect(section.text()).toContain('Authelia configuration')

    const messages = section.findAll('.tg-access-note').map(el => el.text())
    expect(messages).toEqual([
      'Policy "tegata" is open by default.',
      'Policy "chaptarr" is not referenced by any OIDC client.',
    ])

    const table = wrapper.find('.tg-table-wrap')
    expect(table.exists()).toBe(true)
    const groupsRoot = wrapper.element
    const sectionIndex = [...groupsRoot.children].indexOf(section.element)
    const tableIndex = [...groupsRoot.children].indexOf(table.element)
    expect(sectionIndex).toBeGreaterThanOrEqual(0)
    expect(sectionIndex).toBeLessThan(tableIndex)
  })

  it('renders no section when there are no config notes', async () => {
    respondWith({ available: true, previews: [], configNotes: [] })

    const wrapper = await mountView()

    expect(wrapper.find('[aria-labelledby="config-notes-title"]').exists()).toBe(false)
  })

  it('renders no section when the access preview is unavailable, and still renders groups', async () => {
    respondWith({ available: false, reason: 'Access preview could not be loaded.' })

    const wrapper = await mountView()

    expect(wrapper.find('[aria-labelledby="config-notes-title"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('media')
  })

  it('keeps config notes out of a group\'s own Access modal', async () => {
    respondWith({
      available: true,
      previews: [
        {
          group: 'media',
          domains: [],
          oidcClients: [],
          notes: ['a per-group note'],
        },
      ],
      configNotes: [
        {
          kind: 'open-policy',
          policyName: 'tegata',
          clientNames: ['Tegata'],
          message: 'a config-level note',
        },
      ],
    })

    const wrapper = await mountView()
    const accessButton = wrapper.findAll('button').find(button => button.text() === 'Access')
    expect(accessButton).toBeTruthy()
    await accessButton!.trigger('click')
    await flushPromises()

    // ModalOverlay teleports to document.body, outside the mounted component's own subtree.
    const modal = document.body.querySelector('[role="dialog"]')
    expect(modal?.textContent).toContain('a per-group note')
    expect(modal?.textContent).not.toContain('a config-level note')
  })
})

function findDialog(label: string): HTMLElement {
  const dialog = [
    ...document.body.querySelectorAll('[role="dialog"]'),
  ]
    .find(el => el.getAttribute('aria-label') === label)
  if (!dialog)
    throw new Error(`No dialog found with aria-label "${label}"`)
  return dialog as HTMLElement
}

function findButton(root: HTMLElement, text: string): DOMWrapper<HTMLButtonElement> {
  const button = [
    ...root.querySelectorAll('button'),
  ].find(el => el.textContent?.trim() === text)
  if (!button)
    throw new Error(`No button found with text "${text}"`)
  return new DOMWrapper(button as HTMLButtonElement)
}

describe('groupsView Enabled-Count Guard on membership changes', () => {
  function respondWithMembershipFixture(overrides: { guardedGroups: string[], patchStatus?: number, patchBody?: unknown }) {
    const patchBodies: unknown[] = []
    let patchCallCount = 0

    function patchAliceResponse(opts?: RequestInit) {
      patchBodies.push(opts?.body
        ? JSON.parse(opts.body as string)
        : undefined)
      patchCallCount += 1
      return patchCallCount === 1 && overrides.patchStatus
        ? jsonResponse(overrides.patchBody, overrides.patchStatus)
        : jsonResponse({ success: true })
    }

    const routes: Record<string, () => Response> = {
      '/api/groups': () => jsonResponse([
        { name: 'admins', description: '' },
      ]),
      '/api/users': () => jsonResponse([
        {
          username: 'alice',
          displayname: 'Alice',
          email: 'alice@example.com',
          groups: ['admins'],
          disabled: false,
        },
      ]),
      '/api/access-preview': () => jsonResponse({
        available: true,
        previews: [
          {
            group: 'admins',
            domains: [],
            oidcClients: [],
            notes: [],
          },
        ],
        configNotes: [],
        guardedGroups: overrides.guardedGroups,
      }),
    }

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/users/alice' && opts?.method === 'PATCH')
        return Promise.resolve(patchAliceResponse(opts))
      return Promise.resolve((routes[url] ?? (() => jsonResponse({})))())
    })

    return patchBodies
  }

  async function openMembersAndRemoveAlice() {
    const wrapper = await mountView()
    await findButton(wrapper.element as HTMLElement, 'Members').trigger('click')
    await flushPromises()

    await findButton(findDialog('Members — admins'), 'Remove').trigger('click')
    await flushPromises()

    return wrapper
  }

  it('warns that removing the last enabled member would empty a Guarded Group, and confirming sends confirm: true', async () => {
    const patchBodies = respondWithMembershipFixture({
      guardedGroups: ['admins'],
    })

    await openMembersAndRemoveAlice()

    const diffDialog = findDialog('Confirm Access Change')
    expect(diffDialog.textContent).toContain('admins')

    await findButton(diffDialog, 'Confirm').trigger('click')
    await flushPromises()

    expect(patchBodies).toEqual([
      { groups: [], confirm: true },
    ])
  })

  it('does not warn when the affected group is not a Guarded Group', async () => {
    const patchBodies = respondWithMembershipFixture({ guardedGroups: [] })

    await openMembersAndRemoveAlice()

    const diffDialog = findDialog('Confirm Access Change')
    expect(diffDialog.textContent).not.toContain('would leave no enabled members')

    await findButton(diffDialog, 'Confirm').trigger('click')
    await flushPromises()

    expect(patchBodies).toEqual([
      { groups: [] },
    ])
  })

  it('opens the confirm-and-retry modal when a late confirmRequired 409 arrives on a group edit', async () => {
    const patchBodies = respondWithMembershipFixture({
      guardedGroups: [],
      patchStatus: 409,
      patchBody: {
        message: 'This would leave no enabled members in admins',
        confirmRequired: true,
        enabledCount: 1,
        emptiedGroups: ['admins'],
      },
    })

    await openMembersAndRemoveAlice()

    const diffDialog = findDialog('Confirm Access Change')
    await findButton(diffDialog, 'Confirm').trigger('click')
    await flushPromises()

    const retryDialog = findDialog('Confirm Action')
    expect(retryDialog.textContent).toContain('This would leave no enabled members in admins')

    await findButton(retryDialog, 'Confirm').trigger('click')
    await flushPromises()

    expect(patchBodies).toEqual([
      { groups: [] },
      { groups: [], confirm: true },
    ])
  })
})

describe('groupsView add member', () => {
  function respondWithAddFixture(username: string) {
    const patchBodies: Array<{ url: string, body: unknown }> = []
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'PATCH') {
        patchBodies.push({
          url,
          body: JSON.parse(opts.body as string),
        })
        return Promise.resolve(jsonResponse({ success: true }))
      }
      if (url === '/api/groups') {
        return Promise.resolve(jsonResponse([
          { name: 'media', description: '' },
        ]))
      }
      if (url === '/api/users') {
        return Promise.resolve(jsonResponse([
          {
            username,
            displayname: 'Odd',
            email: 'odd@example.com',
            groups: [],
            disabled: false,
          },
        ]))
      }
      if (url === '/api/access-preview') {
        return Promise.resolve(jsonResponse({
          available: true,
          previews: [],
          configNotes: [],
          guardedGroups: [],
        }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    return patchBodies
  }

  async function openMembersAndAdd(username: string) {
    const wrapper = await mountView()
    await findButton(wrapper.element as HTMLElement, 'Members').trigger('click')
    await flushPromises()

    const membersDialog = findDialog('Members — media')
    const select = new DOMWrapper(membersDialog.querySelector('select')!)
    await select.setValue(username)
    await findButton(membersDialog, 'Add').trigger('click')
    await flushPromises()
    return membersDialog
  }

  it('keeps the picked user selected when the access-diff modal is cancelled', async () => {
    const patchBodies = respondWithAddFixture('odd')
    const membersDialog = await openMembersAndAdd('odd')

    await findButton(findDialog('Confirm Access Change'), 'Cancel').trigger('click')
    await flushPromises()

    expect(membersDialog.querySelector('select')!.value).toBe('odd')
    expect(patchBodies).toEqual([])
  })

  it('clears the selection once the confirmed add has been saved, URL-encoding the username', async () => {
    const patchBodies = respondWithAddFixture('a/b?c#d')
    const membersDialog = await openMembersAndAdd('a/b?c#d')

    await findButton(findDialog('Confirm Access Change'), 'Confirm').trigger('click')
    await flushPromises()

    expect(patchBodies).toEqual([
      {
        url: '/api/users/a%2Fb%3Fc%23d',
        body: {
          groups: ['media'],
        },
      },
    ])
    expect(membersDialog.querySelector('select')!.value).toBe('')
  })
})

describe('groupsView delete', () => {
  function respondWithDeleteFixture(deleteResponses: Array<() => Response>) {
    const deleteBodies: unknown[] = []
    const routes: Record<string, () => Response> = {
      '/api/groups': () => jsonResponse([
        { name: 'media', description: '' },
      ]),
      '/api/users': () => jsonResponse([
        {
          username: 'alice',
          displayname: 'Alice',
          email: 'a@example.com',
          groups: ['media'],
          disabled: false,
        },
        {
          username: 'bob',
          displayname: 'Bob',
          email: 'b@example.com',
          groups: ['media'],
          disabled: false,
        },
      ]),
      '/api/access-preview': () => jsonResponse({
        available: true,
        previews: [],
        configNotes: [],
        guardedGroups: [],
      }),
    }
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/groups/media' && opts?.method === 'DELETE') {
        deleteBodies.push(opts.body
          ? JSON.parse(opts.body as string)
          : undefined)
        return Promise.resolve(deleteResponses[deleteBodies.length - 1]())
      }
      return Promise.resolve((routes[url] ?? (() => jsonResponse({})))())
    })
    return deleteBodies
  }

  async function openDelete() {
    const wrapper = await mountView()
    await findButton(wrapper.element as HTMLElement, 'Delete').trigger('click')
    await flushPromises()
    return findDialog('Delete Group')
  }

  const conflict = {
    message: 'Group "media" is still named by 2 users, 1 pending invite, 1 bundle',
    confirmRequired: true,
    members: ['alice', 'bob'],
    invites: [
      { id: 'inv-1', email: 'carol@example.com' },
    ],
    bundles: ['family'],
    emptiedGroups: [],
  }

  it('shows the member count up front', async () => {
    respondWithDeleteFixture([])

    const dialog = await openDelete()

    expect(dialog.textContent).toContain('It has 2 members')
  })

  it('turns a 409 into a confirm step listing what still names the group, and confirming sends confirm: true', async () => {
    const deleteBodies = respondWithDeleteFixture([
      () => jsonResponse(conflict, 409),
      () => jsonResponse({ success: true }),
    ])

    const dialog = await openDelete()
    await findButton(dialog, 'Delete').trigger('click')
    await flushPromises()

    const confirmDialog = findDialog('Delete Group')
    expect(confirmDialog.textContent).toContain('alice, bob')
    expect(confirmDialog.textContent).toContain('carol@example.com')
    expect(confirmDialog.textContent).toContain('family')
    expect(confirmDialog.querySelector('[role="alert"]')).toBeNull()

    await findButton(confirmDialog, 'Delete Anyway').trigger('click')
    await flushPromises()

    expect(deleteBodies).toEqual([
      undefined,
      { confirm: true },
    ])
    expect(document.body.querySelector('[aria-label="Delete Group"]')).toBeNull()
  })

  it('names a Guarded Group the delete would empty', async () => {
    respondWithDeleteFixture([
      () => jsonResponse({
        ...conflict,
        emptiedGroups: ['media'],
      }, 409),
    ])

    const dialog = await openDelete()
    await findButton(dialog, 'Delete').trigger('click')
    await flushPromises()

    expect(findDialog('Delete Group').querySelector('[role="alert"]')?.textContent).toContain('media')
  })
})
