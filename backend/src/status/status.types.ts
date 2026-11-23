// Small, purpose-built payload for the unauthenticated Homepage widget — a
// new module rather than a re-export of an internal endpoint, so the admin API can change without breaking the widget.
export interface AutheliaWriteStatus {
  /** Hours since the Authelia Users Database was last modified, or `null` when it could not be stat'ed, e.g. missing (then `ok` is false). */
  ageHours: number | null
  /**
   * Whether the file exists and is readable as a users database (the rule `/api/health` uses), so a corrupt,
   * empty or permission-denied file is `false`. No staleness threshold is defined here; the widget decides what age is too old.
   */
  ok: boolean
}

export interface HomepageStatus {
  totalUsers: number
  pendingInvites: number
  authelia: AutheliaWriteStatus
}
