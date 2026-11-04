import type { AppLogLevel } from '../common'
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { getDynamicLoggerInstance } from '../common'
import { SetLogLevelDto } from './control.dto'

@Controller('control')
@UseGuards(AuthGuard)
export class ControlController {
  @Get('log-level')
  getLogLevel() {
    return {
      level: getDynamicLoggerInstance().getLevel(),
    }
  }

  @Post('log-level')
  setLogLevel(@Body() body: SetLogLevelDto) {
    getDynamicLoggerInstance().setLevel(body.level as AppLogLevel)
    return { success: true, level: body.level }
  }
}
