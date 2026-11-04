import type { AccessPreviewResponse, DomainGrant, OidcClientGrant, User } from '../types'

export interface EffectiveDomainGrant extends DomainGrant {
  group: string
}

export interface EffectiveOidcClientGrant extends OidcClientGrant {
  group: string
}

export interface EffectiveAccessNote {
  group: string
  note: string
}

export type EffectiveAccessResult
  = | { available: true, domains: EffectiveDomainGrant[], oidcClients: EffectiveOidcClientGrant[], notes: EffectiveAccessNote[] }
    | { available: false, reason: string }

export type EffectiveAccessDiffResult
  = | {
    available: true
    addedDomains: EffectiveDomainGrant[]
    removedDomains: EffectiveDomainGrant[]
    addedOidcClients: EffectiveOidcClientGrant[]
    removedOidcClients: EffectiveOidcClientGrant[]
  }
  | { available: false, reason: string }

export function computeEffectiveAccess(response: AccessPreviewResponse, groupNames: string[]): EffectiveAccessResult {
  if (!response.available)
    return { available: false, reason: response.reason }

  const wanted = new Set(groupNames)
  const relevant = response.previews.filter(p => wanted.has(p.group))

  return {
    available: true,
    domains: relevant.flatMap(p => p.domains.map(d => ({ ...d, group: p.group }))),
    oidcClients: relevant.flatMap(p => p.oidcClients.map(c => ({ ...c, group: p.group }))),
    notes: relevant.flatMap(p => p.notes.map(note => ({ group: p.group, note }))),
  }
}

function domainKey(grant: DomainGrant): string {
  return `${grant.domain}::${grant.policy}`
}

function oidcClientKey(grant: OidcClientGrant): string {
  return `${grant.clientName}::${grant.policyName}::${grant.policy}`
}

/**
 * Guarded Groups that a proposed group-membership change for `username` would leave with zero enabled
 * members — mirrors the backend's Enabled-Count Guard so the confirm modal can warn before the round trip.
 * A group already at zero enabled members never counts (matches the backend: report existing state, don't
 * re-flag it).
 */
export function computeEmptiedGuardedGroups(
  users: User[],
  guardedGroups: string[],
  username: string,
  proposedGroups: string[],
): string[] {
  const proposed = new Set(proposedGroups)

  return guardedGroups.filter((group) => {
    const enabledMembers = users.filter(u => !u.disabled && u.groups.includes(group))
    if (enabledMembers.length === 0)
      return false

    const remaining = enabledMembers.filter(u => u.username !== username || proposed.has(group))
    return remaining.length === 0
  })
}

export function haveGroupsChanged(original: string[], proposed: string[]): boolean {
  if (original.length !== proposed.length)
    return true

  const originalSet = new Set(original)
  return proposed.some(group => !originalSet.has(group))
}

export function diffEffectiveAccess(current: EffectiveAccessResult, proposed: EffectiveAccessResult): EffectiveAccessDiffResult {
  if (!current.available)
    return { available: false, reason: current.reason }
  if (!proposed.available)
    return { available: false, reason: proposed.reason }

  const currentDomainKeys = new Set(current.domains.map(domainKey))
  const proposedDomainKeys = new Set(proposed.domains.map(domainKey))
  const currentOidcKeys = new Set(current.oidcClients.map(oidcClientKey))
  const proposedOidcKeys = new Set(proposed.oidcClients.map(oidcClientKey))

  return {
    available: true,
    addedDomains: proposed.domains.filter(d => !currentDomainKeys.has(domainKey(d))),
    removedDomains: current.domains.filter(d => !proposedDomainKeys.has(domainKey(d))),
    addedOidcClients: proposed.oidcClients.filter(c => !currentOidcKeys.has(oidcClientKey(c))),
    removedOidcClients: current.oidcClients.filter(c => !proposedOidcKeys.has(oidcClientKey(c))),
  }
}
