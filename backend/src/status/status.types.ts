// Small, purpose-built payload for the unauthenticated Homepage widget — a
// new module rather than a re-export of an internal endpoint, so the admin API can change without breaking the widget.
export interface AutheliaWriteStatus {
  /** Hours since the Authelia Users Database was last modified, or `null` when it could not be stat'ed, e.g. missing (then `ok` is false). */
  ageHours: number | null
  /**
   * `false` when the file is missing or is an Unreadable Users Database (the rule `/api/health` uses for an
   * existing file). No staleness threshold is defined here; the widget decides what age is too old.
   */
  ok: boolean
}

export interface HomepageStatus {
  totalUsers: number
  pendingInvites: number
  authelia: AutheliaWriteStatus
}
