import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { IsString } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { IsGroupList, IsOptionalNotNull, IsTrimmedNonEmpty, TrimPipe } from '../common/name-validation'
import { BundlesService } from './bundles.service'

export class CreateBundleDto {
  @IsTrimmedNonEmpty()
  name!: string

  @IsOptionalNotNull()
  @IsString()
  description?: string

  @IsOptionalNotNull()
  @IsGroupList()
  groups?: string[]
}

export class UpdateBundleDto {
  @IsString()
  description!: string

  @IsGroupList()
  groups!: string[]
}

@Controller('bundles')
export class BundlesController {
  constructor(private bundlesService: BundlesService) {}

  @Get()
  @UseGuards(AuthGuard)
  list() {
    return this.bundlesService.listBundles()
  }

  @Post()
  @UseGuards(AuthGuard)
  create(@Body() dto: CreateBundleDto) {
    return this.bundlesService.createBundle(dto.name, dto.description, dto.groups)
  }

  @Patch(':name')
  @UseGuards(AuthGuard)
  update(@Param('name', TrimPipe) name: string, @Body() dto: UpdateBundleDto) {
    return this.bundlesService.updateBundle(name, dto.description, dto.groups)
  }

  @Delete(':name')
  @UseGuards(AuthGuard)
  remove(@Param('name', TrimPipe) name: string) {
    this.bundlesService.deleteBundle(name)
    return { success: true }
  }
}
