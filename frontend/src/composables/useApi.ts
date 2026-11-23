import router from '../router'
import { forgetSession } from './useAuth'

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) {
    super(message)
  }
}

/** True for the Enabled-Count Guard's 409, whether the total-count or a Guarded Group condition fired. */
export function isEnabledCountGuardError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.body.confirmRequired === true
}

/** Endpoints where a 401 means bad credentials or a bad token, not an expired session. */
const CREDENTIAL_OR_TOKEN_URL = /^\/api\/(?:auth\/|invites\/[^/]+\/(?:validate|redeem)$|reset-tokens\/[^/]+\/(?:validate|redeem)$|profile\/password$)/

function endSession() {
  forgetSession()
  router.push({ name: 'login' })
}

/** A proxy's 502/503 page is HTML, not JSON, and a `null` body would crash `body.message`, so anything but an object becomes `{}`. */
async function errorBody(res: Response): Promise<Record<string, unknown>> {
  const parsed: unknown = await res.json().catch(() => null)
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

/**
 * Never empty: `statusText` is `''` over HTTP/2 and HTTP/3, so the status code is the last resort.
 * ValidationPipe sends `message` as a string array, joined here so it reads as a sentence list.
 */
function errorMessage(body: Record<string, unknown>, res: Response): string {
  const { message } = body
  const text = Array.isArray(message)
    ? message.filter(m => typeof m === 'string' && m.trim() !== '').join('; ')
    : typeof message === 'string'
      ? message.trim()
      : ''
  return text || res.statusText || `Request failed (${res.status})`
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    if (res.status === 401 && !CREDENTIAL_OR_TOKEN_URL.test(url))
      endSession()
    const body = await errorBody(res)
    throw new ApiError(errorMessage(body, res), res.status, body)
  }

  if (res.status === 204)
    return undefined as T

  return res.json()
}

export function useApi() {
  return {
    get: <T>(url: string) => request<T>(url),

    post: <T>(url: string, body?: unknown) =>
      request<T>(url, {
        method: 'POST',
        body: body
          ? JSON.stringify(body)
          : undefined,
      }),

    patch: <T>(url: string, body: unknown) =>
      request<T>(url, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    del: <T>(url: string, body?: unknown) =>
      request<T>(url, {
        method: 'DELETE',
        body: body
          ? JSON.stringify(body)
          : undefined,
      }),
  }
}
