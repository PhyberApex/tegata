import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { Injectable, Logger } from '@nestjs/common'

const VERBOSE_PREFIXES = ['/api/health', '/metrics']

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now()
    const { method, originalUrl } = req

    res.on('finish', () => {
      const ms = Date.now() - start
      const { statusCode } = res
      const size = res.get('content-length') ?? '-'
      const line = `${method} ${originalUrl} → ${statusCode} (${ms}ms, ${size}b)`

      if (VERBOSE_PREFIXES.some(p => originalUrl.startsWith(p)))
        this.logger.verbose(line)
      else if (statusCode >= 400)
        this.logger.warn(line)
      else
        this.logger.debug(line)
    })

    next()
  }
}
