import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { GroupsService } from '../groups/groups.service'

export interface Bundle {
  name: string
  description: string
  groups: string[]
}

interface BundleRow {
  name: string
  description: string
  groups: string
}

@Injectable()
export class BundlesService {
  constructor(private db: DatabaseService, private groupsService: GroupsService) {}

  private rowToBundle(row: BundleRow): Bundle {
    return {
      ...row,
      groups: JSON.parse(row.groups),
    }
  }

  listBundles(): Bundle[] {
    const rows = this.db.instance
      .prepare('SELECT * FROM bundles ORDER BY name ASC')
      .all() as BundleRow[]
    return rows.map(row => this.rowToBundle(row))
  }

  createBundle(name: string, description = '', groups: string[] = []): Bundle {
    const existing = this.db.instance
      .prepare('SELECT name FROM bundles WHERE name = ?')
      .get(name)
    if (existing)
      throw new ConflictException(`Bundle "${name}" already exists`)
    for (const group of groups)
      this.groupsService.ensureGroup(group)
    this.db.instance
      .prepare('INSERT INTO bundles (name, description, groups) VALUES (?, ?, ?)')
      .run(name, description, JSON.stringify(groups))
    return { name, description, groups }
  }

  updateBundle(name: string, description: string, groups: string[]): Bundle {
    const existing = this.db.instance
      .prepare('SELECT name FROM bundles WHERE name = ?')
      .get(name)
    if (!existing)
      throw new NotFoundException(`Bundle "${name}" not found`)
    for (const group of groups)
      this.groupsService.ensureGroup(group)
    this.db.instance
      .prepare('UPDATE bundles SET description = ?, groups = ? WHERE name = ?')
      .run(description, JSON.stringify(groups), name)
    return { name, description, groups }
  }

  deleteBundle(name: string): void {
    const existing = this.db.instance
      .prepare('SELECT name FROM bundles WHERE name = ?')
      .get(name)
    if (!existing)
      throw new NotFoundException(`Bundle "${name}" not found`)
    this.db.instance
      .prepare('DELETE FROM bundles WHERE name = ?')
      .run(name)
  }
}
