// An invite as GET /api/invites serves it — `groups` decoded from the stored JSON. Every timestamp is a
// `toISOString()` string with its trailing `Z`, so `new Date(...)` reads each one as the same instant.
export interface Invite {
  id: string
  token: string
  groups: string[]
  expires_at: string
  email: string | null
  displayname: string | null
  used_by: string | null
  used_at: string | null
  created_at: string
  bundle_name: string | null
  email_sent_at: string | null
  email_error: string | null
}
