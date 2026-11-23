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
    await wrapper.find('input').setValue('admins')
    await clickButton(wrapper, 'button.tg-btn')
    expect(groups.value).toEqual(['admins'])
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('removes a group on × without submitting the form', async () => {
    const { wrapper, groups, onSubmit } = mountInForm(['admins', 'family'])
    await clickButton(wrapper, 'button[aria-label="Remove group"]')
    expect(groups.value).toEqual(['family'])
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('adds a group on Enter without submitting the form', async () => {
    const { wrapper, groups, onSubmit } = mountInForm([])
    const input = wrapper.find('input')
    await input.setValue('admins')
    await input.trigger('keydown', { key: 'Enter' })
    expect(groups.value).toEqual(['admins'])
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
