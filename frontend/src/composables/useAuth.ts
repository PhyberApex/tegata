import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from './useApi'

export type SessionRole = 'admin' | 'self'

export const authenticated = ref(false)
export const role = ref<SessionRole | null>(null)

const ADMIN_ONLY_ROUTE_NAMES = new Set([
  'users',
  'invites',
  'groups',
  'bundles',
])

export function redirectForRole(sessionRole: SessionRole, routeName: string | symbol | null | undefined): string | null {
  if (sessionRole === 'self' && typeof routeName === 'string' && ADMIN_ONLY_ROUTE_NAMES.has(routeName))
    return '/profile'
  return null
}

export function useAuth() {
  const api = useApi()
  const router = useRouter()

  async function checkAuth() {
    try {
      const res = await api.get<{ authenticated: boolean, role: SessionRole }>('/api/auth/check')
      authenticated.value = true
      role.value = res.role
    }
    catch {
      authenticated.value = false
      role.value = null
      router.push('/login')
    }
  }

  async function login(password: string) {
    await api.post('/api/auth/login', { password })
    authenticated.value = true
    role.value = 'admin'
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
    router.push('/login')
  }

  return {
    authenticated,
    role,
    checkAuth,
    login,
    logout,
  }
}
