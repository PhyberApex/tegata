import type { MiddlewareConsumer, NestModule } from '@nestjs/common'
import { join } from 'node:path'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ServeStaticModule } from '@nestjs/serve-static'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AccessPreviewModule } from './access-preview/access-preview.module'
import { AuthModule } from './auth/auth.module'
import { BundlesModule } from './bundles/bundles.module'
import { MetricsMiddleware, RequestLoggerMiddleware } from './common'
import { ControlModule } from './control/control.module'
import { DatabaseModule } from './database/database.module'
import { GroupsApiModule } from './groups/groups-api.module'
import { GroupsModule } from './groups/groups.module'
import { HealthModule } from './health/health.module'
import { InvitesModule } from './invites/invites.module'
import { MetricsModule } from './metrics/metrics.module'
import { ProfileModule } from './profile/profile.module'
import { ResetTokensModule } from './reset-tokens/reset-tokens.module'
import { StatusModule } from './status/status.module'
import { UsersModule } from './users/users.module'

@Module({
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 100 },
    ]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend', 'dist'),
      exclude: ['/metrics'],
    }),
    AccessPreviewModule,
    DatabaseModule,
    AuthModule,
    GroupsModule,
    GroupsApiModule,
    BundlesModule,
    HealthModule,
    UsersModule,
    InvitesModule,
    ResetTokensModule,
    ProfileModule,
    MetricsModule,
    ControlModule,
    StatusModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MetricsMiddleware, RequestLoggerMiddleware)
      .forRoutes('*')
  }
}
