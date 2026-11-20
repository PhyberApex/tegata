import process from 'node:process'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { DynamicLogger, installFetchLogger, setDynamicLoggerInstance } from './common'
import { assertArgon2Options } from './config/argon2-options'
import { parseTrustProxy } from './config/parse-trust-proxy'
import { assertSecrets } from './config/secrets'
import { warnIfInsecureCookies } from './config/secure-cookies'
import { assertUsernamePattern } from './config/username-pattern'
import { parseListenPort } from './listen-port'

async function bootstrap() {
  assertUsernamePattern()
  assertArgon2Options()
  const port = parseListenPort(process.env.PORT)
  const host = process.env.HOST?.trim() || '0.0.0.0'

  const logger = new DynamicLogger('log')
  setDynamicLoggerInstance(logger)
  // process.env, not ConfigService: the cookie flag is fixed from it when the auth controller loads
  warnIfInsecureCookies(process.env.NODE_ENV, message => logger.warn(message, 'Bootstrap'))
  installFetchLogger({
    verbosePatterns: ['/metrics', '/health'],
  })

  const app = await NestFactory.create(AppModule, { logger })

  const config = app.get(ConfigService)
  // Read through ConfigService, not process.env: it is what has loaded .env by now
  await assertSecrets(key => config.get<string>(key))
  const trustProxy = parseTrustProxy(config.get<string>('TRUST_PROXY'))

  // How many hops (or which addresses) between the client and Tegata to trust, so req.ip and
  // req.protocol read the forwarded headers correctly
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy)

  app.use(helmet())
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.setGlobalPrefix('api', {
    exclude: ['/', '/metrics'],
  })

  // The image runs Node as PID 1, which the kernel gives no default signal action: without a
  // handler, `docker stop`'s SIGTERM is ignored until the SIGKILL. The hooks close the HTTP server
  // and run onModuleDestroy (which closes SQLite and checkpoints its WAL) before exiting.
  // useProcessExit, because Nest otherwise exits by re-sending the signal to itself, which PID 1
  // would ignore just the same.
  app.enableShutdownHooks([], { useProcessExit: true })

  await app.listen(port, host)
}
bootstrap()
