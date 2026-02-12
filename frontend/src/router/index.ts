import { createRouter, createWebHistory } from 'vue-router'

const isSessionActive = () => {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem('session_active') === '1'
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('../views/Login.vue'), meta: { requiresAuth: false } },
    { path: '/', component: () => import('../views/Home.vue'), meta: { requiresAuth: true } },
    { path: '/upload', component: () => import('../views/Upload.vue'), meta: { requiresAuth: true } },
    { path: '/analysis', component: () => import('../views/Analysis.vue'), meta: { requiresAuth: true } },
    { path: '/recommendations', component: () => import('../views/Recommendations.vue'), meta: { requiresAuth: true } },
    { path: '/ai-analyze', component: () => import('../views/AIAnalyze.vue'), meta: { requiresAuth: true } },
    { path: '/ai-settings', component: () => import('../views/AISettings.vue'), meta: { requiresAuth: true } }
  ]
})

router.beforeEach(to => {
  if (to.meta.requiresAuth === false) {
    if (to.path === '/login' && isSessionActive()) {
      const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/'
      return redirect === '/login' ? '/' : redirect
    }
    return true
  }

  if (!isSessionActive()) {
    return {
      path: '/login',
      query: { redirect: to.fullPath }
    }
  }

  return true
})

export default router
