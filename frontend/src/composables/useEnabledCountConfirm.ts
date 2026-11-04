import { ref } from 'vue'

/** Shared confirm-and-retry flow for the Enabled-Count Guard's 409, used by both the Users and Groups views. */
export function useEnabledCountConfirm() {
  const show = ref(false)
  const message = ref('')
  const error = ref('')
  const loading = ref(false)
  let pendingRetry: (() => Promise<void>) | null = null

  function open(msg: string, retry: () => Promise<void>) {
    message.value = msg
    error.value = ''
    pendingRetry = retry
    show.value = true
  }

  async function confirm() {
    if (!pendingRetry)
      return

    loading.value = true
    error.value = ''
    try {
      await pendingRetry()
      show.value = false
      pendingRetry = null
    }
    catch (err) {
      error.value = err instanceof Error
        ? err.message
        : 'Failed to proceed'
    }
    finally {
      loading.value = false
    }
  }

  function close() {
    show.value = false
    pendingRetry = null
  }

  return {
    show,
    message,
    error,
    loading,
    open,
    confirm,
    close,
  }
}
