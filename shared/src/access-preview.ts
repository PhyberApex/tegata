// What an Authelia group would reach — the domains its access_control rules
// grant and the OIDC clients that admit it — as GET /api/access-preview serves it.
export interface DomainGrant {
  domain: string
  policy: string
  source: 'group-placeholder' | 'group-subject'
}

export interface OidcClientGrant {
  clientName: string
  policyName: string
  policy: string
}

export interface GroupAccessPreview {
  group: string
  domains: DomainGrant[]
  oidcClients: OidcClientGrant[]
  notes: string[]
}

export type ConfigNoteKind
  = | 'shadowed-policy'
    | 'unreferenced-policy'
    | 'open-policy'
    | 'shared-open-policy'
    | 'stale-acknowledgment'

export interface ConfigNote {
  kind: ConfigNoteKind
  policyName: string
  clientNames: string[]
  message: string
}

export type AccessPreviewResponse
  = | { available: true, previews: GroupAccessPreview[], configNotes: ConfigNote[], guardedGroups: string[] }
    | { available: false, reason: string, guardedGroups: string[] }
