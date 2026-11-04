import { describe, expect, it } from 'vitest'
import { MetricsService } from '../common'
import { NativeLoginMetrics } from './native-login-metrics'

describe('nativeLoginMetrics', () => {
  it('counts each break-glass login on the service\'s own registry', async () => {
    const metrics = new MetricsService()
    const logins = new NativeLoginMetrics(metrics)

    expect(await metrics.getMetrics()).toContain('tegata_native_login_total 0')
    logins.record()
    expect(await metrics.getMetrics()).toContain('tegata_native_login_total 1')
  })
})
