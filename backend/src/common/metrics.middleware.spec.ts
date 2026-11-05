import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MetricsMiddleware } from './metrics.middleware'
import { MetricsService } from './metrics.service'

function createMockRequest(options: {
  method: string
  path: string
  route?: { path: string }
  baseUrl?: string
  contentLength?: string
}): any {
  return {
    method: options.method,
    path: options.path,
    route: options.route,
    baseUrl: options.baseUrl || '',
    get: vi.fn((header: string) => {
      if (header.toLowerCase() === 'content-length')
        return options.contentLength
      return undefined
    }),
  }
}

function createMockResponse(options: {
  statusCode: number
  contentLength?: string
  finishDelay?: number
}): any {
  const listeners: Record<string, (() => void)[]> = {}
  const res: any = {
    statusCode: options.statusCode,
    get: vi.fn((header: string) => {
      if (header.toLowerCase() === 'content-length')
        return options.contentLength
      return undefined
    }),
    on: vi.fn((event: string, callback: () => void): any => {
      if (!listeners[event])
        listeners[event] = []
      listeners[event].push(callback)
      if (event === 'finish' && options.finishDelay !== undefined) {
        setTimeout(callback, options.finishDelay)
      }
      return res
    }),
    emit: (event: string) => {
      if (listeners[event]) {
        listeners[event].forEach(cb => cb())
      }
    },
  }
  return res
}

function flushImmediate(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

describe('metricsMiddleware', () => {
  let middleware: MetricsMiddleware
  let mockMetricsService: any

  beforeEach(async () => {
    mockMetricsService = {
      httpRequestsTotal: {
        inc: vi.fn(),
      },
      httpRequestDuration: {
        observe: vi.fn(),
      },
      httpRequestSize: {
        observe: vi.fn(),
      },
      httpResponseSize: {
        observe: vi.fn(),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsMiddleware,
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile()

    middleware = module.get<MetricsMiddleware>(MetricsMiddleware)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(middleware).toBeDefined()
  })

  describe('request tracking', () => {
    it('should record request metrics on response finish', async () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/health',
        route: { path: '/api/health' },
      })
      const res = createMockResponse({ statusCode: 200 })
      const next = vi.fn()

      middleware.use(req, res, next)
      expect(next).toHaveBeenCalled()

      res.emit('finish')

      await flushImmediate()

      expect(mockMetricsService.httpRequestsTotal.inc).toHaveBeenCalledWith({
        method: 'GET',
        route: '/api/health',
        status_code: '200',
      })
      expect(mockMetricsService.httpRequestDuration.observe).toHaveBeenCalled()
    })

    it('should record request size when content-length header present', async () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/chat',
        route: { path: '/api/chat' },
        contentLength: '1024',
      })
      const res = createMockResponse({ statusCode: 201 })
      const next = vi.fn()

      middleware.use(req, res, next)
      res.emit('finish')

      await flushImmediate()

      expect(mockMetricsService.httpRequestSize.observe).toHaveBeenCalledWith(
        { method: 'POST', route: '/api/chat' },
        1024,
      )
    })

    it('should record response size when content-length header present', async () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/status',
        route: { path: '/api/status' },
      })
      const res = createMockResponse({ statusCode: 200, contentLength: '2048' })
      const next = vi.fn()

      middleware.use(req, res, next)
      res.emit('finish')

      await flushImmediate()

      expect(mockMetricsService.httpResponseSize.observe).toHaveBeenCalledWith(
        { method: 'GET', route: '/api/status' },
        2048,
      )
    })

    it('should not record size when content-length is missing', async () => {
      const req = createMockRequest({ method: 'GET', path: '/api/test' })
      const res = createMockResponse({ statusCode: 204 })
      const next = vi.fn()

      middleware.use(req, res, next)
      res.emit('finish')

      await flushImmediate()

      expect(mockMetricsService.httpRequestSize.observe).not.toHaveBeenCalled()
      expect(mockMetricsService.httpResponseSize.observe).not.toHaveBeenCalled()
    })

    it('should track different status codes', async () => {
      const req = createMockRequest({ method: 'POST', path: '/api/fail' })
      const res = createMockResponse({ statusCode: 500 })
      const next = vi.fn()

      middleware.use(req, res, next)
      res.emit('finish')

      await flushImmediate()

      expect(mockMetricsService.httpRequestsTotal.inc).toHaveBeenCalledWith(
        expect.objectContaining({ status_code: '500' }),
      )
    })
  })

  describe('route extraction', () => {
    it('should use route.path when available', async () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/users/123',
        route: { path: '/api/users/:id' },
      })
      const res = createMockResponse({ statusCode: 200 })
      const next = vi.fn()

      middleware.use(req, res, next)
      res.emit('finish')

      await flushImmediate()

      expect(mockMetricsService.httpRequestsTotal.inc).toHaveBeenCalledWith(
        expect.objectContaining({ route: '/api/users/:id' }),
      )
    })

    it('should include baseUrl in route when present', async () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/lab/members/create',
        route: { path: '/members/create' },
        baseUrl: '/api/lab',
      })
      const res = createMockResponse({ statusCode: 201 })
      const next = vi.fn()

      middleware.use(req, res, next)
      res.emit('finish')

      await flushImmediate()

      expect(mockMetricsService.httpRequestsTotal.inc).toHaveBeenCalledWith(
        expect.objectContaining({ route: '/api/lab/members/create' }),
      )
    })

    it('should record the templated route when req.route is set only after next()', async () => {
      const req = createMockRequest({ method: 'PATCH', path: '/api/users/alice' })
      const res = createMockResponse({ statusCode: 200 })
      const next = vi.fn(() => {
        req.route = { path: '/:username' }
        req.baseUrl = '/api/users'
      })

      middleware.use(req, res, next)
      res.emit('finish')

      await flushImmediate()

      expect(mockMetricsService.httpRequestsTotal.inc).toHaveBeenCalledWith({
        method: 'PATCH',
        route: '/api/users/:username',
        status_code: '200',
      })
    })

    it('should record unmatched requests under a single constant label', async () => {
      for (const path of ['/api/foo', '/wp-login.php']) {
        const req = createMockRequest({ method: 'GET', path, contentLength: '10' })
        const res = createMockResponse({ statusCode: 404, contentLength: '20' })
        middleware.use(req, res, vi.fn())
        res.emit('finish')
      }

      await flushImmediate()

      const routes = mockMetricsService.httpRequestsTotal.inc.mock.calls.map((c: any[]) => c[0].route)
      expect(routes).toEqual(['unmatched', 'unmatched'])
      expect(mockMetricsService.httpRequestSize.observe).toHaveBeenCalledWith({ method: 'GET', route: 'unmatched' }, 10)
      expect(mockMetricsService.httpResponseSize.observe).toHaveBeenCalledWith({ method: 'GET', route: 'unmatched' }, 20)
    })
  })

  describe('timing accuracy', () => {
    it('should measure request duration in seconds', async () => {
      const req = createMockRequest({ method: 'GET', path: '/api/test' })
      const res = createMockResponse({ statusCode: 200 })
      const next = vi.fn()

      middleware.use(req, res, next)

      await new Promise<void>(resolve => setTimeout(resolve, 50))
      res.emit('finish')

      await flushImmediate()

      const observeCall = mockMetricsService.httpRequestDuration.observe.mock.calls[0]
      const duration = observeCall[1]
      expect(duration).toBeGreaterThan(0)
      expect(duration).toBeLessThan(1)
    })
  })
})
