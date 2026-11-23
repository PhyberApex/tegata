import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common'
import { IsString, validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { BundlesController, CreateBundleDto, UpdateBundleDto } from '../bundles/bundles.controller'
import { CreateGroupDto, DeleteGroupDto, GroupsController } from '../groups/groups.controller'
import { CreateInviteDto, RedeemInviteDto } from '../invites/invites.controller'
import { UpdateProfileDto } from '../profile/profile.controller'
import { CreateResetTokenDto } from '../reset-tokens/reset-tokens.controller'
import { CreateUserDto, DeleteUserDto, UpdateUserDto } from '../users/users.controller'
import { IsOptionalNotNull } from './name-validation'

const pipe = new ValidationPipe({ whitelist: true, transform: true })
function run(metatype: new () => object, body: object) {
  return pipe.transform(body, { type: 'body', metatype } as ArgumentMetadata) as Promise<any>
}

const user = {
  username: 'bob',
  displayname: 'Bob',
  email: 'b@x.io',
  password: 'password1',
  groups: ['users'],
}
const redeem = {
  username: 'bob',
  displayname: 'Bob',
  email: 'b@x.io',
  password: 'password1',
}

describe('isOptionalNotNull', () => {
  class Probe {
    @IsOptionalNotNull()
    @IsString()
    value?: string | null
  }

  function probe(value?: string | null) {
    return validate(Object.assign(new Probe(), value === undefined
      ? {}
      : { value }))
  }

  it('rejects null', async () => {
    expect(await probe(null)).toHaveLength(1)
  })

  it('admits an omitted value and still validates a present one', async () => {
    expect(await probe()).toHaveLength(0)
    expect(await probe('x')).toHaveLength(0)
    expect(await probe(1 as unknown as string)).toHaveLength(1)
  })
})

describe('optional DTO fields refuse JSON null', () => {
  const dtos: { dto: new () => object, base: object, fields: string[] }[] = [
    {
      dto: UpdateUserDto,
      base: {},
      fields: [
        'displayname',
        'email',
        'groups',
        'disabled',
        'confirm',
      ],
    },
    {
      dto: DeleteUserDto,
      base: {},
      fields: ['confirm'],
    },
    {
      dto: UpdateProfileDto,
      base: {},
      fields: ['displayname', 'email'],
    },
    {
      dto: CreateGroupDto,
      base: { name: 'g' },
      fields: ['description'],
    },
    {
      dto: DeleteGroupDto,
      base: {},
      fields: ['confirm'],
    },
    {
      dto: CreateBundleDto,
      base: { name: 'b' },
      fields: ['description', 'groups'],
    },
    {
      dto: CreateInviteDto,
      base: { groups: [] },
      fields: [
        'expiresInDays',
        'email',
        'displayname',
        'bundleName',
        'sendEmail',
      ],
    },
    {
      dto: CreateResetTokenDto,
      base: { username: 'bob' },
      fields: ['expiresInDays', 'sendEmail'],
    },
  ]
  const cases = dtos.flatMap(({ dto, base, fields }) => fields.map(field => ({ name: dto.name, field, dto, base })))

  it.each(cases)('$name answers 400 for a null $field', async ({ field, dto, base }) => {
    await expect(run(dto, { ...base, [field]: null })).rejects.toBeInstanceOf(BadRequestException)
  })

  it.each(cases)('$name still accepts $field omitted', async ({ field, dto, base }) => {
    expect((await run(dto, base))[field]).toBeUndefined()
  })
})

describe('name-like DTO validation', () => {
  const blanks = ['', '   ', '\t\n']

  it.each(blanks)('rejects blank group/bundle names %j', async (name) => {
    await expect(run(CreateGroupDto, { name })).rejects.toBeInstanceOf(BadRequestException)
    await expect(run(CreateBundleDto, { name })).rejects.toBeInstanceOf(BadRequestException)
  })

  it.each(blanks)('rejects blank displaynames %j', async (displayname) => {
    await expect(run(CreateUserDto, { ...user, displayname })).rejects.toBeInstanceOf(BadRequestException)
    await expect(run(UpdateUserDto, { displayname })).rejects.toBeInstanceOf(BadRequestException)
    await expect(run(CreateInviteDto, { groups: [], displayname })).rejects.toBeInstanceOf(BadRequestException)
    await expect(run(RedeemInviteDto, { ...redeem, displayname })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('trims accepted names and displaynames', async () => {
    expect((await run(CreateGroupDto, { name: '  admins ' })).name).toBe('admins')
    expect((await run(CreateBundleDto, { name: ' b ' })).name).toBe('b')
    expect((await run(CreateUserDto, { ...user, displayname: ' Bob ' })).displayname).toBe('Bob')
    expect((await run(UpdateUserDto, { displayname: ' Bob ' })).displayname).toBe('Bob')
    expect((await run(CreateInviteDto, { groups: [], displayname: ' Bob ' })).displayname).toBe('Bob')
    expect((await run(RedeemInviteDto, { ...redeem, displayname: ' Bob ' })).displayname).toBe('Bob')
  })

  it('still allows omitting optional displaynames', async () => {
    await expect(run(UpdateUserDto, {})).resolves.toBeDefined()
    await expect(run(CreateInviteDto, {
      groups: ['a'],
    })).resolves.toBeDefined()
  })

  describe('groups arrays', () => {
    const cases: [string, new () => object, object][] = [
      ['CreateUserDto', CreateUserDto, user],
      ['UpdateUserDto', UpdateUserDto, {}],
      ['CreateInviteDto', CreateInviteDto, {}],
      [
        'CreateBundleDto',
        CreateBundleDto,
        { name: 'b' },
      ],
      [
        'UpdateBundleDto',
        UpdateBundleDto,
        { description: '' },
      ],
    ]

    it.each(cases)('%s rejects empty/blank entries and duplicates', async (_n, dto, base) => {
      for (const groups of [
        [''],
        ['  ', 'users'],
        ['a', 'a'],
        ['a', ' a '],
      ])
        await expect(run(dto, { ...base, groups })).rejects.toBeInstanceOf(BadRequestException)
    })

    it.each(cases)('%s trims entries', async (_n, dto, base) => {
      expect((await run(dto, {
        ...base,
        groups: [' a ', 'b'],
      })).groups).toEqual(['a', 'b'])
    })
  })

  it('trims :name route params', () => {
    for (const ctrl of [GroupsController, BundlesController]) {
      const args = Reflect.getMetadata('__routeArguments__', ctrl, 'update') as Record<string, { data: string, pipes: unknown[] }>
      const param = Object.values(args).find(a => a.data === 'name')
      expect(param?.pipes).toHaveLength(1)
    }
  })
})
