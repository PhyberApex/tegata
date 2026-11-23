import type { INestApplication } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { helmetOptions } from './config/helmet-options'
import { parseTrustProxy } from './config/parse-trust-proxy'

/**
 * The HTTP wiring every request passes through: trusted proxy hops, security headers, cookies,
 * DTO validation and the `/api` prefix. Shared by `bootstrap()` and the integration spec, so the
 * spec boots the same app the image runs.
 */
export function configureApp(app: INestApplication, config: ConfigService): void {
  const nodeEnv = config.get<string>('NODE_ENV')
  const trustProxy = parseTrustProxy(config.get<string>('TRUST_PROXY'))

  // How many hops (or which addresses) between the client and Tegata to trust, so req.ip and
  // req.protocol read the forwarded headers correctly
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy)

  // Same NODE_ENV source as the cookie flag, so headers and cookies agree on HTTP vs HTTPS
  app.use(helmet(helmetOptions(nodeEnv)))
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.setGlobalPrefix('api', {
    exclude: ['/', '/metrics'],
  })
}
