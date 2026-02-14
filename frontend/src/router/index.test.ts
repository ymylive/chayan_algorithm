import { beforeEach, describe, expect, test, vi } from 'vitest'
import request from '../utils/request'

vi.mock('../utils/request', () => ({
  default: {
    get: vi.fn()
  }
}))

import router from './index'

const requestGet = vi.mocked(request.get)

describe('router', () => {
  beforeEach(async () => {
    sessionStorage.clear()
    requestGet.mockReset()
    requestGet.mockResolvedValue({ success: true })
    await router.push('/login')
  })

  test('marks login route public and app routes as protected', () => {
    const routeMap = new Map(router.getRoutes().map((route) => [route.path, route]))

    expect(routeMap.get('/login')?.meta.requiresAuth).toBe(false)
    expect(routeMap.get('/register')?.meta.requiresAuth).toBe(false)

    const protectedPaths = ['/', '/upload', '/analysis', '/recommendations', '/ai-analyze', '/ai-settings']
    for (const path of protectedPaths) {
      expect(routeMap.get(path)?.meta.requiresAuth).toBe(true)
    }
  })

  test('redirects unauthenticated access to login with redirect query', async () => {
    requestGet.mockRejectedValueOnce(new Error('unauthorized'))

    await router.push('/analysis')

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/analysis')
  })

  test('allows authenticated navigation to protected route', async () => {
    sessionStorage.setItem('session_active', '1')

    await router.push('/analysis')

    expect(router.currentRoute.value.path).toBe('/analysis')
    expect(requestGet).not.toHaveBeenCalled()
  })

  test('bootstraps session via me endpoint for protected route', async () => {
    await router.push('/analysis')

    expect(requestGet).toHaveBeenCalledWith('/auth/me')
    expect(sessionStorage.getItem('session_active')).toBe('1')
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

  test('redirects authenticated register access to requested route', async () => {
    sessionStorage.setItem('session_active', '1')

    await router.push('/register?redirect=/upload')

    expect(router.currentRoute.value.path).toBe('/upload')
  })
})
