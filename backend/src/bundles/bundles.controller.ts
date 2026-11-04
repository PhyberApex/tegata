import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { BundlesService } from './bundles.service'

class CreateBundleDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groups?: string[]
}

class UpdateBundleDto {
  @IsString()
  description!: string

  @IsArray()
  @IsString({ each: true })
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
  update(@Param('name') name: string, @Body() dto: UpdateBundleDto) {
    return this.bundlesService.updateBundle(name, dto.description, dto.groups)
  }

  @Delete(':name')
  @UseGuards(AuthGuard)
  remove(@Param('name') name: string) {
    this.bundlesService.deleteBundle(name)
    return { success: true }
  }
}
