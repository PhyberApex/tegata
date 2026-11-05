import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { DynamicLogger, installFetchLogger, setDynamicLoggerInstance } from './common'
import { parseTrustProxy } from './config/parse-trust-proxy'

async function bootstrap() {
  const logger = new DynamicLogger('log')
  setDynamicLoggerInstance(logger)
  installFetchLogger({
    verbosePatterns: ['/metrics', '/health'],
  })

  const app = await NestFactory.create(AppModule, { logger })

  const trustProxy = parseTrustProxy(app.get(ConfigService).get<string>('TRUST_PROXY'))

  // How many hops (or which addresses) between the client and Tegata to trust, so req.ip and
  // req.protocol read the forwarded headers correctly
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy)

  app.use(helmet())
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.setGlobalPrefix('api', {
    exclude: ['/', '/metrics'],
  })

  await app.listen(3000)
}
bootstrap()
