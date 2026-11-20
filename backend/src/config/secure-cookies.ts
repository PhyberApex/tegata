/**
 * Cookies (the session token and the OIDC state) carry the Secure flag only under
 * NODE_ENV=production. The image defaults to it, so anything else is an override.
 */
export function cookiesAreSecure(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production'
}

/** One line at boot when cookies go out without Secure: browsers will send the session cookie over plain HTTP. */
export function warnIfInsecureCookies(nodeEnv: string | undefined, warn: (message: string) => void): void {
  if (cookiesAreSecure(nodeEnv))
    return
  const current = nodeEnv === undefined
    ? 'unset'
    : JSON.stringify(nodeEnv)
  warn(`NODE_ENV is ${current}, not "production": cookies are issued without the Secure flag`)
}
