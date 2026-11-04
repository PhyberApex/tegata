import { IsIn } from 'class-validator'

export class SetLogLevelDto {
  @IsIn(['warn', 'log', 'debug', 'verbose'])
  level!: string
}
