import { beforeEach, describe, expect, test } from 'vitest'
import router from './index'

describe('router', () => {
  beforeEach(async () => {
    sessionStorage.clear()
    await router.push('/login')
  })

  test('marks login route public and app routes as protected', () => {
    const routeMap = new Map(router.getRoutes().map((route) => [route.path, route]))

    expect(routeMap.get('/login')?.meta.requiresAuth).toBe(false)

    const protectedPaths = ['/', '/upload', '/analysis', '/recommendations', '/ai-analyze', '/ai-settings']
    for (const path of protectedPaths) {
      expect(routeMap.get(path)?.meta.requiresAuth).toBe(true)
    }
  })

  test('redirects unauthenticated access to login with redirect query', async () => {
    await router.push('/analysis')

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/analysis')
  })

  test('allows authenticated navigation to protected route', async () => {
    sessionStorage.setItem('session_active', '1')

    await router.push('/analysis')

    expect(router.currentRoute.value.path).toBe('/analysis')
  })

  test('redirects authenticated login access to requested route', async () => {
    sessionStorage.setItem('session_active', '1')

    await router.push('/login?redirect=/upload')

    expect(router.currentRoute.value.path).toBe('/upload')
  })

  test('normalizes authenticated login redirect loop to home', async () => {
    sessionStorage.setItem('session_active', '1')

    await router.push('/login?redirect=/login')

    expect(router.currentRoute.value.path).toBe('/')
  })
})
