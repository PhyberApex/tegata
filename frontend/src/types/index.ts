export type {
  AccessPreviewResponse,
  ConfigNote,
  DomainGrant,
  GroupInUseConflict,
  Invite,
  OidcClientGrant,
} from '@tegata/shared'

export interface User {
  username: string
  displayname: string
  email: string
  groups: string[]
  disabled: boolean
}

export interface ResetToken {
  id: string
  token: string
  username: string
  expires_at: string
  used_at: string | null
  created_at: string
  email_sent_at: string | null
  email_error: string | null
}

export interface DatabaseIntegrityStatus {
  matches: boolean
  unreadable: boolean
  unreadableReason: string | null
}

export interface Group {
  name: string
  description: string
}

export interface Bundle {
  name: string
  description: string
  groups: string[]
}
