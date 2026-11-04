import type Database from 'better-sqlite3'
import type { MailResult } from './mail.service'
import { Logger } from '@nestjs/common'

const logger = new Logger('recordEmailResult')

/** Send failure is soft — the token stays valid and the copy-link path keeps working regardless. */
export function recordEmailResult(db: Database.Database, table: 'invites' | 'reset_tokens', id: string, result: MailResult) {
  const { changes } = 'sentAt' in result
    ? db.prepare(`UPDATE ${table} SET email_sent_at = ?, email_error = NULL WHERE id = ?`)
        .run(result.sentAt, id)
    : db.prepare(`UPDATE ${table} SET email_sent_at = NULL, email_error = ? WHERE id = ?`)
        .run(result.error, id)

  // The row can be gone by the time a fire-and-forget send resolves (revoked, or replaced by a newer token for the same user) — the outcome is dropped on the floor, so at least log it.
  if (changes === 0) {
    logger.warn(`${table} row ${id} no longer exists — email result (${'sentAt' in result
      ? 'sent'
      : `error: ${result.error}`}) was not recorded`)
  }
}
