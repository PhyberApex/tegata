import type { OnModuleInit } from '@nestjs/common'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { collectDefaultMetrics, Counter, Histogram, Registry } from '@prometheus-io/client'

export interface MetricsOptions {
  /** Bucket bounds, in bytes, for both the request and the response size histogram. */
  sizeBuckets?: number[]
}

/** Provide a `MetricsOptions` under this token to change a service's defaults. */
export const METRICS_OPTIONS = Symbol('METRICS_OPTIONS')

const DEFAULT_SIZE_BUCKETS = [
  100,
  1000,
  10_000,
  100_000,
  1_000_000,
  10_000_000,
]

/**
 * The HTTP request series every backend exposes on `/metrics`, on a registry
 * of the service's own. A service registers its domain series on
 * `getRegistry()` from a provider of its own rather than here.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name)
  private readonly registry: Registry

  public readonly httpRequestsTotal: Counter<string>
  public readonly httpRequestDuration: Histogram<string>
  public readonly httpRequestSize: Histogram<string>
  public readonly httpResponseSize: Histogram<string>

  constructor(@Optional() @Inject(METRICS_OPTIONS) options: MetricsOptions | null = null) {
    const sizeBuckets = options?.sizeBuckets ?? DEFAULT_SIZE_BUCKETS
    this.registry = new Registry()

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    })

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [
        0.005,
        0.01,
        0.025,
        0.05,
        0.1,
        0.25,
        0.5,
        1,
        2.5,
        5,
        10,
      ],
      registers: [this.registry],
    })

    this.httpRequestSize = new Histogram({
      name: 'http_request_size_bytes',
      help: 'HTTP request size in bytes',
      labelNames: ['method', 'route'],
      buckets: sizeBuckets,
      registers: [this.registry],
    })

    this.httpResponseSize = new Histogram({
      name: 'http_response_size_bytes',
      help: 'HTTP response size in bytes',
      labelNames: ['method', 'route'],
      buckets: sizeBuckets,
      registers: [this.registry],
    })
  }

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry })
    this.logger.log('Metrics collection initialized')
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics()
  }

  getRegistry(): Registry {
    return this.registry
  }
}
