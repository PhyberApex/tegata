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
})
