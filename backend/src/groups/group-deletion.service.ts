import type { GroupInUseConflict } from '@tegata/shared'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { isPendingInvite } from '../invites/pending-invite'
import { UsersService } from '../users/users.service'

/**
 * Group Deletion (CONTEXT.md) — its own service rather than a `GroupsService` method because it reaches the
 * users database, and `UsersService` already depends on `GroupsService` (ensureGroup, Group Seeding).
 */
@Injectable()
export class GroupDeletionService {
  constructor(private db: DatabaseService, private usersService: UsersService) {}

  /** Pending invites whose `groups` still name `group` — a used or expired one grants nothing and is history. */
  private pendingInvitesNaming(group: string): Array<{ id: string, email: string | null, groups: string[] }> {
    const rows = this.db.instance
      .prepare('SELECT id, email, groups, used_by, expires_at FROM invites')
      .all() as Array<{ id: string, email: string | null, groups: string, used_by: string | null, expires_at: string }>
    return rows
      .map(row => ({
        ...row,
        groups: JSON.parse(row.groups) as string[],
      }))
      .filter(row => isPendingInvite(row) && row.groups.includes(group))
  }

  private bundlesNaming(group: string): Array<{ name: string, groups: string[] }> {
    const rows = this.db.instance
      .prepare('SELECT name, groups FROM bundles ORDER BY name ASC')
      .all() as Array<{ name: string, groups: string }>
    return rows
      .map(row => ({
        name: row.name,
        groups: JSON.parse(row.groups) as string[],
      }))
      .filter(row => row.groups.includes(group))
  }

  private inUseConflict(name: string, references: Omit<GroupInUseConflict, 'message' | 'confirmRequired'>): ConflictException {
    const counts = [
      [references.members.length, 'user'],
      [references.invites.length, 'pending invite'],
      [references.bundles.length, 'bundle'],
    ] as const
    const named = counts.filter(([count]) => count > 0).map(([count, noun]) => `${count} ${noun}${count === 1
      ? ''
      : 's'}`)
    const messages = [`Group "${name}" is still named by ${named.join(', ')}`]
    if (references.emptiedGroups.length > 0)
      messages.push(`This would leave no enabled members in ${references.emptiedGroups.join(', ')}`)
    const body: GroupInUseConflict = {
      message: messages.join('. '),
      confirmRequired: true,
      ...references,
    }
    return new ConflictException(body)
  }

  /**
   * Group Deletion (CONTEXT.md). Membership lives on user records, and Group Seeding re-creates any group a
   * user still names on the next boot — so deleting only the row would undo itself. While any user, pending
   * invite or bundle names the group this refuses with a 409 listing them; with `confirm: true` it strips the
   * group from every one of them (the users database first, in one write behind the Enabled-Count Guard),
   * then deletes the row.
   */
  deleteGroup(name: string, confirm = false): void {
    const existing = this.db.instance
      .prepare('SELECT name FROM groups WHERE name = ?')
      .get(name)
    if (!existing)
      throw new NotFoundException(`Group "${name}" not found`)

    const { members, emptiedGroups } = this.usersService.previewGroupRemoval(name)
    const invites = this.pendingInvitesNaming(name)
    const bundles = this.bundlesNaming(name)
    const inUse = members.length + invites.length + bundles.length > 0
    if (inUse && !confirm) {
      throw this.inUseConflict(name, {
        members,
        invites: invites.map(({ id, email }) => ({ id, email })),
        bundles: bundles.map(bundle => bundle.name),
        emptiedGroups,
      })
    }

    if (members.length > 0)
      this.usersService.removeGroupFromAllUsers(name, confirm)
    this.stripAndDeleteRow(name, invites, bundles)
  }

  /** Group Deletion's SQLite half, in one transaction: the group off each invite and bundle, then the row. */
  private stripAndDeleteRow(
    name: string,
    invites: Array<{ id: string, groups: string[] }>,
    bundles: Array<{ name: string, groups: string[] }>,
  ): void {
    const stripped = (groups: string[]) => JSON.stringify(groups.filter(g => g !== name))
    this.db.instance.transaction(() => {
      for (const invite of invites) {
        this.db.instance
          .prepare('UPDATE invites SET groups = ? WHERE id = ?')
          .run(stripped(invite.groups), invite.id)
      }
      for (const bundle of bundles) {
        this.db.instance
          .prepare('UPDATE bundles SET groups = ? WHERE name = ?')
          .run(stripped(bundle.groups), bundle.name)
      }
      this.db.instance
        .prepare('DELETE FROM groups WHERE name = ?')
        .run(name)
    })()
  }
}
