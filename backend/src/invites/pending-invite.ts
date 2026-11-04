import type { Invite } from '@tegata/shared'

/**
 * Single source of truth for "still redeemable" — unredeemed and not yet expired. Its own file so
 * `GroupDeletionService` can ask it without importing `InvitesService` and the module that comes with it.
 */
export function isPendingInvite(invite: Pick<Invite, 'used_by' | 'expires_at'>): boolean {
  return invite.used_by === null && new Date(invite.expires_at).getTime() > Date.now()
}
