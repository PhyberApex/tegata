import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { IsUsername } from '../config/username-pattern'
import { UsersService } from './users.service'

export class CreateUserDto {
  @IsString()
  @IsUsername()
  username!: string

  @IsString()
  displayname!: string

  @IsEmail()
  email!: string

  @IsString()
  @MinLength(8)
  password!: string

  @IsArray()
  @IsString({ each: true })
  groups!: string[]
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  displayname?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groups?: string[]

  @IsOptional()
  @IsBoolean()
  disabled?: boolean

  @IsOptional()
  @IsBoolean()
  confirm?: boolean
}

class DeleteUserDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean
}

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.listUsers()
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.createUser(
      dto.username,
      dto.displayname,
      dto.email,
      dto.password,
      dto.groups,
    )
  }

  @Get('database-integrity')
  getDatabaseIntegrity() {
    return this.usersService.getDatabaseIntegrityStatus()
  }

  @Post('database-integrity/accept-baseline')
  acceptDatabaseBaseline() {
    this.usersService.acceptDatabaseBaseline()
    return { success: true }
  }

  @Patch(':username')
  update(@Param('username') username: string, @Body() dto: UpdateUserDto) {
    const { confirm, ...updates } = dto
    return this.usersService.updateUser(username, updates, confirm ?? false)
  }

  @Delete(':username')
  remove(@Param('username') username: string, @Body() dto: DeleteUserDto = {}) {
    this.usersService.deleteUser(username, dto.confirm ?? false)
    return { success: true }
  }
}
