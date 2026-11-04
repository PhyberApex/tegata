import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { GroupDeletionService } from './group-deletion.service'
import { GroupsService } from './groups.service'

class CreateGroupDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  description?: string
}

class UpdateGroupDto {
  @IsString()
  description!: string
}

class DeleteGroupDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean
}

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupsController {
  constructor(private groupsService: GroupsService, private groupDeletion: GroupDeletionService) {}

  @Get()
  list() {
    return this.groupsService.listGroups()
  }

  @Post()
  create(@Body() dto: CreateGroupDto) {
    return this.groupsService.createGroup(dto.name, dto.description)
  }

  @Patch(':name')
  update(@Param('name') name: string, @Body() dto: UpdateGroupDto) {
    return this.groupsService.updateGroup(name, dto.description)
  }

  @Delete(':name')
  remove(@Param('name') name: string, @Body() dto: DeleteGroupDto = {}) {
    this.groupDeletion.deleteGroup(name, dto.confirm ?? false)
    return { success: true }
  }
}
