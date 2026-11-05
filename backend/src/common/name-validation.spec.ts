import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { BundlesController, CreateBundleDto, UpdateBundleDto } from '../bundles/bundles.controller'
import { CreateGroupDto, GroupsController } from '../groups/groups.controller'
import { CreateInviteDto, RedeemInviteDto } from '../invites/invites.controller'
import { CreateUserDto, UpdateUserDto } from '../users/users.controller'

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
