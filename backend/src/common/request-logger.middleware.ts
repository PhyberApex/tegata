import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { Injectable, Logger } from '@nestjs/common'

const VERBOSE_PREFIXES = ['/api/health', '/metrics']

// Paths whose segment is a bearer secret (Invite / Reset Token): the API
// validate/redeem routes, and the SPA pages the emailed links open.
const SECRET_PATHS = [
  /(\/(?:invites|reset-tokens)\/)[^/]+(?=\/(?:validate|redeem)(?:\/|$))/gi,
  /^(\/(?:register|reset)\/)[^/]+/i,
]

// Query strings can carry secrets too (STATUS_ENDPOINT_TOKEN, OIDC code/state),
// so only the path is logged, with `?…` marking that a query was present.
function redactUrl(originalUrl: string): string {
  const [path, ...query] = originalUrl.split('?')
  const redacted = SECRET_PATHS.reduce((p, re) => p.replace(re, '$1[redacted]'), path)
  return query.length > 0
    ? `${redacted}?…`
    : redacted
}

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
      const line = `${method} ${redactUrl(originalUrl)} → ${statusCode} (${ms}ms, ${size}b)`

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
