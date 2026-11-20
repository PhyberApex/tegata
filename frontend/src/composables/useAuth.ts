import type { AuthCheck, SessionRole } from '@tegata/shared'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from './useApi'

export type { SessionRole }

export const authenticated = ref(false)
export const role = ref<SessionRole | null>(null)
/** The account this session acts as; `null` for a Native Login session, which has none. */
export const username = ref<string | null>(null)

/** Records the session `GET /api/auth/check` (or a native login) just established. */
export function startSession(session: Pick<AuthCheck, 'role' | 'username'>) {
  authenticated.value = true
  role.value = session.role
  username.value = session.username
}

/** Forgets the session client-side; routing to the login page is the caller's. */
export function forgetSession() {
  authenticated.value = false
  role.value = null
  username.value = null
}

const ADMIN_ONLY_ROUTE_NAMES = new Set([
  'users',
  'invites',
  'groups',
  'bundles',
])

/**
 * Where a session may not go: a self session is held to its profile, and a session with no account (a
 * Native Login admin) is kept off the profile, whose every call would answer 401 for it.
 */
export function redirectForSession(
  session: Pick<AuthCheck, 'role' | 'username'>,
  routeName: string | symbol | null | undefined,
): string | null {
  if (typeof routeName !== 'string')
    return null
  if (session.role === 'self' && ADMIN_ONLY_ROUTE_NAMES.has(routeName))
    return '/profile'
  if (session.username === null && routeName === 'profile')
    return '/'
  return null
}

export function useAuth() {
  const api = useApi()
  const router = useRouter()

  async function checkAuth() {
    try {
      startSession(await api.get<AuthCheck>('/api/auth/check'))
    }
    catch {
      forgetSession()
      router.push('/login')
    }
  }

  async function login(password: string) {
    await api.post('/api/auth/login', { password })
    startSession({ role: 'admin', username: null })
    router.push('/')
  }

  async function logout() {
    // The cookie is the only server-side state; an unreachable backend must not keep the client logged in,
    // and a failure has nowhere better to surface than the login page this lands on anyway.
    try {
      await api.post('/api/auth/logout')
    }
    catch {}
    forgetSession()
    router.push('/login')
  }

  return {
    authenticated,
    role,
    username,
    checkAuth,
    login,
    logout,
  }
}
