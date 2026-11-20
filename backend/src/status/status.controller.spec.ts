import type { TestingModule } from '@nestjs/testing'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NotFoundException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InvitesService } from '../invites/invites.service'
import { UsersService } from '../users/users.service'
import { StatusController } from './status.controller'
import { StatusService } from './status.service'

const mockStatusService = {
  getStatus: vi.fn().mockResolvedValue({
    totalUsers: 4,
    pendingInvites: 1,
    authelia: { ageHours: 2, ok: true },
  }),
}

describe('statusController', () => {
  let controller: StatusController

  beforeEach(async () => {
    vi.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatusController],
      providers: [
        { provide: StatusService, useValue: mockStatusService },
      ],
    }).compile()

    controller = module.get<StatusController>(StatusController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  afterEach(() => {
    delete process.env.STATUS_ENDPOINT_TOKEN
  })

  describe('get', () => {
    it('is a 404 when STATUS_ENDPOINT_TOKEN is unset', () => {
      expect(() => controller.get('Bearer anything')).toThrow(NotFoundException)
      expect(mockStatusService.getStatus).not.toHaveBeenCalled()
    })

    it('is a 401 for a wrong or missing token', () => {
      process.env.STATUS_ENDPOINT_TOKEN = 's3cret'

      expect(() => controller.get('Bearer nope')).toThrow(UnauthorizedException)
      expect(() => controller.get(undefined, 'nope')).toThrow(UnauthorizedException)
      expect(() => controller.get()).toThrow(UnauthorizedException)
      expect(mockStatusService.getStatus).not.toHaveBeenCalled()
    })

    it('returns the status for the correct bearer token', async () => {
      process.env.STATUS_ENDPOINT_TOKEN = 's3cret'

      const result = await controller.get('Bearer s3cret')

      expect(result).toEqual({
        totalUsers: 4,
        pendingInvites: 1,
        authelia: { ageHours: 2, ok: true },
      })
      expect(mockStatusService.getStatus).toHaveBeenCalled()
    })

    it('returns the status for the correct ?token=', async () => {
      process.env.STATUS_ENDPOINT_TOKEN = 's3cret'

      await expect(controller.get(undefined, 's3cret')).resolves.toHaveProperty('totalUsers', 4)
    })
  })

  describe('serialized body', () => {
    it('sends ageHours as null when the Authelia Users Database cannot be read', async () => {
      process.env.STATUS_ENDPOINT_TOKEN = 's3cret'
      const missingUsersDatabase = join(tmpdir(), `tegata-missing-${randomUUID()}`, 'users_database.yml')
      const module: TestingModule = await Test.createTestingModule({
        controllers: [StatusController],
        providers: [
          StatusService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string, def: unknown) => key === 'AUTHELIA_USERS_FILE'
                ? missingUsersDatabase
                : def,
            },
          },
          {
            provide: UsersService,
            useValue: {
              listUsers: () => [],
            },
          },
          {
            provide: InvitesService,
            useValue: {
              listInvites: () => [],
            },
          },
        ],
      }).compile()
      const realController = module.get<StatusController>(StatusController)

      const result = await realController.get('Bearer s3cret')

      // Infinity would also serialize to null, so the in-process value is checked too.
      expect(result.authelia.ageHours).toBeNull()
      expect(JSON.parse(JSON.stringify(result))).toEqual({
        totalUsers: 0,
        pendingInvites: 0,
        authelia: { ageHours: null, ok: false },
      })
    })
  })
})
