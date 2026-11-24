import type { DOMWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import GroupInput from './GroupInput.vue'

// GroupInput only ever renders inside a modal's <form @submit.prevent>, so a
// button that defaults to type="submit" submits the whole modal on a click.
function mountInForm(initial: string[]) {
  const onSubmit = vi.fn((e: Event) => e.preventDefault())
  const groups = ref(initial)
  const FormHost = defineComponent(() => () => h('form', { onSubmit }, [
    h(GroupInput, {
      'modelValue': groups.value,
      'availableGroups': [],
      'onUpdate:modelValue': (v: string[]) => { groups.value = v },
    }),
  ]))
  const wrapper = mount(FormHost, { attachTo: document.body })
  return { wrapper, groups, onSubmit }
}

// A native click() rather than trigger('click'): the browser's default action,
// submitting the enclosing form, is the behaviour under test.
function clickButton(wrapper: ReturnType<typeof mountInForm>['wrapper'], selector: string) {
  const button = wrapper.find<HTMLButtonElement>(selector)
  expect(button.exists()).toBe(true)
  button.element.click()
  return wrapper.vm.$nextTick()
}

// setValue() also fires change, so fill the box with input events only — as
// typing, or picking a datalist suggestion, does until the input loses focus.
function typeWithoutCommitting(input: DOMWrapper<HTMLInputElement>, value: string) {
  input.element.value = value
  return input.trigger('input')
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('groupInput inside a form', () => {
  it('adds a group on Add without submitting the form', async () => {
    const { wrapper, groups, onSubmit } = mountInForm([])
    await typeWithoutCommitting(wrapper.find('input'), 'admins')
    await clickButton(wrapper, 'button.tg-btn')
    expect(groups.value).toEqual(['admins'])
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('removes a group on × without submitting the form', async () => {
    const { wrapper, groups, onSubmit } = mountInForm(['admins', 'family'])
    await clickButton(wrapper, 'button[aria-label="Remove group admins"]')
    expect(groups.value).toEqual(['family'])
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('adds a group on Enter without submitting the form', async () => {
    const { wrapper, groups, onSubmit } = mountInForm([])
    const input = wrapper.find('input')
    await typeWithoutCommitting(input, 'admins')
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    input.element.dispatchEvent(enter)
    await wrapper.vm.$nextTick()
    expect(groups.value).toEqual(['admins'])
    // A synthetic keydown never submits the form, so check the default is cancelled.
    expect(enter.defaultPrevented).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Picking from the datalist only fills the text box; clicking the modal's
  // submit button blurs the input, and its change event fires before submit.
  it('commits a pending group on change, before the form is submitted', async () => {
    const { wrapper, groups } = mountInForm(['family'])
    const input = wrapper.find('input')
    await typeWithoutCommitting(input, 'admins')
    expect(groups.value).toEqual(['family'])
    await input.trigger('change')
    expect(groups.value).toEqual(['family', 'admins'])
    expect(input.element.value).toBe('')
  })

  it('emits nothing and clears the box when the pending group is a duplicate', async () => {
    const { wrapper, groups } = mountInForm(['admins'])
    const input = wrapper.find('input')
    await typeWithoutCommitting(input, ' admins ')
    await input.trigger('change')
    expect(groups.value).toEqual(['admins'])
    expect(wrapper.findComponent(GroupInput).emitted('update:modelValue')).toBeUndefined()
    expect(input.element.value).toBe('')
  })
})

// Removing a tag unmounts its focused button; focus must land on a sibling
// control, not fall to <body>, so a keyboard user keeps their place.
describe('groupInput remove buttons', () => {
  async function focusAndRemove(wrapper: ReturnType<typeof mountInForm>['wrapper'], group: string) {
    const selector = `button[aria-label="Remove group ${group}"]`
    wrapper.find<HTMLButtonElement>(selector).element.focus()
    await clickButton(wrapper, selector)
    // removeGroup awaits its own nextTick (the re-render) before moving focus.
    await wrapper.vm.$nextTick()
  }

  it('names each button after its group', () => {
    const { wrapper } = mountInForm(['admins', 'family'])
    const labels = wrapper.findAll('.group-remove').map(b => b.attributes('aria-label'))
    expect(labels).toEqual(['Remove group admins', 'Remove group family'])
  })

  it('moves focus to the following tag after removing a middle one', async () => {
    const { wrapper, groups } = mountInForm(['admins', 'family', 'friends'])
    await focusAndRemove(wrapper, 'family')
    expect(groups.value).toEqual(['admins', 'friends'])
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove group friends')
  })

  it('moves focus to the previous tag after removing the last one', async () => {
    const { wrapper } = mountInForm(['admins', 'family'])
    await focusAndRemove(wrapper, 'family')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove group admins')
  })

  it('moves focus to the add input after removing the only tag', async () => {
    const { wrapper } = mountInForm(['admins'])
    await focusAndRemove(wrapper, 'admins')
    expect(document.activeElement).toBe(wrapper.find('input').element)
  })
})
