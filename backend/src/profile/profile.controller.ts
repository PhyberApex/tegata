import type { OwnProfile } from '@tegata/shared'
import { Body, Controller, Get, NotFoundException, Patch, Post, Req, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { IsEmail, IsString, MinLength } from 'class-validator'
import { ProfileGuard, ProfileRequest } from '../auth/profile.guard'
import { IsOptionalNotNull, IsTrimmedNonEmpty } from '../common/name-validation'
import { UsersService } from '../users/users.service'

export class UpdateProfileDto {
  @IsOptionalNotNull()
  @IsTrimmedNonEmpty()
  displayname?: string

  @IsOptionalNotNull()
  @IsEmail()
  email?: string
}

class ChangePasswordDto {
  @IsString()
  currentPassword!: string

  @IsString()
  @MinLength(8)
  newPassword!: string
}

@Controller('profile')
@UseGuards(ProfileGuard)
export class ProfileController {
  constructor(private usersService: UsersService) {}

  /**
   * The caller's own record, narrowed to what the profile form shows — never `groups`, so self-service
   * reads no more than it can write. A database that turned Unreadable after the guard's read answers 503,
   * not a misleading 404.
   */
  @Get()
  get(@Req() req: ProfileRequest): OwnProfile {
    const lookup = this.usersService.lookupAccount(req.username)
    if (!lookup.readable)
      throw new ServiceUnavailableException('The users database cannot be read')
    if (!lookup.user)
      throw new NotFoundException('User not found')
    const { username, displayname, email } = lookup.user
    return { username, displayname, email }
  }

  @Patch()
  update(@Req() req: ProfileRequest, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateUser(req.username, dto)
  }

  @Post('password')
  @Throttle({
    default: { ttl: 60_000, limit: 5 },
  })
  async changePassword(@Req() req: ProfileRequest, @Body() dto: ChangePasswordDto) {
    const valid = await this.usersService.verifyPassword(req.username, dto.currentPassword)
    if (!valid)
      throw new UnauthorizedException('Current password is incorrect')

    await this.usersService.resetPassword(req.username, dto.newPassword)
    return { success: true }
  }
}
