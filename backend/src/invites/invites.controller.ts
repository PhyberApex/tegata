import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { IsBoolean, IsEmail, IsInt, IsString, Max, Min, MinLength } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { IsGroupList, IsOptionalNotNull, IsTrimmedNonEmpty } from '../common/name-validation'
import { IsUsername } from '../config/username-pattern'
import { InvitesService, isPendingInvite } from './invites.service'

export class CreateInviteDto {
  @IsGroupList()
  groups!: string[]

  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number

  @IsOptionalNotNull()
  @IsEmail()
  email?: string

  @IsOptionalNotNull()
  @IsTrimmedNonEmpty()
  displayname?: string

  @IsOptionalNotNull()
  @IsString()
  bundleName?: string

  @IsOptionalNotNull()
  @IsBoolean()
  sendEmail?: boolean
}

export class RedeemInviteDto {
  @IsString()
  @IsUsername()
  username!: string

  @IsTrimmedNonEmpty()
  displayname!: string

  @IsEmail()
  email!: string

  @IsString()
  @MinLength(8)
  password!: string
}

@Controller('invites')
export class InvitesController {
  constructor(private invitesService: InvitesService) {}

  @Get()
  @UseGuards(AuthGuard)
  list() {
    return this.invitesService.listInvites()
  }

  @Post()
  @UseGuards(AuthGuard)
  create(@Body() dto: CreateInviteDto) {
    return this.invitesService.createInvite(dto.groups, dto.expiresInDays, {
      email: dto.email,
      displayname: dto.displayname,
    }, dto.bundleName, dto.sendEmail)
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  revoke(@Param('id') id: string) {
    this.invitesService.revokeInvite(id)
    return { success: true }
  }

  @Post(':id/send')
  @UseGuards(AuthGuard)
  send(@Param('id') id: string) {
    return this.invitesService.sendInviteEmail(id)
  }

  @Get(':token/validate')
  validate(@Param('token') token: string) {
    const invite = this.invitesService.getByToken(token)

    if (!invite || !isPendingInvite(invite))
      return { valid: false }

    return {
      valid: true,
      groups: invite.groups,
      ...invite.email
        ? { email: invite.email }
        : {},
      ...invite.displayname
        ? { displayname: invite.displayname }
        : {},
    }
  }

  @Post(':token/redeem')
  redeem(@Param('token') token: string, @Body() dto: RedeemInviteDto) {
    return this.invitesService.redeemInvite(
      token,
      dto.username,
      dto.displayname,
      dto.email,
      dto.password,
    )
  }
}
