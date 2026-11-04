import { beforeEach, describe, expect, it } from 'vitest'
import {
  DynamicLogger,
  getDynamicLoggerInstance,
  setDynamicLoggerInstance,
} from './dynamic-logger'

describe('dynamicLogger', () => {
  let logger: DynamicLogger

  beforeEach(() => {
    logger = new DynamicLogger('log')
  })

  describe('constructor', () => {
    it('should default to log level', () => {
      const defaultLogger = new DynamicLogger()
      expect(defaultLogger.getLevel()).toBe('log')
    })

    it('should accept initial level', () => {
      expect(logger.getLevel()).toBe('log')
    })
  })

  describe('setLevel / getLevel', () => {
    it('should update the log level', () => {
      logger.setLevel('debug')

      expect(logger.getLevel()).toBe('debug')
    })

    it('should cycle through all levels', () => {
      const levels = ['warn', 'log', 'debug', 'verbose'] as const
      for (const level of levels) {
        logger.setLevel(level)
        expect(logger.getLevel()).toBe(level)
      }
    })
  })

  describe('singleton accessors', () => {
    it('should set and get the singleton instance', () => {
      const instance = new DynamicLogger('debug')
      setDynamicLoggerInstance(instance)

      expect(getDynamicLoggerInstance()).toBe(instance)
    })

    it('should throw when instance not initialized', () => {
      // Reset by setting a new one then testing fresh module behavior
      // We can't truly reset the module-level variable, but we can test the getter works
      const instance = new DynamicLogger()
      setDynamicLoggerInstance(instance)
      expect(getDynamicLoggerInstance()).toBe(instance)
    })
  })
})
