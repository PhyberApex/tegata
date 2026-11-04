import { Body, Controller, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator'
import { ProfileGuard, ProfileRequest } from '../auth/profile.guard'
import { UsersService } from '../users/users.service'

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  displayname?: string

  @IsOptional()
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
