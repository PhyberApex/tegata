import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { Injectable } from '@nestjs/common'
import { MetricsService } from './metrics.service'

// Constant label for requests that never hit a route, keeping cardinality bounded.
const UNMATCHED_ROUTE = 'unmatched'

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now()
    const { method } = req
    const requestSize = Number.parseInt(req.get('content-length') || '0', 10)

    res.on('finish', () => {
      // req.route is only populated once Express has routed the request, so it
      // must be resolved here rather than before next().
      const route = this.extractRoute(req)
      const durationSeconds = (Date.now() - start) / 1000
      const { statusCode } = res
      const responseSize = Number.parseInt(res.get('content-length') || '0', 10)

      this.metricsService.httpRequestsTotal.inc({
        method,
        route,
        status_code: statusCode.toString(),
      })
      this.metricsService.httpRequestDuration.observe(
        {
          method,
          route,
          status_code: statusCode.toString(),
        },
        durationSeconds,
      )

      if (requestSize > 0)
        this.metricsService.httpRequestSize.observe({ method, route }, requestSize)

      if (responseSize > 0)
        this.metricsService.httpResponseSize.observe({ method, route }, responseSize)
    })

    next()
  }

  private extractRoute(req: Request): string {
    if (req.route?.path) {
      const prefix = req.baseUrl || ''
      return `${prefix}${req.route.path}`
    }

    return UNMATCHED_ROUTE
  }
}
