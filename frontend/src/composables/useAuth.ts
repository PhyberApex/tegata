import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from './useApi'

export type SessionRole = 'admin' | 'self'

export const authenticated = ref(false)
export const role = ref<SessionRole | null>(null)
/** The account this session acts as; `null` for a Native Login session, which has none. */
export const username = ref<string | null>(null)

export interface AuthCheck { authenticated: boolean, role: SessionRole, username: string | null }

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
export function redirectForRole(
  sessionRole: SessionRole,
  sessionUsername: string | null,
  routeName: string | symbol | null | undefined,
): string | null {
  if (typeof routeName !== 'string')
    return null
  if (sessionRole === 'self' && ADMIN_ONLY_ROUTE_NAMES.has(routeName))
    return '/profile'
  if (sessionUsername === null && routeName === 'profile')
    return '/'
  return null
}

export function useAuth() {
  const api = useApi()
  const router = useRouter()

  async function checkAuth() {
    try {
      const res = await api.get<AuthCheck>('/api/auth/check')
      authenticated.value = true
      role.value = res.role
      username.value = res.username ?? null
    }
    catch {
      authenticated.value = false
      role.value = null
      username.value = null
      router.push('/login')
    }
  }

  async function login(password: string) {
    await api.post('/api/auth/login', { password })
    authenticated.value = true
    role.value = 'admin'
    username.value = null
    router.push('/')
  }

  async function logout() {
    // The cookie is the only server-side state; an unreachable backend must not keep the client logged in,
    // and a failure has nowhere better to surface than the login page this lands on anyway.
    try {
      await api.post('/api/auth/logout')
    }
    catch {}
    authenticated.value = false
    role.value = null
    username.value = null
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
