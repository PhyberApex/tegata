import type { Mocked } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGuard } from '../auth/auth.guard'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

describe('usersController', () => {
  let controller: UsersController
  let mockUsersService: Mocked<Pick<UsersService, 'listUsers' | 'createUser' | 'updateUser' | 'deleteUser' | 'getDatabaseIntegrityStatus' | 'acceptDatabaseBaseline'>>

  beforeEach(async () => {
    mockUsersService = {
      listUsers: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn(),
      getDatabaseIntegrityStatus: vi.fn(),
      acceptDatabaseBaseline: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile()

    controller = module.get<UsersController>(UsersController)
  })

  describe('list', () => {
    it('should return all users', () => {
      const users = [
        {
          username: 'alice',
          displayname: 'Alice',
          email: 'a@b.com',
          groups: ['users'],
          disabled: false,
        },
      ]
      mockUsersService.listUsers.mockReturnValue(users)

      expect(controller.list()).toEqual(users)
    })
  })

  describe('create', () => {
    it('should call createUser with dto fields', async () => {
      const dto = {
        username: 'new',
        displayname: 'New User',
        email: 'new@test.com',
        password: 'password123',
        groups: ['users'],
      }
      const expected = {
        username: 'new',
        displayname: 'New User',
        email: 'new@test.com',
        groups: ['users'],
      }
      mockUsersService.createUser.mockResolvedValue(expected)

      const result = await controller.create(dto)

      expect(mockUsersService.createUser).toHaveBeenCalledWith('new', 'New User', 'new@test.com', 'password123', ['users'])
      expect(result).toEqual(expected)
    })
  })

  describe('update', () => {
    it('should call updateUser with username and dto', () => {
      const updates = { displayname: 'Updated' }
      const expected = {
        username: 'alice',
        displayname: 'Updated',
        email: 'a@b.com',
        groups: [],
        disabled: false,
      }
      mockUsersService.updateUser.mockReturnValue(expected)

      const result = controller.update('alice', updates)

      expect(mockUsersService.updateUser).toHaveBeenCalledWith('alice', updates, false)
      expect(result).toEqual(expected)
    })

    it('should pass the disabled flag through to updateUser', () => {
      const updates = { disabled: true }
      const expected = {
        username: 'alice',
        displayname: 'Alice',
        email: 'a@b.com',
        groups: [],
        disabled: true,
      }
      mockUsersService.updateUser.mockReturnValue(expected)

      const result = controller.update('alice', updates)

      expect(mockUsersService.updateUser).toHaveBeenCalledWith('alice', updates, false)
      expect(result).toEqual(expected)
    })

    it('should strip confirm from the updates passed to updateUser and forward it separately', () => {
      const dto = { disabled: true, confirm: true }
      const expected = {
        username: 'alice',
        displayname: 'Alice',
        email: 'a@b.com',
        groups: [],
        disabled: true,
      }
      mockUsersService.updateUser.mockReturnValue(expected)

      controller.update('alice', dto)

      expect(mockUsersService.updateUser).toHaveBeenCalledWith('alice', { disabled: true }, true)
    })
  })

  describe('resetPassword endpoint', () => {
    it('should no longer exist on the controller', () => {
      expect((controller as any).resetPassword).toBeUndefined()
    })
  })

  describe('getDatabaseIntegrity', () => {
    it('should return the integrity status', () => {
      mockUsersService.getDatabaseIntegrityStatus.mockReturnValue({ matches: false, unreadable: false, unreadableReason: null })

      expect(controller.getDatabaseIntegrity()).toEqual({ matches: false, unreadable: false, unreadableReason: null })
    })

    it('should pass through the unreadable reason', () => {
      mockUsersService.getDatabaseIntegrityStatus.mockReturnValue({
        matches: false,
        unreadable: true,
        unreadableReason: 'The users database file could not be parsed: bad indentation',
      })

      expect(controller.getDatabaseIntegrity()).toEqual({
        matches: false,
        unreadable: true,
        unreadableReason: 'The users database file could not be parsed: bad indentation',
      })
    })
  })

  describe('acceptDatabaseBaseline', () => {
    it('should call acceptDatabaseBaseline and return success', () => {
      const result = controller.acceptDatabaseBaseline()

      expect(mockUsersService.acceptDatabaseBaseline).toHaveBeenCalled()
      expect(result).toEqual({ success: true })
    })
  })

  describe('remove', () => {
    it('should call deleteUser and return success', () => {
      const result = controller.remove('alice', {})

      expect(mockUsersService.deleteUser).toHaveBeenCalledWith('alice', false)
      expect(result).toEqual({ success: true })
    })

    it('should forward confirm: true through to deleteUser', () => {
      controller.remove('alice', { confirm: true })

      expect(mockUsersService.deleteUser).toHaveBeenCalledWith('alice', true)
    })

    it('should default confirm to false when no body is sent', () => {
      controller.remove('alice', undefined as any)

      expect(mockUsersService.deleteUser).toHaveBeenCalledWith('alice', false)
    })
  })
})
