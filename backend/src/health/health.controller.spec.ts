import type { TestingModule } from '@nestjs/testing'
import type { Mocked } from 'vitest'
import { readFileSync } from 'node:fs'
import { HttpException, HttpStatus } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../database/database.service'
import { HealthController } from './health.controller'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn(),
  }
})

const mockReadFileSync = vi.mocked(readFileSync)

describe('healthController', () => {
  let controller: HealthController
  let dbService: Mocked<DatabaseService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DatabaseService,
          useValue: {
            instance: { open: true },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('/authelia-config/users_database.yml'),
          },
        },
      ],
    }).compile()

    controller = module.get(HealthController)
    dbService = module.get(DatabaseService) as Mocked<DatabaseService>

    mockReadFileSync.mockImplementation(() => {
      const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    })
  })

  it('reports ok when the database is open and the users file is missing', () => {
    expect(controller.check()).toEqual({ status: 'ok', database: true, usersDatabase: true })
  })

  it('reports ok when the users file exists and parses', () => {
    mockReadFileSync.mockReturnValue('users:\n  alice:\n    displayname: Alice\n')

    expect(controller.check()).toEqual({ status: 'ok', database: true, usersDatabase: true })
  })

  it('reports ok when the users file exists and is empty', () => {
    mockReadFileSync.mockReturnValue('')

    expect(controller.check()).toEqual({ status: 'ok', database: true, usersDatabase: true })
  })

  it('fails with 503 when the SQLite handle is closed', () => {
    Object.defineProperty(dbService, 'instance', {
      value: { open: false },
    })

    try {
      controller.check()
      throw new Error('expected check() to throw')
    }
    catch (error) {
      expect(error).toBeInstanceOf(HttpException)
      const httpError = error as HttpException
      expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)
      const response = httpError.getResponse() as Record<string, unknown>
      expect(response.status).toBe('unhealthy')
      expect(response.database).toBe(false)
      expect(response.usersDatabase).toBe(true)
      expect(response.reasons).toEqual(expect.arrayContaining([
        expect.stringMatching(/database/i),
      ]))
    }
  })

  it('fails with 503 when the users file exists but cannot be read', () => {
    mockReadFileSync.mockImplementation(() => {
      const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException
      err.code = 'EACCES'
      throw err
    })

    try {
      controller.check()
      throw new Error('expected check() to throw')
    }
    catch (error) {
      expect(error).toBeInstanceOf(HttpException)
      const httpError = error as HttpException
      expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)
      const response = httpError.getResponse() as Record<string, unknown>
      expect(response.status).toBe('unhealthy')
      expect(response.database).toBe(true)
      expect(response.usersDatabase).toBe(false)
      expect(response.reasons).toEqual(expect.arrayContaining([
        expect.stringMatching(/read/i),
      ]))
    }
  })

  it('fails with 503 when the users file exists but fails to YAML-parse', () => {
    mockReadFileSync.mockReturnValue('users: [this is not: valid: yaml')

    try {
      controller.check()
      throw new Error('expected check() to throw')
    }
    catch (error) {
      expect(error).toBeInstanceOf(HttpException)
      const httpError = error as HttpException
      expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)
      const response = httpError.getResponse() as Record<string, unknown>
      expect(response.status).toBe('unhealthy')
      expect(response.database).toBe(true)
      expect(response.usersDatabase).toBe(false)
      expect(response.reasons).toEqual(expect.arrayContaining([
        expect.stringMatching(/yaml|pars/i),
      ]))
    }
  })

  it('reports both subsystems as unhealthy with distinct reasons when both fail', () => {
    Object.defineProperty(dbService, 'instance', {
      value: { open: false },
    })
    mockReadFileSync.mockReturnValue('users: [this is not: valid: yaml')

    try {
      controller.check()
      throw new Error('expected check() to throw')
    }
    catch (error) {
      expect(error).toBeInstanceOf(HttpException)
      const httpError = error as HttpException
      expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)
      const response = httpError.getResponse() as Record<string, unknown>
      expect(response.status).toBe('unhealthy')
      expect(response.database).toBe(false)
      expect(response.usersDatabase).toBe(false)
      expect(response.reasons).toHaveLength(2)
    }
  })
})
