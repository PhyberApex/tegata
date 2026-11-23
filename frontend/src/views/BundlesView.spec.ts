import type { Bundle } from '../types'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BundlesView from './BundlesView.vue'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Every test talks to Tegata the way the page does: fetch, stubbed at the boundary.
const fetchMock = vi.fn()

type WriteMethod = 'POST' | 'PATCH' | 'DELETE'
interface RecordedWrite { method: string, url: string, body: unknown }

/**
 * A small in-memory bundles API. `failNext` makes the next matching write
 * answer with the given error instead of applying it.
 */
function fakeBundlesApi(initial: Bundle[]) {
  let bundles = initial.map(b => ({
    ...b,
    groups: [...b.groups],
  }))
  const writes: RecordedWrite[] = []
  const failures: Array<{ method: WriteMethod, status: number, message: string }> = []

  fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
    const method = opts?.method ?? 'GET'
    if (method === 'GET' && url === '/api/bundles')
      return Promise.resolve(jsonResponse(bundles))
    if (method === 'GET' && url === '/api/groups') {
      return Promise.resolve(jsonResponse([
        { name: 'media', description: '' },
        { name: 'books', description: '' },
      ]))
    }

    const body = opts?.body
      ? JSON.parse(opts.body as string)
      : undefined
    writes.push({ method, url, body })

    const failure = failures.findIndex(f => f.method === method)
    if (failure !== -1) {
      const [{ status, message }] = failures.splice(failure, 1)
      return Promise.resolve(jsonResponse({ message }, status))
    }

    const name = decodeURIComponent(url.replace('/api/bundles/', ''))
    if (method === 'POST') {
      bundles.push(body)
    }
    else if (method === 'PATCH') {
      bundles = bundles.map(b => b.name === name
        ? {
            ...b,
            ...body,
          }
        : b)
    }
    else if (method === 'DELETE') {
      bundles = bundles.filter(b => b.name !== name)
    }
    return Promise.resolve(jsonResponse({ success: true }))
  })

  return {
    writes,
    failNext: (method: WriteMethod, status: number, message: string) => {
      failures.push({ method, status, message })
    },
  }
}

async function mountView() {
  const wrapper = mount(BundlesView, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

// A dialog's accessible name comes from the title its aria-labelledby points at.
function queryDialog(label: string): HTMLElement | undefined {
  return [
    ...document.body.querySelectorAll<HTMLElement>('[role="dialog"]'),
  ]
    .find((el) => {
      const labelId = el.getAttribute('aria-labelledby')
      return labelId !== null && document.getElementById(labelId)?.textContent?.trim() === label
    })
}

function findDialog(label: string): HTMLElement {
  const dialog = queryDialog(label)
  if (!dialog)
    throw new Error(`No dialog found labelled "${label}"`)
  return dialog
}

function findButton(root: Element, text: string): DOMWrapper<HTMLButtonElement> {
  const button = [
    ...root.querySelectorAll('button'),
  ].find(el => el.textContent?.trim() === text)
  if (!button)
    throw new Error(`No button found with text "${text}"`)
  return new DOMWrapper(button as HTMLButtonElement)
}

function rowFor(root: Element, name: string): HTMLElement {
  const row = [
    ...root.querySelectorAll<HTMLElement>('tbody tr'),
  ].find(tr => tr.querySelector('td')?.textContent?.trim() === name)
  if (!row)
    throw new Error(`No row found for bundle "${name}"`)
  return row
}

function rowNames(root: Element): string[] {
  return [
    ...root.querySelectorAll('tbody tr'),
  ].map(tr => tr.querySelector('td')?.textContent?.trim() ?? '')
}

async function click(button: DOMWrapper<HTMLButtonElement>) {
  await button.trigger('click')
  await flushPromises()
}

async function fillAndSubmit(dialog: HTMLElement, fields: { name?: string, description?: string, addGroup?: string }) {
  if (fields.name !== undefined)
    await new DOMWrapper(dialog.querySelector<HTMLInputElement>('#create-name')!).setValue(fields.name)
  if (fields.description !== undefined) {
    const description = dialog.querySelector<HTMLInputElement>('#create-description, #edit-description')!
    await new DOMWrapper(description).setValue(fields.description)
  }
  if (fields.addGroup !== undefined) {
    await new DOMWrapper(dialog.querySelector<HTMLInputElement>('.group-add-input')!).setValue(fields.addGroup)
    await findButton(dialog, 'Add').trigger('click')
  }
  await new DOMWrapper(dialog.querySelector('form')!).trigger('submit')
  await flushPromises()
}

const family: Bundle = {
  name: 'family',
  description: 'Family',
  groups: ['media'],
}
const readers: Bundle = {
  name: 'a/b readers',
  description: '',
  groups: ['books'],
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('bundlesView create, edit and delete', () => {
  it('creates a bundle and lists it once saved', async () => {
    const api = fakeBundlesApi([family])
    const wrapper = await mountView()

    await click(findButton(wrapper.element, '+ New Bundle'))
    await fillAndSubmit(findDialog('Create Bundle'), {
      name: 'kids',
      description: 'For the kids',
      addGroup: 'media',
    })

    expect(api.writes).toEqual([
      {
        method: 'POST',
        url: '/api/bundles',
        body: {
          name: 'kids',
          description: 'For the kids',
          groups: ['media'],
        },
      },
    ])
    expect(queryDialog('Create Bundle')).toBeUndefined()
    expect(rowNames(wrapper.element)).toEqual(['family', 'kids'])
  })

  it('edits a bundle\'s description and groups, URL-encoding its name', async () => {
    const api = fakeBundlesApi([readers])
    const wrapper = await mountView()

    await click(findButton(rowFor(wrapper.element, 'a/b readers'), 'Edit'))
    await fillAndSubmit(findDialog('Edit Bundle'), {
      description: 'Bookworms',
      addGroup: 'media',
    })

    expect(api.writes).toEqual([
      {
        method: 'PATCH',
        url: '/api/bundles/a%2Fb%20readers',
        body: {
          description: 'Bookworms',
          groups: ['books', 'media'],
        },
      },
    ])
    expect(queryDialog('Edit Bundle')).toBeUndefined()
    expect(rowFor(wrapper.element, 'a/b readers').textContent).toContain('Bookworms')
  })

  it('deletes a bundle once confirmed, URL-encoding its name', async () => {
    const api = fakeBundlesApi([family, readers])
    const wrapper = await mountView()

    await click(findButton(rowFor(wrapper.element, 'a/b readers'), 'Delete'))
    await click(findButton(findDialog('Delete Bundle'), 'Delete'))

    expect(api.writes).toEqual([
      { method: 'DELETE', url: '/api/bundles/a%2Fb%20readers', body: undefined },
    ])
    expect(queryDialog('Delete Bundle')).toBeUndefined()
    expect(rowNames(wrapper.element)).toEqual(['family'])
  })
})

describe('bundlesView stale modal errors', () => {
  it('opens Delete without the error a cancelled, failed create left behind', async () => {
    const api = fakeBundlesApi([family])
    api.failNext('POST', 409, 'Bundle "family" already exists')
    const wrapper = await mountView()

    await click(findButton(wrapper.element, '+ New Bundle'))
    await fillAndSubmit(findDialog('Create Bundle'), { name: 'family' })
    const createDialog = findDialog('Create Bundle')
    expect(createDialog.querySelector('[role="alert"]')?.textContent).toContain('Bundle "family" already exists')
    await click(findButton(createDialog, 'Cancel'))

    await click(findButton(rowFor(wrapper.element, 'family'), 'Delete'))

    expect(findDialog('Delete Bundle').querySelector('[role="alert"]')).toBeNull()
  })

  it('opens Delete on another row without the error a cancelled, failed delete left behind', async () => {
    const api = fakeBundlesApi([family, readers])
    api.failNext('DELETE', 500, 'Could not write the bundles file')
    const wrapper = await mountView()

    await click(findButton(rowFor(wrapper.element, 'family'), 'Delete'))
    const firstDialog = findDialog('Delete Bundle')
    await click(findButton(firstDialog, 'Delete'))
    expect(firstDialog.querySelector('[role="alert"]')?.textContent).toContain('Could not write the bundles file')
    await click(findButton(firstDialog, 'Cancel'))

    await click(findButton(rowFor(wrapper.element, 'a/b readers'), 'Delete'))

    const secondDialog = findDialog('Delete Bundle')
    expect(secondDialog.textContent).toContain('a/b readers')
    expect(secondDialog.querySelector('[role="alert"]')).toBeNull()
  })
})
