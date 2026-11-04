import { Module } from '@nestjs/common'
import { METRICS_OPTIONS, MetricsService } from '../common'
import { MetricsController } from './metrics.controller'
import { NativeLoginMetrics } from './native-login-metrics'

@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    // tegata's request and response bodies are small JSON; its size
    // histograms stop at 1 MB rather than the shared default's 10 MB.
    {
      provide: METRICS_OPTIONS,
      useValue: {
        sizeBuckets: [100, 1000, 10_000, 100_000, 1_000_000],
      },
    },
    NativeLoginMetrics,
  ],
  exports: [MetricsService, NativeLoginMetrics],
})
export class MetricsModule {}
