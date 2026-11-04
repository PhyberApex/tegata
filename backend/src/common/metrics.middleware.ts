import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { Injectable } from '@nestjs/common'
import { MetricsService } from './metrics.service'

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now()
    const { method } = req
    const route = this.extractRoute(req)
    const requestSize = Number.parseInt(req.get('content-length') || '0', 10)

    if (requestSize > 0)
      this.metricsService.httpRequestSize.observe({ method, route }, requestSize)

    res.on('finish', () => {
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

    return req.path
      .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '/:uuid')
      .replace(/\/[a-f0-9]{24}/gi, '/:objectid')
      .replace(/\/\d+/g, '/:id')
  }
}
