import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGuard } from '../auth/auth.guard'
import { AccessPreviewController } from './access-preview.controller'
import { AccessPreviewService } from './access-preview.service'

const mockAccessPreviewService = {
  getPreviews: vi.fn().mockReturnValue({
    available: true,
    previews: [
      {
        group: 'media',
        domains: [],
        oidcClients: [],
        notes: [],
      },
    ],
  }),
}

describe('accessPreviewController', () => {
  let controller: AccessPreviewController

  beforeEach(async () => {
    vi.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccessPreviewController],
      providers: [
        { provide: AccessPreviewService, useValue: mockAccessPreviewService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile()

    controller = module.get(AccessPreviewController)
  })

  it('should return previews from the service', () => {
    const result = controller.get()

    expect(result).toEqual({
      available: true,
      previews: [
        {
          group: 'media',
          domains: [],
          oidcClients: [],
          notes: [],
        },
      ],
    })
    expect(mockAccessPreviewService.getPreviews).toHaveBeenCalled()
  })
})
