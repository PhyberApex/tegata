<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

const titleId = useId()
const dialogEl = ref<HTMLElement>()

// Every selector excludes tabindex="-1": those controls are out of the Tab order.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
].map(selector => `${selector}:not([tabindex="-1"])`).join(', ')

function focusables(): HTMLElement[] {
  return dialogEl.value
    ? [
        ...dialogEl.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ]
    : []
}

// Stacked dialogs are sibling teleports, so the last one in <body> is on top.
function isTopMost(): boolean {
  const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
  return dialogs.length > 0 && dialogs[dialogs.length - 1] === dialogEl.value
}

let opener: HTMLElement | null = null

// A text-selection drag that starts in the card and ends past its edge fires
// click on the common ancestor, the overlay, so `.self` alone would close the
// dialog. Only a click whose press also began on the backdrop closes it.
let pressedOnBackdrop = false

function onOverlayMousedown(event: MouseEvent) {
  pressedOnBackdrop = event.target === event.currentTarget
}

function onOverlayClick(event: MouseEvent) {
  const fromBackdrop = pressedOnBackdrop
  pressedOnBackdrop = false
  if (event.target === event.currentTarget && fromBackdrop)
    emit('close')
}

onMounted(() => {
  // Listening on the document, not the dialog, keeps Escape and the trap working
  // when focus has fallen back to <body>, e.g. from a Confirm button the browser
  // blurred because it turned disabled while its request is in flight.
  document.addEventListener('keydown', onKeydown)
  opener = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
  const dialog = dialogEl.value
  if (!dialog || dialog.contains(document.activeElement))
    return
  const first = focusables()[0]
  ;(first ?? dialog).focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  if (opener?.isConnected)
    opener.focus()
})

function onKeydown(event: KeyboardEvent) {
  if (!isTopMost())
    return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab')
    return
  const items = focusables()
  if (items.length === 0) {
    event.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  const outside = !items.includes(active as HTMLElement)
  if (event.shiftKey && (active === first || outside)) {
    event.preventDefault()
    last.focus()
  }
  else if (!event.shiftKey && (active === last || outside)) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @mousedown="onOverlayMousedown" @click="onOverlayClick">
      <div
        ref="dialogEl"
        class="modal tg-card"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <div class="modal-header">
          <h2 :id="titleId" class="modal-title">
            {{ title }}
          </h2>
          <button class="tg-btn tg-btn-ghost modal-close" aria-label="Close" @click="emit('close')">
            &times;
          </button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: var(--tg-space-xl);
}

.modal {
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

/* Only reachable by script or a click on the card; the ring would just frame the card. */
.modal:focus {
  outline: none;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--tg-space-xl);
}

.modal-title {
  font-size: var(--tg-font-lg);
  font-weight: 600;
  margin: 0;
}

.modal-close {
  font-size: 1.5rem;
  line-height: 1;
  padding: var(--tg-space-xs) var(--tg-space-sm);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--tg-space-lg);
}

/* ── Entry animations ── */

@keyframes overlay-in {
  from { opacity: 0; }
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
}

.overlay {
  animation: overlay-in 0.18s var(--tg-ease);
}

.modal {
  animation: modal-in 0.18s var(--tg-ease);
}
</style>
