import type { Mock } from 'vitest'
import { readFileSync } from 'node:fs'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GroupsService } from '../groups/groups.service'
import { AccessPreviewService } from './access-preview.service'

const databaseMock = vi.hoisted(() => {
  const mockDb = {
    pragma: vi.fn(),
    exec: vi.fn(),
    close: vi.fn(),
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    })),
  }
  const ctor = vi.fn((..._args: unknown[]) => mockDb)
  return { mockDb, ctor }
})

vi.mock('better-sqlite3', () => ({
  default: class {
    constructor(...args: unknown[]) {
      return databaseMock.ctor(...args)
    }
  },
}))
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}))

const readFileSyncMock = readFileSync as unknown as Mock

const CONFIG_YAML = `
access_control:
  default_policy: deny
  rules:
    - domain: "{group}.example.com"
      policy: two_factor
    - domain: "*.example.com"
      subject: "group:admins"
      policy: two_factor
`

const CONFIG_YAML_WITH_OIDC = `
identity_providers:
  oidc:
    authorization_policies:
      tegata:
        default_policy: two_factor
        rules:
          - policy: two_factor
            subject: "group:admins"
          - policy: two_factor
            subject: "group:tegata"
    clients:
      - client_id: tegata-id
        client_name: Tegata
        authorization_policy: tegata
`

describe('accessPreviewService', () => {
  let service: AccessPreviewService

  const mockGroupsService = {
    getGroupNames: vi.fn().mockReturnValue(['admins', 'media']),
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    mockGroupsService.getGroupNames.mockReturnValue(['admins', 'media'])

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessPreviewService,
        { provide: GroupsService, useValue: mockGroupsService },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((_key: string, def: string) => def),
          },
        },
      ],
    }).compile()

    service = module.get(AccessPreviewService)
  })

  it('should build previews for all known groups from the parsed config', () => {
    readFileSyncMock.mockReturnValue(CONFIG_YAML)

    const result = service.getPreviews()

    if (!result.available)
      throw new Error('Expected previews to be available')
    expect(result.previews.map(p => p.group)).toEqual(['admins', 'media'])
    expect(result.previews[1].domains).toEqual([
      { domain: 'media.example.com', policy: 'two_factor', source: 'group-placeholder' },
    ])
    expect(result.configNotes).toEqual([])
    expect(result.guardedGroups).toEqual(['tegata'])
    expect(readFileSyncMock).toHaveBeenCalledWith('/authelia-config/configuration.yml', 'utf-8')
  })

  it('should report unavailable when the config file cannot be read', () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT: no such file')
    })

    const result = service.getPreviews()

    expect(result.available).toBe(false)
    if (result.available)
      throw new Error('Expected previews to be unavailable')
    expect(result.reason).toContain('ENOENT')
    expect(result.guardedGroups).toEqual(['tegata'])
  })

  it('should report unavailable when the config file is not valid YAML', () => {
    readFileSyncMock.mockReturnValue('access_control: [unclosed')

    const result = service.getPreviews()

    expect(result.available).toBe(false)
    expect(result).not.toHaveProperty('configNotes')
  })

  it('should flag an unacknowledged open OIDC policy as a config note', () => {
    readFileSyncMock.mockReturnValue(CONFIG_YAML_WITH_OIDC)

    const result = service.getPreviews()

    if (!result.available)
      throw new Error('Expected previews to be available')
    expect(result.configNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'open-policy', policyName: 'tegata' }),
      ]),
    )
  })

  it('should parse ACCESS_PREVIEW_OPEN_POLICIES tolerating whitespace and empty entries', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessPreviewService,
        { provide: GroupsService, useValue: mockGroupsService },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string, def: string) =>
              key === 'ACCESS_PREVIEW_OPEN_POLICIES'
                ? ' tegata , ,grimmory '
                : def),
          },
        },
      ],
    }).compile()

    readFileSyncMock.mockReturnValue(CONFIG_YAML_WITH_OIDC)
    const acknowledgedService = module.get(AccessPreviewService)

    const result = acknowledgedService.getPreviews()

    if (!result.available)
      throw new Error('Expected previews to be available')
    expect(result.configNotes.some(note => note.kind === 'open-policy' && note.policyName === 'tegata')).toBe(false)
  })

  it('should merge GUARDED_GROUPS into guardedGroups alongside OIDC_REQUIRED_GROUP', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessPreviewService,
        { provide: GroupsService, useValue: mockGroupsService },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string, def: string) => {
              if (key === 'GUARDED_GROUPS')
                return 'admins'
              if (key === 'OIDC_REQUIRED_GROUP')
                return 'tegata'
              return def
            }),
          },
        },
      ],
    }).compile()

    readFileSyncMock.mockReturnValue(CONFIG_YAML)
    const result = module.get(AccessPreviewService).getPreviews()

    if (!result.available)
      throw new Error('Expected previews to be available')
    expect(result.guardedGroups.sort()).toEqual(['admins', 'tegata'])
  })
})
