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

  // A Confirm button that turns disabled while its request is in flight is
  // blurred by the browser, leaving focus on <body> behind the dialog.
  it('still handles Escape and Tab after focus has fallen back to the body', async () => {
    const wrapper = mountModal()
    await nextTick()
    ;(document.activeElement as HTMLElement).blur()
    expect(document.activeElement).toBe(document.body)

    keydown(document.body, 'Tab')
    expect(document.activeElement).toBe(focusables()[0])

    ;(document.activeElement as HTMLElement).blur()
    keydown(document.body, 'Escape')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('lets only the top-most of two stacked dialogs react to Escape', async () => {
    const below = mountModal()
    const above = mount(ModalOverlay, {
      props: { title: 'Confirm Access Change' },
      attachTo: document.body,
    })
    await nextTick()
    keydown(document.activeElement as HTMLElement, 'Escape')
    expect(above.emitted('close')).toHaveLength(1)
    expect(below.emitted('close')).toBeUndefined()
  })

  it('skips controls removed from the tab order when wrapping', async () => {
    mount(ModalOverlay, {
      props: { title: 'Delete User' },
      slots: {
        default: () => [
          h('button', { id: 'slot-confirm' }, 'Confirm'),
          h('button', {
            id: 'slot-skipped',
            tabindex: -1,
          }, 'Skipped'),
        ],
      },
      attachTo: document.body,
    })
    await nextTick()
    const confirm = document.getElementById('slot-confirm')!
    confirm.focus()
    keydown(confirm, 'Tab')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close')
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

  describe('backdrop click', () => {
    function overlay(): HTMLElement {
      const el = document.body.querySelector<HTMLElement>('.overlay')
      if (!el)
        throw new Error('No overlay rendered')
      return el
    }

    function mousedown(target: HTMLElement) {
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    }

    // A drag released outside the card dispatches click on the common
    // ancestor, the overlay, so the press target is what tells them apart.
    it('does not emit close when the press began inside the dialog', async () => {
      const wrapper = mountModal()
      await nextTick()
      mousedown(document.getElementById('slot-input')!)
      overlay().click()
      expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('emits close once when the press and the click are both on the backdrop', async () => {
      const wrapper = mountModal()
      await nextTick()
      mousedown(overlay())
      overlay().click()
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('does not carry a backdrop press over to a later drag from inside', async () => {
      const wrapper = mountModal()
      await nextTick()
      mousedown(overlay())
      mousedown(document.getElementById('slot-input')!)
      overlay().click()
      expect(wrapper.emitted('close')).toBeUndefined()
    })
  })
})
