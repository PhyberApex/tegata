import type { SessionRole } from './composables/useAuth'
import { createRouter, createWebHistory } from 'vue-router'
import { authenticated, redirectForRole, role } from './composables/useAuth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/register/:token',
      name: 'register',
      component: () => import('./views/RegisterView.vue'),
      meta: { public: true },
    },
    {
      path: '/reset/:token',
      name: 'reset',
      component: () => import('./views/ResetView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'users',
      component: () => import('./views/UsersView.vue'),
    },
    {
      path: '/invites',
      name: 'invites',
      component: () => import('./views/InvitesView.vue'),
    },
    {
      path: '/groups',
      name: 'groups',
      component: () => import('./views/GroupsView.vue'),
    },
    {
      path: '/bundles',
      name: 'bundles',
      component: () => import('./views/BundlesView.vue'),
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('./views/ProfileView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public)
    return true

  try {
    const res = await fetch('/api/auth/check')
    if (!res.ok) {
      authenticated.value = false
      role.value = null
      return { name: 'login' }
    }
    const body = await res.json() as { authenticated: boolean, role: SessionRole }
    authenticated.value = true
    role.value = body.role
  }
  catch {
    authenticated.value = false
    role.value = null
    return { name: 'login' }
  }

  return redirectForRole(role.value, to.name) ?? true
})

export default router
