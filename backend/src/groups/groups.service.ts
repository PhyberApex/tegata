import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'

export interface Group {
  name: string
  description: string
}

@Injectable()
export class GroupsService {
  constructor(private db: DatabaseService) {}

  listGroups(): Group[] {
    return this.db.instance
      .prepare('SELECT * FROM groups ORDER BY name ASC')
      .all() as Group[]
  }

  getGroupNames(): string[] {
    return this.listGroups().map(g => g.name)
  }

  ensureGroup(name: string): void {
    this.db.instance
      .prepare('INSERT OR IGNORE INTO groups (name) VALUES (?)')
      .run(name)
  }

  createGroup(name: string, description = ''): Group {
    const existing = this.db.instance
      .prepare('SELECT name FROM groups WHERE name = ?')
      .get(name)
    if (existing)
      throw new ConflictException(`Group "${name}" already exists`)
    this.db.instance
      .prepare('INSERT INTO groups (name, description) VALUES (?, ?)')
      .run(name, description)
    return { name, description }
  }

  updateGroup(name: string, description: string): Group {
    const existing = this.db.instance
      .prepare('SELECT name FROM groups WHERE name = ?')
      .get(name)
    if (!existing)
      throw new NotFoundException(`Group "${name}" not found`)
    this.db.instance
      .prepare('UPDATE groups SET description = ? WHERE name = ?')
      .run(description, name)
    return { name, description }
  }
}
