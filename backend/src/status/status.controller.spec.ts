import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  describe('get', () => {
    it('should return status from the service', async () => {
      const result = await controller.get()

      expect(result).toEqual({
        totalUsers: 4,
        pendingInvites: 1,
        authelia: { ageHours: 2, ok: true },
      })
      expect(mockStatusService.getStatus).toHaveBeenCalled()
    })
  })
})
