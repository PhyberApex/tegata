import type { AccessPreviewResponse } from '../types'
import type { EffectiveAccessDiffResult, EffectiveAccessNote } from './effectiveAccess'
import type { useEnabledCountConfirm } from './useEnabledCountConfirm'
import { ref } from 'vue'
import { computeEffectiveAccess, diffEffectiveAccess, haveGroupsChanged } from './effectiveAccess'
import { isEnabledCountGuardError } from './useApi'

export function useAccessDiffConfirm() {
  const show = ref(false)
  const diff = ref<EffectiveAccessDiffResult | null>(null)
  const notes = ref<EffectiveAccessNote[]>([])
  const emptiedGroups = ref<string[]>([])
  const confirmLoading = ref(false)
  const confirmError = ref('')
  let pendingConfirm: ((confirm: boolean) => Promise<void>) | null = null

  async function requestSave(
    preview: AccessPreviewResponse,
    originalGroups: string[],
    proposedGroups: string[],
    performSave: (confirm: boolean) => Promise<void>,
    groupsEmptied: string[] = [],
  ) {
    if (!haveGroupsChanged(originalGroups, proposedGroups)) {
      await performSave(false)
      return
    }

    const current = computeEffectiveAccess(preview, originalGroups)
    const proposed = computeEffectiveAccess(preview, proposedGroups)
    diff.value = diffEffectiveAccess(current, proposed)
    notes.value = proposed.available
      ? proposed.notes
      : []
    emptiedGroups.value = groupsEmptied
    pendingConfirm = performSave
    confirmError.value = ''
    show.value = true
  }

  async function confirm() {
    if (!pendingConfirm)
      return

    confirmLoading.value = true
    confirmError.value = ''
    try {
      // Already warned about in this same modal — no need to make the backend ask again.
      await pendingConfirm(emptiedGroups.value.length > 0)
      show.value = false
      pendingConfirm = null
    }
    catch (err) {
      // Stale data since load (e.g. someone else disabled a user meanwhile) — let the caller fall back
      // to its own confirm-and-retry flow (retryWithConfirm) instead of showing this as a dead-end error.
      // pendingConfirm is deliberately left set for that retry.
      if (isEnabledCountGuardError(err))
        throw err

      confirmError.value = err instanceof Error
        ? err.message
        : 'Failed to save'
    }
    finally {
      confirmLoading.value = false
    }
  }

  /** Re-runs the pending save with confirm: true, for a caller's own retry after a late confirmRequired. */
  async function retryWithConfirm(): Promise<void> {
    if (!pendingConfirm)
      return

    await pendingConfirm(true)
    show.value = false
    pendingConfirm = null
  }

  function cancel() {
    show.value = false
    pendingConfirm = null
  }

  return {
    show,
    diff,
    notes,
    emptiedGroups,
    confirmLoading,
    confirmError,
    requestSave,
    confirm,
    retryWithConfirm,
    cancel,
  }
}

/**
 * Shared confirm-button handler for the Users and Groups views' membership-edit flows: on a late
 * confirmRequired (data changed since load), falls back to the same confirm-and-retry modal a stale
 * toggle-disable/delete would show, instead of leaving the access-diff modal stuck on a dead-end error.
 */
export async function confirmAccessDiffWithGuardFallback(
  accessDiffConfirm: ReturnType<typeof useAccessDiffConfirm>,
  enabledCountConfirm: ReturnType<typeof useEnabledCountConfirm>,
  onFallback?: () => void,
): Promise<void> {
  try {
    await accessDiffConfirm.confirm()
  }
  catch (err) {
    if (!isEnabledCountGuardError(err))
      throw err
    onFallback?.()
    accessDiffConfirm.show.value = false
    enabledCountConfirm.open(err.message, () => accessDiffConfirm.retryWithConfirm())
  }
}
