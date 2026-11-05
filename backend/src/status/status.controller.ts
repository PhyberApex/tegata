import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import process from 'node:process'
import { Controller, Get, Headers, NotFoundException, Query, UnauthorizedException } from '@nestjs/common'
import { StatusService } from './status.service'

function tokensMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

@Controller('status')
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Get()
  get(@Headers('authorization') authorization?: string, @Query('token') queryToken?: unknown) {
    const expected = process.env.STATUS_ENDPOINT_TOKEN?.trim()
    if (!expected)
      throw new NotFoundException()

    const bearer = /^Bearer (.+)$/i.exec(authorization ?? '')?.[1]
    const given = bearer ?? (typeof queryToken === 'string'
      ? queryToken
      : '')
    if (!given || !tokensMatch(given, expected))
      throw new UnauthorizedException()

    return this.status.getStatus()
  }
}
