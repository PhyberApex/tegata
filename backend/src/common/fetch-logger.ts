import { Logger } from '@nestjs/common'

const logger = new Logger('Fetch')

export interface FetchLoggerOptions {
  /**
   * Substrings of an outgoing URL that mark a call as routine polling — a
   * metrics scrape, a status probe — logged at verbose instead of debug, so a
   * debug log shows the calls a person would care about. Each service names
   * its own, because what it polls is its own.
   */
  verbosePatterns?: readonly string[]
}

function extractMethod(init?: RequestInit): string {
  return (init?.method ?? 'GET').toUpperCase()
}

function extractUrl(input: string | URL | Request): string {
  if (typeof input === 'string')
    return input
  if (input instanceof URL)
    return input.href
  return input.url
}

/** Routine polling stays at verbose whatever it answered; anything else warns on a non-2xx. */
function levelFor(verbose: boolean, ok: boolean): 'verbose' | 'warn' | 'debug' {
  if (verbose)
    return 'verbose'
  return ok ? 'debug' : 'warn'
}

function errorMessage(err: unknown): string {
  return err instanceof Error
    ? err.message
    : String(err)
}

/**
 * Wraps `globalThis.fetch` so every outgoing request is logged under the
 * `Fetch` context: verbose for a URL matching `verbosePatterns`, a warning for
 * a non-2xx answer or a failure, debug for everything else.
 */
export function installFetchLogger({ verbosePatterns = [] }: FetchLoggerOptions = {}): void {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async function loggedFetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const url = extractUrl(input)
    const method = extractMethod(init)
    const start = Date.now()
    const verbose = verbosePatterns.some(p => url.includes(p))

    logger[levelFor(verbose, true)](`→ ${method} ${url}`)

    try {
      const res = await originalFetch(input, init)
      const size = res.headers.get('content-length') ?? '?'
      logger[levelFor(verbose, res.ok)](`← ${method} ${url} ${res.status} (${Date.now() - start}ms, ${size}b)`)
      return res
    }
    catch (err) {
      logger.warn(`← ${method} ${url} FAILED (${Date.now() - start}ms): ${errorMessage(err)}`)
      throw err
    }
  }
}
