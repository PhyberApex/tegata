import type { Mock, Mocked } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../database/database.service'
import { GroupsService } from '../groups/groups.service'
import { BundlesService } from './bundles.service'

describe('bundlesService', () => {
  let service: BundlesService
  let mockRun: Mock
  let mockGet: Mock
  let mockAll: Mock
  let mockGroupsService: Mocked<Pick<GroupsService, 'ensureGroup'>>

  beforeEach(async () => {
    mockRun = vi.fn()
    mockGet = vi.fn()
    mockAll = vi.fn()

    const mockDbService = {
      instance: {
        prepare: vi.fn(() => ({
          run: mockRun,
          get: mockGet,
          all: mockAll,
        })),
      },
    }

    mockGroupsService = {
      ensureGroup: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BundlesService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: GroupsService, useValue: mockGroupsService },
      ],
    }).compile()

    service = module.get<BundlesService>(BundlesService)
  })

  describe('listBundles', () => {
    it('should return all bundles sorted by name, with groups parsed', () => {
      mockAll.mockReturnValue([
        { name: 'admin', description: 'Admin access', groups: '["admins","users"]' },
        { name: 'family', description: 'Family member', groups: '["users","media"]' },
      ])

      const result = service.listBundles()

      expect(result).toEqual([
        {
          name: 'admin',
          description: 'Admin access',
          groups: ['admins', 'users'],
        },
        {
          name: 'family',
          description: 'Family member',
          groups: ['users', 'media'],
        },
      ])
    })

    it('should return empty array when no bundles', () => {
      mockAll.mockReturnValue([])

      expect(service.listBundles()).toEqual([])
    })
  })

  describe('createBundle', () => {
    it('should insert and return the new bundle', () => {
      mockGet.mockReturnValueOnce(undefined)

      const result = service.createBundle('family', 'Family member', ['users', 'media'])

      expect(mockRun).toHaveBeenCalledWith('family', 'Family member', '["users","media"]')
      expect(result).toEqual({
        name: 'family',
        description: 'Family member',
        groups: ['users', 'media'],
      })
    })

    it('should default description to empty string and groups to an empty array', () => {
      mockGet.mockReturnValueOnce(undefined)

      const result = service.createBundle('empty')

      expect(mockRun).toHaveBeenCalledWith('empty', '', '[]')
      expect(result).toEqual({ name: 'empty', description: '', groups: [] })
    })

    it('should throw ConflictException when bundle already exists', () => {
      mockGet.mockReturnValueOnce({ name: 'family' })

      expect(() => service.createBundle('family')).toThrow(ConflictException)
    })

    it('should ensure each group in the bundle exists in the groups catalog', () => {
      mockGet.mockReturnValueOnce(undefined)

      service.createBundle('family', 'Family member', ['users', 'media'])

      expect(mockGroupsService.ensureGroup).toHaveBeenCalledTimes(2)
      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('users')
      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('media')
    })
  })

  describe('updateBundle', () => {
    it('should update description and groups, and return the bundle', () => {
      mockGet.mockReturnValueOnce({ name: 'family' })

      const result = service.updateBundle('family', 'Updated', ['users'])

      expect(mockRun).toHaveBeenCalledWith('Updated', '["users"]', 'family')
      expect(result).toEqual({
        name: 'family',
        description: 'Updated',
        groups: ['users'],
      })
    })

    it('should throw NotFoundException when bundle does not exist', () => {
      mockGet.mockReturnValueOnce(undefined)

      expect(() => service.updateBundle('missing', 'desc', [])).toThrow(NotFoundException)
    })

    it('should ensure each group in the updated bundle exists in the groups catalog', () => {
      mockGet.mockReturnValueOnce({ name: 'family' })

      service.updateBundle('family', 'Updated', ['users', 'media'])

      expect(mockGroupsService.ensureGroup).toHaveBeenCalledTimes(2)
      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('users')
      expect(mockGroupsService.ensureGroup).toHaveBeenCalledWith('media')
    })
  })

  describe('deleteBundle', () => {
    it('should delete the bundle', () => {
      mockGet.mockReturnValueOnce({ name: 'family' })

      service.deleteBundle('family')

      expect(mockRun).toHaveBeenCalledWith('family')
    })

    it('should throw NotFoundException when bundle does not exist', () => {
      mockGet.mockReturnValueOnce(undefined)

      expect(() => service.deleteBundle('missing')).toThrow(NotFoundException)
    })
  })
})
