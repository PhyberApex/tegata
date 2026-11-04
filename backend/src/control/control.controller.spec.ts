import type { TestingModule } from '@nestjs/testing'
import type { AppLogLevel } from '../common'
import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGuard } from '../auth/auth.guard'
import * as dynamicLogger from '../common'
import { ControlController } from './control.controller'

// Stateful, unlike a plain vi.fn().mockReturnValue: setLevel/getLevel need to
// agree with each other so the GET-reflects-last-POST test means something.
const loggerMock = vi.hoisted(() => {
  function createLoggerMock(initial: AppLogLevel = 'log') {
    let level = initial
    return {
      setLevel: vi.fn((next: AppLogLevel) => { level = next }),
      getLevel: vi.fn(() => level),
    }
  }
  return {
    current: createLoggerMock(),
    createLoggerMock,
  }
})

vi.mock('../common', async importOriginal => ({
  ...await importOriginal<typeof import('../common')>(),
  getDynamicLoggerInstance: vi.fn(() => loggerMock.current),
}))

describe('controlController', () => {
  let controller: ControlController

  beforeEach(async () => {
    vi.clearAllMocks()
    loggerMock.current = loggerMock.createLoggerMock()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ControlController],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile()

    controller = module.get<ControlController>(ControlController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('setLogLevel', () => {
    it('should set log level and return success', () => {
      const result = controller.setLogLevel({ level: 'debug' })
      expect(result).toEqual({ success: true, level: 'debug' })
      expect(
        (dynamicLogger.getDynamicLoggerInstance() as any).setLevel,
      ).toHaveBeenCalledWith('debug')
    })

    it('should set verbose level', () => {
      const result = controller.setLogLevel({ level: 'verbose' })
      expect(result).toEqual({ success: true, level: 'verbose' })
      expect(
        (dynamicLogger.getDynamicLoggerInstance() as any).setLevel,
      ).toHaveBeenCalledWith('verbose')
    })

    it('should set warn level', () => {
      const result = controller.setLogLevel({ level: 'warn' })
      expect(result).toEqual({ success: true, level: 'warn' })
    })
  })

  describe('getLogLevel', () => {
    it('should return the default level before any change', () => {
      expect(controller.getLogLevel()).toEqual({ level: 'log' })
    })

    it('should return the level set by the most recent POST', () => {
      controller.setLogLevel({ level: 'debug' })
      expect(controller.getLogLevel()).toEqual({ level: 'debug' })

      controller.setLogLevel({ level: 'verbose' })
      expect(controller.getLogLevel()).toEqual({ level: 'verbose' })
    })
  })
})
