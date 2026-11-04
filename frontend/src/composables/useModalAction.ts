import { ref } from 'vue'

export function useModalAction() {
  const loading = ref(false)
  const error = ref('')

  async function run(fn: () => Promise<void>, fallbackMessage: string) {
    loading.value = true
    error.value = ''
    try {
      await fn()
    }
    catch (err) {
      error.value = err instanceof Error
        ? err.message
        : fallbackMessage
    }
    finally {
      loading.value = false
    }
  }

  return { loading, error, run }
}
