import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import ModalOverlay from './ModalOverlay.vue'

// ModalOverlay teleports to document.body, so everything is queried from there.
function dialog(): HTMLElement {
  const el = document.body.querySelector<HTMLElement>('[role="dialog"]')
  if (!el)
    throw new Error('No dialog rendered')
  return el
}

function focusables(): HTMLElement[] {
  return [
    ...dialog().querySelectorAll<HTMLElement>('button, input'),
  ]
}

function mountModal() {
  return mount(ModalOverlay, {
    props: { title: 'Delete User' },
    slots: {
      default: () => [
        h('input', { id: 'slot-input' }),
        h('button', { id: 'slot-confirm' }, 'Confirm'),
      ],
    },
    attachTo: document.body,
  })
}

function keydown(target: HTMLElement, key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('modalOverlay', () => {
  it('is an aria-modal dialog labelled by its visible title', () => {
    mountModal()
    const el = dialog()
    expect(el.getAttribute('aria-modal')).toBe('true')
    expect(el.hasAttribute('aria-label')).toBe(false)
    const labelId = el.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    const label = document.getElementById(labelId!)
    expect(label?.tagName).toBe('H2')
    expect(label?.textContent?.trim()).toBe('Delete User')
  })

  it('moves focus into the dialog on mount', async () => {
    mountModal()
    await nextTick()
    expect(dialog().contains(document.activeElement)).toBe(true)
  })

  it('focuses the first focusable element in the dialog', async () => {
    mountModal()
    await nextTick()
    expect(document.activeElement).toBe(focusables()[0])
  })

  it('emits close on Escape', async () => {
    const wrapper = mountModal()
    await nextTick()
    keydown(document.activeElement as HTMLElement, 'Escape')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('wraps Tab from the last focusable element to the first', async () => {
    mountModal()
    await nextTick()
    const items = focusables()
    const last = items.at(-1)!
    last.focus()
    const event = keydown(last, 'Tab')
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(items[0])
  })

  it('wraps Shift+Tab from the first focusable element to the last', async () => {
    mountModal()
    await nextTick()
    const items = focusables()
    items[0].focus()
    const event = keydown(items[0], 'Tab', true)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(items.at(-1))
  })

  it('leaves Tab alone between inner elements', async () => {
    mountModal()
    await nextTick()
    const items = focusables()
    items[0].focus()
    const event = keydown(items[0], 'Tab')
    expect(event.defaultPrevented).toBe(false)
  })

  it('returns focus to the opener after unmount', async () => {
    const open = ref(false)
    const Host = defineComponent(() => () => h('div', [
      h('button', {
        id: 'opener',
        onClick: () => { open.value = true },
      }, 'Open'),
      open.value
        ? h(ModalOverlay, {
            title: 'Delete User',
            onClose: () => { open.value = false },
          })
        : null,
    ]))
    const wrapper = mount(Host, { attachTo: document.body })
    const opener = wrapper.find<HTMLButtonElement>('#opener').element
    opener.focus()
    opener.click()
    await nextTick()
    await nextTick()
    expect(dialog().contains(document.activeElement)).toBe(true)

    keydown(document.activeElement as HTMLElement, 'Escape')
    await nextTick()
    await nextTick()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
