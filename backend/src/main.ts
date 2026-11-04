import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { DynamicLogger, installFetchLogger, setDynamicLoggerInstance } from './common'

async function bootstrap() {
  const logger = new DynamicLogger('log')
  setDynamicLoggerInstance(logger)
  installFetchLogger({
    verbosePatterns: ['/metrics', '/health'],
  })

  const app = await NestFactory.create(AppModule, { logger })

  // Trust one proxy hop (Traefik) so req.protocol reads X-Forwarded-Proto correctly
  app.getHttpAdapter().getInstance().set('trust proxy', 1)

  app.use(helmet())
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.setGlobalPrefix('api', {
    exclude: ['/', '/metrics'],
  })

  await app.listen(3000)
}
bootstrap()
