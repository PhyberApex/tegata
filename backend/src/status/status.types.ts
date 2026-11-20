// Small, purpose-built payload for the unauthenticated Homepage widget — a
// new module rather than a re-export of an internal endpoint, so the admin API can change without breaking the widget.
export interface AutheliaWriteStatus {
  /** Hours since the Authelia users file was last written, or `null` when it could not be read (then `ok` is false). */
  ageHours: number | null
  /** Whether the file was readable — no staleness threshold is defined here; the widget decides what age is too old. */
  ok: boolean
}

export interface HomepageStatus {
  totalUsers: number
  pendingInvites: number
  authelia: AutheliaWriteStatus
}
