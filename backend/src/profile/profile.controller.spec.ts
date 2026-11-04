import type { Mocked } from 'vitest'
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileGuard, ProfileRequest } from '../auth/profile.guard'
import { UsersService } from '../users/users.service'
import { ProfileController } from './profile.controller'

describe('profileController', () => {
  let controller: ProfileController
  let mockUsersService: Mocked<Pick<UsersService, 'updateUser' | 'verifyPassword' | 'resetPassword'>>

  beforeEach(async () => {
    mockUsersService = {
      updateUser: vi.fn(),
      verifyPassword: vi.fn(),
      resetPassword: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
      ],
    })
      .overrideGuard(ProfileGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile()

    controller = module.get<ProfileController>(ProfileController)
  })

  function requestFor(username: string): ProfileRequest {
    return { username } as ProfileRequest
  }

  describe('update', () => {
    it('should call updateUser with the session username and only the DTO fields', () => {
      const updated = {
        username: 'alice',
        displayname: 'Alice A',
        email: 'alice@example.com',
        groups: ['users'],
        disabled: false,
      }
      mockUsersService.updateUser.mockReturnValue(updated)

      const result = controller.update(requestFor('alice'), { displayname: 'Alice A', email: 'alice@example.com' })

      expect(mockUsersService.updateUser).toHaveBeenCalledWith('alice', { displayname: 'Alice A', email: 'alice@example.com' })
      expect(result).toEqual(updated)
    })

    it('should ignore an attacker-supplied username and use the session one', () => {
      mockUsersService.updateUser.mockReturnValue({} as any)

      controller.update(requestFor('bob'), { displayname: 'Someone Else' })

      expect(mockUsersService.updateUser).toHaveBeenCalledWith('bob', { displayname: 'Someone Else' })
    })
  })

  describe('changePassword', () => {
    it('should call resetPassword after verifyPassword succeeds', async () => {
      mockUsersService.verifyPassword.mockResolvedValue(true)
      mockUsersService.resetPassword.mockResolvedValue(undefined)

      const result = await controller.changePassword(requestFor('alice'), { currentPassword: 'old-pass', newPassword: 'new-password' })

      expect(mockUsersService.verifyPassword).toHaveBeenCalledWith('alice', 'old-pass')
      expect(mockUsersService.resetPassword).toHaveBeenCalledWith('alice', 'new-password')
      expect(result).toEqual({ success: true })
    })

    it('should throw and never call resetPassword when verifyPassword fails', async () => {
      mockUsersService.verifyPassword.mockResolvedValue(false)

      await expect(
        controller.changePassword(requestFor('alice'), { currentPassword: 'wrong', newPassword: 'new-password' }),
      ).rejects.toThrow(UnauthorizedException)

      expect(mockUsersService.resetPassword).not.toHaveBeenCalled()
    })

    it('should propagate ServiceUnavailableException from verifyPassword instead of a misleading "incorrect password"', async () => {
      mockUsersService.verifyPassword.mockRejectedValue(
        new ServiceUnavailableException('The users database file could not be parsed: bad indentation'),
      )

      await expect(
        controller.changePassword(requestFor('alice'), { currentPassword: 'old-pass', newPassword: 'new-password' }),
      ).rejects.toThrow(ServiceUnavailableException)

      expect(mockUsersService.resetPassword).not.toHaveBeenCalled()
    })
  })
})
