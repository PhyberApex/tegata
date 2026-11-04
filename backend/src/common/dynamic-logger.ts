import type { LogLevel } from '@nestjs/common'
import { ConsoleLogger } from '@nestjs/common'

export type AppLogLevel = 'warn' | 'log' | 'debug' | 'verbose'

const LEVEL_MAP: Record<AppLogLevel, LogLevel[]> = {
  warn: ['error', 'warn'],
  log: ['error', 'warn', 'log'],
  debug: ['error', 'warn', 'log', 'debug'],
  verbose: [
    'error',
    'warn',
    'log',
    'debug',
    'verbose',
  ],
}

export class DynamicLogger extends ConsoleLogger {
  private appLevel: AppLogLevel

  constructor(level: AppLogLevel = 'log') {
    super()
    this.appLevel = level
    this.setLogLevels(LEVEL_MAP[level])
  }

  setLevel(level: AppLogLevel): void {
    this.appLevel = level
    this.setLogLevels(LEVEL_MAP[level])
  }

  getLevel(): AppLogLevel {
    return this.appLevel
  }
}

let instance: DynamicLogger | null = null

export function setDynamicLoggerInstance(logger: DynamicLogger): void {
  instance = logger
}

export function getDynamicLoggerInstance(): DynamicLogger {
  if (!instance)
    throw new Error('DynamicLogger not initialized')
  return instance
}
