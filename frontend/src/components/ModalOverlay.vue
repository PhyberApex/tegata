<script setup lang="ts">
defineProps<{ title: string }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @click.self="$emit('close')">
      <div class="modal tg-card" role="dialog" :aria-label="title">
        <div class="modal-header">
          <h2 class="modal-title">
            {{ title }}
          </h2>
          <button class="tg-btn tg-btn-ghost modal-close" aria-label="Close" @click="$emit('close')">
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
