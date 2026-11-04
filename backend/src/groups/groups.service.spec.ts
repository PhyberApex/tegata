import type { Mock } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../database/database.service'
import { GroupsService } from './groups.service'

describe('groupsService', () => {
  let service: GroupsService
  let mockRun: Mock
  let mockGet: Mock
  let mockAll: Mock

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compile()

    service = module.get<GroupsService>(GroupsService)
  })

  describe('listGroups', () => {
    it('should return all groups sorted by name', () => {
      const rows = [
        { name: 'admins', description: 'Administrators' },
        { name: 'users', description: 'Regular users' },
      ]
      mockAll.mockReturnValue(rows)

      const result = service.listGroups()

      expect(result).toEqual(rows)
    })

    it('should return empty array when no groups', () => {
      mockAll.mockReturnValue([])

      expect(service.listGroups()).toEqual([])
    })
  })

  describe('getGroupNames', () => {
    it('should return sorted group names as strings', () => {
      mockAll.mockReturnValue([
        { name: 'admins', description: '' },
        { name: 'users', description: '' },
      ])

      expect(service.getGroupNames()).toEqual(['admins', 'users'])
    })

    it('should return empty array when no groups', () => {
      mockAll.mockReturnValue([])

      expect(service.getGroupNames()).toEqual([])
    })
  })

  describe('ensureGroup', () => {
    it('should run INSERT OR IGNORE for the group name', () => {
      service.ensureGroup('users')

      expect(mockRun).toHaveBeenCalledWith('users')
    })

    it('should not throw when group already exists', () => {
      mockRun.mockImplementation(() => {})

      expect(() => service.ensureGroup('users')).not.toThrow()
    })
  })

  describe('createGroup', () => {
    it('should insert and return the new group', () => {
      mockGet.mockReturnValueOnce(undefined)

      const result = service.createGroup('admins', 'Administrators')

      expect(mockRun).toHaveBeenCalledWith('admins', 'Administrators')
      expect(result).toEqual({ name: 'admins', description: 'Administrators' })
    })

    it('should default description to empty string', () => {
      mockGet.mockReturnValueOnce(undefined)

      const result = service.createGroup('admins')

      expect(mockRun).toHaveBeenCalledWith('admins', '')
      expect(result).toEqual({ name: 'admins', description: '' })
    })

    it('should throw ConflictException when group already exists', () => {
      mockGet.mockReturnValueOnce({ name: 'admins', description: '' })

      expect(() => service.createGroup('admins')).toThrow(ConflictException)
    })
  })

  describe('updateGroup', () => {
    it('should update and return the group', () => {
      mockGet.mockReturnValueOnce({ name: 'admins', description: 'old' })

      const result = service.updateGroup('admins', 'New description')

      expect(mockRun).toHaveBeenCalledWith('New description', 'admins')
      expect(result).toEqual({ name: 'admins', description: 'New description' })
    })

    it('should throw NotFoundException when group does not exist', () => {
      mockGet.mockReturnValueOnce(undefined)

      expect(() => service.updateGroup('missing', 'desc')).toThrow(NotFoundException)
    })
  })
})
