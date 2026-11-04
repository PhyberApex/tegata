import type { TestingModule } from '@nestjs/testing'
import type { Mock } from 'vitest'
import type { Invite } from '../invites/invites.service'
import { stat } from 'node:fs/promises'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InvitesService } from '../invites/invites.service'
import { UsersService } from '../users/users.service'
import { StatusService } from './status.service'

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}))

const statMock = stat as unknown as Mock

const mockUsers = {
  listUsers: vi.fn(),
}

const mockInvites = {
  listInvites: vi.fn(),
}

function makeInvite(overrides: Partial<Invite>): Invite {
  return {
    id: 'invite-1',
    token: 'token-1',
    groups: [],
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    email: null,
    displayname: null,
    used_by: null,
    used_at: null,
    created_at: new Date().toISOString(),
    bundle_name: null,
    email_sent_at: null,
    email_error: null,
    ...overrides,
  }
}

describe('statusService', () => {
  let service: StatusService

  beforeEach(async () => {
    vi.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusService,
        {
          provide: ConfigService,
          useValue: {
            get: (_key: string, def: string) => def,
          },
        },
        { provide: UsersService, useValue: mockUsers },
        { provide: InvitesService, useValue: mockInvites },
      ],
    }).compile()

    service = module.get<StatusService>(StatusService)

    mockUsers.listUsers.mockReturnValue([])
    mockInvites.listInvites.mockReturnValue([])
  })

  describe('getStatus', () => {
    it('should return the total user count', async () => {
      mockUsers.listUsers.mockReturnValue([
        {
          username: 'alice',
          displayname: 'Alice',
          email: 'a@x.com',
          groups: [],
        },
        {
          username: 'bob',
          displayname: 'Bob',
          email: 'b@x.com',
          groups: [],
        },
      ])
      statMock.mockResolvedValue({
        mtimeMs: Date.now(),
      })

      const result = await service.getStatus()

      expect(result.totalUsers).toBe(2)
    })

    it('should count pending invites (unredeemed, unexpired)', async () => {
      mockInvites.listInvites.mockReturnValue([
        makeInvite({
          id: 'a',
          used_by: null,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        }),
        makeInvite({
          id: 'b',
          used_by: null,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        }),
        makeInvite({
          id: 'c',
          used_by: 'someone',
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        }),
        makeInvite({
          id: 'd',
          used_by: null,
          expires_at: new Date(Date.now() - 86_400_000).toISOString(),
        }),
      ])
      statMock.mockResolvedValue({
        mtimeMs: Date.now(),
      })

      const result = await service.getStatus()

      expect(result.pendingInvites).toBe(2)
    })

    it('should return authelia write age in hours when the file is readable', async () => {
      const fourHoursAgo = Date.now() - 4 * 3_600_000
      statMock.mockResolvedValue({ mtimeMs: fourHoursAgo })

      const result = await service.getStatus()

      expect(result.authelia.ageHours).toBeCloseTo(4, 1)
      expect(result.authelia.ok).toBe(true)
    })

    it('should return an infinite, not-ok age when the file is missing or unreadable', async () => {
      statMock.mockRejectedValue(new Error('ENOENT'))

      const result = await service.getStatus()

      expect(result.authelia.ageHours).toBe(Infinity)
      expect(result.authelia.ok).toBe(false)
    })
  })
})
