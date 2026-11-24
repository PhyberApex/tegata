import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import GroupsField from './GroupsField.vue'

function mountField(label?: string) {
  return mount(GroupsField, {
    props: {
      bundles: [],
      availableGroups: ['admins', 'dev'],
      groups: ['admins'],
      ...(label
        ? { label }
        : {}),
    },
    attachTo: document.body,
  })
}

describe('groupsField labels', () => {
  let wrapper: ReturnType<typeof mountField> | undefined

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.innerHTML = ''
  })

  it('points every label[for] at an existing form control', () => {
    wrapper = mountField()
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

  it('associates the visible label with the add-group input', () => {
    wrapper = mountField('Invite groups')
    const input = document.body.querySelector<HTMLInputElement>('.group-add-input')!
    expect(input.id).not.toBe('')
    expect(document.body.querySelector(`label[for="${input.id}"]`)?.textContent?.trim()).toBe('Invite groups')
  })

  it('groups the chip list under the label', () => {
    wrapper = mountField()
    const group = document.body.querySelector<HTMLElement>('[role="group"]')!
    expect(group).not.toBeNull()
    expect(group.querySelector('.group-tag')).not.toBeNull()
    const labelledBy = group.getAttribute('aria-labelledby')!
    expect(document.getElementById(labelledBy)?.textContent?.trim()).toBe('Groups')
  })
})
