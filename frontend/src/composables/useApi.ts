import router from '../router'
import { authenticated, role } from './useAuth'

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
  authenticated.value = false
  role.value = null
  router.push({ name: 'login' })
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
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new ApiError(body.message || res.statusText, res.status, body)
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
