import type { Mocked } from 'vitest'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGuard } from '../auth/auth.guard'
import { GroupDeletionService } from './group-deletion.service'
import { GroupsController } from './groups.controller'
import { GroupsService } from './groups.service'

describe('groupsController', () => {
  let controller: GroupsController
  let mockGroupsService: Mocked<Pick<GroupsService, 'listGroups' | 'createGroup' | 'updateGroup'>>
  let mockGroupDeletion: Mocked<Pick<GroupDeletionService, 'deleteGroup'>>

  beforeEach(async () => {
    mockGroupsService = {
      listGroups: vi.fn(),
      createGroup: vi.fn(),
      updateGroup: vi.fn(),
    }
    mockGroupDeletion = {
      deleteGroup: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [
        { provide: GroupsService, useValue: mockGroupsService },
        { provide: GroupDeletionService, useValue: mockGroupDeletion },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile()

    controller = module.get<GroupsController>(GroupsController)
  })

  // tegata's hostname has no forward-auth in front of it, so a handler left
  // out of the guard publishes every group name and description.
  it('guards every handler with AuthGuard at the class level', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, GroupsController)).toEqual([AuthGuard])
    for (const handler of ['list', 'create', 'update', 'remove'] as const)
      expect(Reflect.getMetadata(GUARDS_METADATA, GroupsController.prototype[handler])).toBeUndefined()
  })

  describe('list', () => {
    it('should return all groups', () => {
      const groups = [
        { name: 'admins', description: 'Administrators' },
        { name: 'users', description: 'Regular users' },
      ]
      mockGroupsService.listGroups.mockReturnValue(groups)

      expect(controller.list()).toEqual(groups)
    })
  })

  describe('create', () => {
    it('should call createGroup with name and description', () => {
      const group = { name: 'admins', description: 'Administrators' }
      mockGroupsService.createGroup.mockReturnValue(group)

      const result = controller.create({ name: 'admins', description: 'Administrators' })

      expect(mockGroupsService.createGroup).toHaveBeenCalledWith('admins', 'Administrators')
      expect(result).toEqual(group)
    })

    it('should pass undefined description when not provided', () => {
      mockGroupsService.createGroup.mockReturnValue({ name: 'admins', description: '' })

      controller.create({ name: 'admins' })

      expect(mockGroupsService.createGroup).toHaveBeenCalledWith('admins', undefined)
    })
  })

  describe('update', () => {
    it('should call updateGroup with name and description', () => {
      const updated = { name: 'admins', description: 'New description' }
      mockGroupsService.updateGroup.mockReturnValue(updated)

      const result = controller.update('admins', { description: 'New description' })

      expect(mockGroupsService.updateGroup).toHaveBeenCalledWith('admins', 'New description')
      expect(result).toEqual(updated)
    })
  })

  describe('remove', () => {
    it('should call deleteGroup and return success', () => {
      const result = controller.remove('admins')

      expect(mockGroupDeletion.deleteGroup).toHaveBeenCalledWith('admins', false)
      expect(result).toEqual({ success: true })
    })

    it('should pass confirm through', () => {
      controller.remove('admins', { confirm: true })

      expect(mockGroupDeletion.deleteGroup).toHaveBeenCalledWith('admins', true)
    })
  })
})
