import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AccessPreviewService } from './access-preview.service'

@Controller('access-preview')
export class AccessPreviewController {
  constructor(private readonly accessPreview: AccessPreviewService) {}

  @Get()
  @UseGuards(AuthGuard)
  get() {
    return this.accessPreview.getPreviews()
  }
}
