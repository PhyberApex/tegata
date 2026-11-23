import process from 'node:process'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { DynamicLogger, installFetchLogger, setDynamicLoggerInstance } from './common'
import { assertArgon2Options } from './config/argon2-options'
import { assertSecrets } from './config/secrets'
import { warnIfInsecureCookies } from './config/secure-cookies'
import { assertUsernamePattern } from './config/username-pattern'
import { configureApp } from './configure-app'
import { parseListenPort } from './listen-port'

async function bootstrap() {
  assertUsernamePattern()
  assertArgon2Options()
  const port = parseListenPort(process.env.PORT)
  const host = process.env.HOST?.trim() || '0.0.0.0'

  const logger = new DynamicLogger('log')
  setDynamicLoggerInstance(logger)
  installFetchLogger({
    verbosePatterns: ['/metrics', '/health'],
  })

  const app = await NestFactory.create(AppModule, { logger })

  const config = app.get(ConfigService)
  // Read through ConfigService, not process.env: it is what has loaded .env by now
  await assertSecrets(key => config.get<string>(key))
  warnIfInsecureCookies(config.get<string>('NODE_ENV'), message => logger.warn(message, 'Bootstrap'))
  configureApp(app, config)

  // The image runs Node as PID 1, which the kernel gives no default signal action: without a
  // handler, `docker stop`'s SIGTERM is ignored until the SIGKILL. The hooks close the HTTP server
  // and run onModuleDestroy (which closes SQLite and checkpoints its WAL) before exiting.
  // useProcessExit, because Nest otherwise exits by re-sending the signal to itself, which PID 1
  // would ignore just the same.
  app.enableShutdownHooks([], { useProcessExit: true })

  await app.listen(port, host)
}
bootstrap()
