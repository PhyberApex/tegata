// Small, purpose-built payload for the unauthenticated Homepage widget — a
// new module rather than a re-export of an internal endpoint, so the admin API can change without breaking the widget.
export interface AutheliaWriteStatus {
  ageHours: number
  /** Whether the file was readable — no staleness threshold is defined here; the widget decides what age is too old. */
  ok: boolean
}

export interface HomepageStatus {
  totalUsers: number
  pendingInvites: number
  authelia: AutheliaWriteStatus
}
