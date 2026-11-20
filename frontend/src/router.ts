import type { AuthCheck } from '@tegata/shared'
import { createRouter, createWebHistory } from 'vue-router'
import { forgetSession, redirectForSession, startSession } from './composables/useAuth'

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

  let session: AuthCheck
  try {
    const res = await fetch('/api/auth/check')
    if (!res.ok) {
      forgetSession()
      return { name: 'login' }
    }
    session = await res.json() as AuthCheck
    startSession(session)
  }
  catch {
    forgetSession()
    return { name: 'login' }
  }

  return redirectForSession(session, to.name) ?? true
})

export default router
