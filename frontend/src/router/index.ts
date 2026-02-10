import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('../views/Home.vue') },
    { path: '/upload', component: () => import('../views/Upload.vue') },
    { path: '/analysis', component: () => import('../views/Analysis.vue') },
    { path: '/recommendations', component: () => import('../views/Recommendations.vue') }
  ]
})

export default router
