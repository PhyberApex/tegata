import type { TestingModule } from '@nestjs/testing'
import { NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
})
