<script setup lang="ts">
defineProps<{
  message: string
}>()
</script>

<template>
  <p v-if="message" class="tg-form-error" role="alert">
    {{ message }}
  </p>
</template>
