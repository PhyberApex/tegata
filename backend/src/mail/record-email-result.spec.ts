import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { recordEmailResult } from './record-email-result'

describe('recordEmailResult', () => {
  it('should set email_sent_at and clear email_error on success', () => {
    const mockRun = vi.fn(() => ({ changes: 1 }))
    const mockDb = {
      prepare: vi.fn(() => ({ run: mockRun })),
    } as any

    recordEmailResult(mockDb, 'invites', 'id-1', { sentAt: '2024-01-01T00:00:00.000Z' })

    expect(mockDb.prepare).toHaveBeenCalledWith('UPDATE invites SET email_sent_at = ?, email_error = NULL WHERE id = ?')
    expect(mockRun).toHaveBeenCalledWith('2024-01-01T00:00:00.000Z', 'id-1')
  })

  it('should set email_error and clear email_sent_at on failure', () => {
    const mockRun = vi.fn(() => ({ changes: 1 }))
    const mockDb = {
      prepare: vi.fn(() => ({ run: mockRun })),
    } as any

    recordEmailResult(mockDb, 'reset_tokens', 'id-2', { error: 'connection refused' })

    expect(mockDb.prepare).toHaveBeenCalledWith('UPDATE reset_tokens SET email_sent_at = NULL, email_error = ? WHERE id = ?')
    expect(mockRun).toHaveBeenCalledWith('connection refused', 'id-2')
  })

  it('should log a warning when the row no longer exists', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    const mockRun = vi.fn(() => ({ changes: 0 }))
    const mockDb = {
      prepare: vi.fn(() => ({ run: mockRun })),
    } as any

    recordEmailResult(mockDb, 'reset_tokens', 'id-3', { sentAt: '2024-01-01T00:00:00.000Z' })

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('id-3'))
    warnSpy.mockRestore()
  })
})
