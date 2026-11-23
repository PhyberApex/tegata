import type { HelmetOptions } from 'helmet'
import { cookiesAreSecure } from './secure-cookies'

/**
 * helmet's defaults assume HTTPS: CSP `upgrade-insecure-requests` makes the browser rewrite every
 * subresource to https:// and HSTS pins the host to it. Over plain HTTP on a non-localhost address
 * (the mode a non-production NODE_ENV exists for) that leaves the UI blank, so both are dropped
 * whenever cookies are not Secure. The rest of the default CSP stays.
 */
export function helmetOptions(nodeEnv: string | undefined): HelmetOptions {
  if (cookiesAreSecure(nodeEnv))
    return {}
  return {
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: null },
    },
    strictTransportSecurity: false,
  }
}
