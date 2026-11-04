import type { DatabaseIntegrityStatus } from '../types'
import { ref } from 'vue'
import { useApi } from './useApi'

const POLL_INTERVAL_MS = 30_000

const databaseMatchesBaseline = ref(true)
const databaseUnreadable = ref(false)
const databaseUnreadableReason = ref<string | null>(null)

let pollHandle: ReturnType<typeof setInterval> | undefined

export function useDatabaseIntegrity() {
  const api = useApi()

  async function refresh() {
    try {
      const status = await api.get<DatabaseIntegrityStatus>('/api/users/database-integrity')
      databaseMatchesBaseline.value = status.matches
      databaseUnreadable.value = status.unreadable
      databaseUnreadableReason.value = status.unreadableReason
    }
    catch {
      // Transient failure — keep showing the last known state rather than flip the banner on a blip.
    }
  }

  function startPolling() {
    if (pollHandle)
      return
    refresh()
    pollHandle = setInterval(refresh, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    clearInterval(pollHandle)
    pollHandle = undefined
  }

  async function acceptBaseline() {
    await api.post('/api/users/database-integrity/accept-baseline')
    databaseMatchesBaseline.value = true
  }

  return {
    matches: databaseMatchesBaseline,
    unreadable: databaseUnreadable,
    unreadableReason: databaseUnreadableReason,
    refresh,
    startPolling,
    stopPolling,
    acceptBaseline,
  }
}
