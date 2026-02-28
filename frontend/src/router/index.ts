import { createRouter, createWebHistory } from 'vue-router'
import request from '../utils/request'

const isSessionActive = () => {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem('session_active') === '1'
}

let sessionBootstrapPromise: Promise<boolean> | null = null

const bootstrapSession = async () => {
  if (isSessionActive()) return true

  if (!sessionBootstrapPromise) {
    sessionBootstrapPromise = request
      .get('/auth/me')
      .then(() => {
        sessionStorage.setItem('session_active', '1')
        return true
      })
      .catch(() => {
        sessionStorage.removeItem('session_active')
        return false
      })
      .finally(() => {
        sessionBootstrapPromise = null
      })
  }

  return sessionBootstrapPromise
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('../views/Login.vue'), meta: { requiresAuth: false, titleKey: 'nav.login' } },
    { path: '/register', component: () => import('../views/Register.vue'), meta: { requiresAuth: false, titleKey: 'nav.register' } },
    { path: '/', component: () => import('../views/Home.vue'), meta: { requiresAuth: true, titleKey: 'nav.overview' } },
    { path: '/upload', component: () => import('../views/Upload.vue'), meta: { requiresAuth: true, titleKey: 'nav.upload' } },
    { path: '/analysis', component: () => import('../views/Analysis.vue'), meta: { requiresAuth: true, titleKey: 'nav.analysis' } },
    { path: '/recommendations', component: () => import('../views/Recommendations.vue'), meta: { requiresAuth: true, titleKey: 'nav.recommendations' } },
    { path: '/ai-analyze', component: () => import('../views/IntelligenceHub.vue'), meta: { requiresAuth: true, titleKey: 'nav.aiAnalyze' } },
    { path: '/ai-settings', component: () => import('../views/AISettings.vue'), meta: { requiresAuth: true, titleKey: 'nav.aiSettings' } },
    { path: '/deep-research', redirect: '/ai-analyze?tab=research', meta: { requiresAuth: true, titleKey: 'nav.aiAnalyze' } }
  ]
})

router.beforeEach(async to => {
  if (to.meta.requiresAuth === false) {
    if ((to.path === '/login' || to.path === '/register') && isSessionActive()) {
      const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/'
      return redirect === '/login' || redirect === '/register' ? '/' : redirect
    }
    return true
  }

  const hasSession = await bootstrapSession()
  if (!hasSession) {
    return {
      path: '/login',
      query: { redirect: to.fullPath }
    }
  }

  return true
})

export default router
