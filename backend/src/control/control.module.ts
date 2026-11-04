import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ControlController } from './control.controller'

@Module({
  imports: [AuthModule],
  controllers: [ControlController],
})
export class ControlModule {}
