import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { Registry } from '@prometheus-io/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { METRICS_OPTIONS, MetricsService } from './metrics.service'

describe('metricsService', () => {
  let service: MetricsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile()

    service = module.get<MetricsService>(MetricsService)
  })

  afterEach(() => {
    service.getRegistry().clear()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('initialization', () => {
    it('should initialize all HTTP metrics', () => {
      expect(service.httpRequestsTotal).toBeDefined()
      expect(service.httpRequestDuration).toBeDefined()
      expect(service.httpRequestSize).toBeDefined()
      expect(service.httpResponseSize).toBeDefined()
    })

    it('should create a registry', () => {
      const registry = service.getRegistry()
      expect(registry).toBeInstanceOf(Registry)
    })
  })

  describe('onModuleInit', () => {
    it('should collect default metrics', async () => {
      service.onModuleInit()
      const metrics = await service.getMetrics()
      expect(metrics).toContain('process_cpu_user_seconds_total')
      expect(metrics).toContain('nodejs_version_info')
    })
  })

  describe('getMetrics', () => {
    it('should return metrics as prometheus text format', async () => {
      const metrics = await service.getMetrics()
      expect(typeof metrics).toBe('string')
      expect(metrics).toContain('# HELP')
      expect(metrics).toContain('# TYPE')
    })

    it('should include custom HTTP metrics', async () => {
      const metrics = await service.getMetrics()
      expect(metrics).toContain('http_requests_total')
      expect(metrics).toContain('http_request_duration_seconds')
      expect(metrics).toContain('http_request_size_bytes')
      expect(metrics).toContain('http_response_size_bytes')
    })
  })

  describe('metric recording', () => {
    it('should record request count', async () => {
      service.httpRequestsTotal.inc({
        method: 'GET',
        route: '/api/test',
        status_code: '200',
      })
      const metricValue = await service.httpRequestsTotal.get()
      expect(metricValue.values.length).toBeGreaterThan(0)
    })

    it('should record request duration', async () => {
      service.httpRequestDuration.observe(
        { method: 'POST', route: '/api/chat', status_code: '200' },
        0.5,
      )
      const metricValue = await service.httpRequestDuration.get()
      expect(metricValue.values.length).toBeGreaterThan(0)
    })

    it('should record request size', async () => {
      service.httpRequestSize.observe(
        { method: 'POST', route: '/api/tts/synthesize' },
        1024,
      )
      const metricValue = await service.httpRequestSize.get()
      expect(metricValue.values.length).toBeGreaterThan(0)
    })

    it('should record response size', async () => {
      service.httpResponseSize.observe(
        { method: 'GET', route: '/api/image/outputs' },
        2048,
      )
      const metricValue = await service.httpResponseSize.get()
      expect(metricValue.values.length).toBeGreaterThan(0)
    })
  })

  describe('histogram buckets', () => {
    it('should have duration buckets for different latencies', async () => {
      service.httpRequestDuration.observe(
        { method: 'GET', route: '/test', status_code: '200' },
        0.001,
      )
      service.httpRequestDuration.observe(
        { method: 'GET', route: '/test', status_code: '200' },
        0.5,
      )
      service.httpRequestDuration.observe(
        { method: 'GET', route: '/test', status_code: '200' },
        5,
      )
      const metrics = await service.getMetrics()
      expect(metrics).toContain('http_request_duration_seconds_bucket')
    })

    it('should have size buckets for different payload sizes', async () => {
      service.httpRequestSize.observe({ method: 'POST', route: '/test' }, 500)
      service.httpRequestSize.observe({ method: 'POST', route: '/test' }, 50_000)
      service.httpRequestSize.observe({ method: 'POST', route: '/test' }, 5_000_000)
      const metrics = await service.getMetrics()
      expect(metrics).toContain('http_request_size_bytes_bucket')
    })
  })

  describe('size buckets', () => {
    async function bucketsOf(svc: MetricsService): Promise<unknown[]> {
      svc.httpRequestSize.observe({ method: 'GET', route: '/' }, 1)
      const { values } = await svc.httpRequestSize.get()
      return values
        .filter(v => v.metricName === 'http_request_size_bytes_bucket' && v.labels.le !== '+Inf')
        .map(v => v.labels.le)
    }

    it('defaults to buckets reaching 10 MB', async () => {
      expect(await bucketsOf(service)).toEqual([
        100,
        1000,
        10_000,
        100_000,
        1_000_000,
        10_000_000,
      ])
    })

    it('takes the service\'s own size buckets for both size histograms', async () => {
      const module = await Test.createTestingModule({
        providers: [
          MetricsService,
          {
            provide: METRICS_OPTIONS,
            useValue: {
              sizeBuckets: [10, 100],
            },
          },
        ],
      }).compile()
      const custom = module.get(MetricsService)

      expect(await bucketsOf(custom)).toEqual([10, 100])
      custom.httpResponseSize.observe({ method: 'GET', route: '/' }, 50)
      expect(await custom.getMetrics()).toContain('http_response_size_bytes_bucket{le="100",method="GET",route="/"} 1')
    })
  })
})
