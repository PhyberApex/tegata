import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { ResetTokensService } from './reset-tokens.service'

class CreateResetTokenDto {
  @IsString()
  @MinLength(1)
  username!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean
}

class RedeemResetTokenDto {
  @IsString()
  @MinLength(8)
  password!: string
}

@Controller('reset-tokens')
export class ResetTokensController {
  constructor(private resetTokensService: ResetTokensService) {}

  @Get()
  @UseGuards(AuthGuard)
  list() {
    return this.resetTokensService.listResetTokens()
  }

  @Post()
  @UseGuards(AuthGuard)
  create(@Body() dto: CreateResetTokenDto) {
    return this.resetTokensService.createResetToken(dto.username, dto.expiresInDays, dto.sendEmail)
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  revoke(@Param('id') id: string) {
    this.resetTokensService.revokeResetToken(id)
    return { success: true }
  }

  @Post(':id/send')
  @UseGuards(AuthGuard)
  send(@Param('id') id: string) {
    return this.resetTokensService.sendResetTokenEmail(id)
  }

  @Get(':token/validate')
  validate(@Param('token') token: string) {
    const resetToken = this.resetTokensService.getByToken(token)

    if (!resetToken || resetToken.used_at || new Date(resetToken.expires_at) < new Date())
      return { valid: false }

    return { valid: true, username: resetToken.username }
  }

  @Post(':token/redeem')
  redeem(@Param('token') token: string, @Body() dto: RedeemResetTokenDto) {
    return this.resetTokensService.redeemResetToken(token, dto.password)
  }
}
