// The 409 DELETE /api/groups/:name answers while anything still names the group
// (backend CONTEXT.md, "Group Deletion") — retried with `{ confirm: true }` it
// strips the group from every one of them and deletes it.
export interface GroupInUseConflict {
  message: string
  confirmRequired: true
  /** Every user whose `groups` still carries it, disabled ones included. */
  members: string[]
  /** Pending invites that would still grant it on redemption. */
  invites: Array<{ id: string, email: string | null }>
  /** Bundles that would still expand to it. */
  bundles: string[]
  /** Guarded Groups this delete would leave with no enabled member — `[]` or the group itself. */
  emptiedGroups: string[]
}
