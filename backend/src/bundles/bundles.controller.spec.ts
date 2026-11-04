import type { Mocked } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGuard } from '../auth/auth.guard'
import { BundlesController } from './bundles.controller'
import { BundlesService } from './bundles.service'

describe('bundlesController', () => {
  let controller: BundlesController
  let mockBundlesService: Mocked<Pick<BundlesService, 'listBundles' | 'createBundle' | 'updateBundle' | 'deleteBundle'>>

  beforeEach(async () => {
    mockBundlesService = {
      listBundles: vi.fn(),
      createBundle: vi.fn(),
      updateBundle: vi.fn(),
      deleteBundle: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BundlesController],
      providers: [
        { provide: BundlesService, useValue: mockBundlesService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile()

    controller = module.get<BundlesController>(BundlesController)
  })

  describe('list', () => {
    it('should return all bundles', () => {
      const bundles = [
        {
          name: 'family',
          description: 'Family member',
          groups: ['users', 'media'],
        },
      ]
      mockBundlesService.listBundles.mockReturnValue(bundles)

      expect(controller.list()).toEqual(bundles)
    })
  })

  describe('create', () => {
    it('should call createBundle with name, description and groups', () => {
      const bundle = {
        name: 'family',
        description: 'Family member',
        groups: ['users'],
      }
      mockBundlesService.createBundle.mockReturnValue(bundle)

      const result = controller.create({
        name: 'family',
        description: 'Family member',
        groups: ['users'],
      })

      expect(mockBundlesService.createBundle).toHaveBeenCalledWith('family', 'Family member', ['users'])
      expect(result).toEqual(bundle)
    })

    it('should pass undefined description and groups when not provided', () => {
      mockBundlesService.createBundle.mockReturnValue({ name: 'family', description: '', groups: [] })

      controller.create({ name: 'family' })

      expect(mockBundlesService.createBundle).toHaveBeenCalledWith('family', undefined, undefined)
    })
  })

  describe('update', () => {
    it('should call updateBundle with name, description and groups', () => {
      const updated = {
        name: 'family',
        description: 'New description',
        groups: ['users', 'media'],
      }
      mockBundlesService.updateBundle.mockReturnValue(updated)

      const result = controller.update('family', {
        description: 'New description',
        groups: ['users', 'media'],
      })

      expect(mockBundlesService.updateBundle).toHaveBeenCalledWith('family', 'New description', ['users', 'media'])
      expect(result).toEqual(updated)
    })
  })

  describe('remove', () => {
    it('should call deleteBundle and return success', () => {
      const result = controller.remove('family')

      expect(mockBundlesService.deleteBundle).toHaveBeenCalledWith('family')
      expect(result).toEqual({ success: true })
    })
  })
})
