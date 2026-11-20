import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { Injectable, Logger } from '@nestjs/common'

const VERBOSE_PREFIXES = ['/api/health', '/metrics']

// Routes whose path segment is a bearer secret (Invite / Reset Token).
const SECRET_PATH = /^(\/api\/(?:invites|reset-tokens)\/)[^/]+(\/(?:validate|redeem)\/?)$/i

/**
 * Strips secrets from a request URL before it is logged: the token segment
 * of invite/reset-token validate/redeem routes is replaced with `[redacted]`,
 * and any query string (status token, OIDC code/state, …) is reduced to `?…`.
 */
export function redactUrl(originalUrl: string): string {
  const q = originalUrl.indexOf('?')
  const path = q === -1
    ? originalUrl
    : originalUrl.slice(0, q)
  const redacted = path.replace(SECRET_PATH, '$1[redacted]$2')
  return q === -1
    ? redacted
    : `${redacted}?…`
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
