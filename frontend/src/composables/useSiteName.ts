import { ref, watchEffect } from 'vue'
import { useApi } from './useApi'

const DEFAULT_SITE_NAME = 'Tegata'

// Shared across views: the backend's SITE_NAME, defaulting to Tegata until (or unless) it answers.
export const siteName = ref(DEFAULT_SITE_NAME)

watchEffect(() => {
  document.title = `${siteName.value} - User Management`
})

export function useSiteName() {
  const api = useApi()

  async function loadSiteName() {
    try {
      const methods = await api.get<{ siteName?: string }>('/api/auth/methods')
      if (methods.siteName)
        siteName.value = methods.siteName
    }
    catch {}
  }

  return { siteName, loadSiteName }
}
