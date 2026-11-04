import { Injectable } from '@nestjs/common'
import { Counter } from '@prometheus-io/client'
import { MetricsService } from '../common'

/**
 * Native shared-password login is the break-glass path (ADR-0004); every
 * success is meant to be rare enough to be worth counting.
 */
@Injectable()
export class NativeLoginMetrics {
  private readonly total: Counter

  constructor(metrics: MetricsService) {
    this.total = new Counter({
      name: 'tegata_native_login_total',
      help: 'Total number of successful native shared-password (break-glass) logins',
      registers: [
        metrics.getRegistry(),
      ],
    })
  }

  record(): void {
    this.total.inc()
  }
}
