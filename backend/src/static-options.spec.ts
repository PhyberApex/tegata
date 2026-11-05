import type { INestApplication } from '@nestjs/common'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Controller, Get, Header, Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ServeStaticModule } from '@nestjs/serve-static'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { staticOptions } from './static-options'

@Controller()
class MetricsStub {
  @Get('metrics')
  @Header('Content-Type', 'text/plain')
  metrics() {
    return 'up 1'
  }
}

describe('static serving', () => {
  let app: INestApplication
  let dir: string
  let base: string

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tegata-static-'))
    writeFileSync(join(dir, 'index.html'), '<html>spa</html>')

    @Module({
      imports: [
        ServeStaticModule.forRoot(staticOptions(dir)),
      ],
      controllers: [MetricsStub],
    })
    class TestModule {}

    app = await NestFactory.create(TestModule, { logger: false })
    app.setGlobalPrefix('api', {
      exclude: ['/', '/metrics'],
    })
    await app.listen(0, '127.0.0.1')
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('answers unknown /api GETs with a JSON 404', async () => {
    const res = await fetch(`${base}/api/does-not-exist`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('serves the SPA index at /', async () => {
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('serves the SPA index for client-side routes', async () => {
    const res = await fetch(`${base}/some/route`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('leaves /metrics to its controller', async () => {
    const res = await fetch(`${base}/metrics`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
  })
})
