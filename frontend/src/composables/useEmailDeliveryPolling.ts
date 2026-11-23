import { onUnmounted, ref } from 'vue'

/** A row whose background email send (ADR-0002) records its outcome after the create has already answered. */
export interface EmailDeliveryRow {
  id: string
  email_sent_at: string | null
  email_error: string | null
}

// Delays between reloads; their sum (27s) comfortably outlasts the 10s SMTP timeout.
export const EMAIL_DELIVERY_POLL_DELAYS_MS = [1000, 3000, 8000, 15000]

function isSettled(row: EmailDeliveryRow): boolean {
  return row.email_sent_at !== null || row.email_error !== null
}

/**
 * Tracks rows created with "send email" until their background send records an outcome, re-running `reload`
 * on a short backoff so the result appears without the admin reloading — and without a duplicate manual send.
 */
export function useEmailDeliveryPolling<T extends EmailDeliveryRow>(
  reload: () => Promise<void>,
  rows: () => readonly T[],
) {
  const pendingIds = ref<ReadonlySet<string>>(new Set())
  let timer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let disposed = false

  function stop() {
    if (timer !== null)
      clearTimeout(timer)
    timer = null
  }

  /** Drops ids whose row has settled or is gone from the list. */
  function prune() {
    const byId = new Map(rows().map(row => [row.id, row]))
    const remaining = [...pendingIds.value].filter((id) => {
      const row = byId.get(id)
      return row !== undefined && !isSettled(row)
    })
    if (remaining.length !== pendingIds.value.size)
      pendingIds.value = new Set(remaining)
  }

  function scheduleNext() {
    stop()
    if (disposed)
      return
    prune()
    if (pendingIds.value.size === 0)
      return
    if (attempt >= EMAIL_DELIVERY_POLL_DELAYS_MS.length) {
      // Out of attempts: stop claiming a send is in flight, so the row offers Send again.
      pendingIds.value = new Set()
      return
    }
    timer = setTimeout(async () => {
      timer = null
      attempt++
      try {
        await reload()
      }
      finally {
        scheduleNext()
      }
    }, EMAIL_DELIVERY_POLL_DELAYS_MS[attempt])
  }

  /** Call after the create's reload has landed, with the id the create returned. */
  function track(id: string) {
    pendingIds.value = new Set([...pendingIds.value, id])
    attempt = 0
    scheduleNext()
  }

  /** Whether the row's requested email is still being sent, as far as the latest list knows. */
  function isPending(row: T): boolean {
    return pendingIds.value.has(row.id) && !isSettled(row)
  }

  onUnmounted(() => {
    disposed = true
    stop()
  })

  return { pendingIds, track, isPending }
}
