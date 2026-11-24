import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import EditUserModal from './EditUserModal.vue'

function mountModal() {
  return mount(EditUserModal, {
    props: {
      bundles: [],
      availableGroups: [],
      effectiveAccess: {
        available: true,
        domains: [],
        oidcClients: [],
        notes: [],
      },
      emailRequired: true,
      error: '',
      loading: false,
      accessDiffShow: false,
      accessDiffDiff: null,
      accessDiffNotes: [],
      accessDiffEmptiedGroups: [],
      accessDiffLoading: false,
      accessDiffError: '',
      form: {
        username: 'jdoe',
        displayname: 'J Doe',
        email: 'j@example.com',
        groups: ['admins'],
      },
    },
    attachTo: document.body,
  })
}

// The label whose for= points at the input, read the way assistive tech does.
function labelFor(input: HTMLElement): string | undefined {
  return input.id
    ? document.body.querySelector(`label[for="${input.id}"]`)?.textContent?.trim()
    : undefined
}

describe('editUserModal labels', () => {
  let wrapper: ReturnType<typeof mountModal> | undefined

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.innerHTML = ''
  })

  it('points every label[for] at an existing form control', () => {
    wrapper = mountModal()
    const labels = [
      ...document.body.querySelectorAll('label'),
    ]
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      const target = label.htmlFor
        ? document.getElementById(label.htmlFor)
        : null
      expect(target, `label "${label.textContent?.trim()}"`).toBeInstanceOf(HTMLElement)
      expect(['INPUT', 'SELECT', 'TEXTAREA']).toContain(target!.tagName)
    }
  })

  it('labels the disabled username input', () => {
    wrapper = mountModal()
    const input = document.body.querySelector<HTMLInputElement>('input[disabled]')!
    expect(input.value).toBe('jdoe')
    expect(labelFor(input)).toBe('Username')
  })

  it('labels the add-group input with the Groups label', () => {
    wrapper = mountModal()
    const input = document.body.querySelector<HTMLInputElement>('.group-add-input')!
    expect(labelFor(input)).toBe('Groups')
  })

  it('titles the Effective Access panel with a heading rather than a label', () => {
    wrapper = mountModal()
    const heading = [
      ...document.body.querySelectorAll('h1,h2,h3,h4,h5,h6'),
    ]
      .find(h => h.textContent?.trim() === 'Effective Access')
    expect(heading).toBeDefined()
  })
})
