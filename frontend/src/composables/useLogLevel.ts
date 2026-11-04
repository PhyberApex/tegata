import { ref } from 'vue'
import { useApi } from './useApi'

const LOG_LEVELS = ['warn', 'log', 'debug', 'verbose'] as const
export type LogLevel = typeof LOG_LEVELS[number]

const current = ref<LogLevel>('log')
let lastKnown: LogLevel = 'log'

export function useLogLevel() {
  const { get, post } = useApi()

  async function load() {
    try {
      const { level } = await get<{ level: LogLevel }>('/api/control/log-level')
      lastKnown = level
      current.value = level
    }
    catch {
      // Transient failure — keep showing the last known state rather than flip on a blip.
    }
  }

  async function setLevel(level: LogLevel) {
    const previous = lastKnown
    current.value = level
    try {
      await post('/api/control/log-level', { level })
      lastKnown = level
    }
    catch {
      // Optimistic update didn't take — fall back to what the backend last confirmed.
      current.value = previous
    }
  }

  return {
    current,
    levels: LOG_LEVELS,
    setLevel,
    load,
  }
}
