// What GET /api/auth/check and GET /api/profile answer (backend CONTEXT.md,
// "Session Role" and "Self-Service Profile").

export type SessionRole = 'admin' | 'self'

export interface AuthCheck {
  authenticated: true
  role: SessionRole
  /** The token's `sub`; `null` for a Native Login session, which has no account and so no profile. */
  username: string | null
}

/** The caller's own record as the profile page shows it — never `groups`, which self-service can't write. */
export interface OwnProfile {
  username: string
  displayname: string
  email: string
}
