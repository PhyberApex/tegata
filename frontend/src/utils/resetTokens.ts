import type { ResetToken } from '../types'

export function outstandingResetTokenFor(tokens: ResetToken[], username: string): ResetToken | null {
  return tokens.find(t => t.username === username && !t.used_at) ?? null
}

export function resetLinkUrl(token: string): string {
  return `${window.location.origin}/reset/${token}`
}
