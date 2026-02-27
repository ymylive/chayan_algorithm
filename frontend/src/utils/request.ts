import axios, { type AxiosRequestHeaders, type InternalAxiosRequestConfig } from 'axios'
import { getActivePinia } from 'pinia'
import { useUiStore } from '../stores/ui'

const request = axios.create({
  baseURL: '/api',
  withCredentials: true
})

const SKIP_GLOBAL_LOADING_HEADER = 'X-Skip-Global-Loading'

type RequestConfigWithLoading = InternalAxiosRequestConfig & {
  __skipGlobalLoading?: boolean
  __globalLoadingTracked?: boolean
}

const normalizeHeaderValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return String(value[0] ?? '')
  }
  return String(value ?? '')
}

const getHeaderValue = (headers: unknown, key: string) => {
  if (!headers) return ''

  const normalizedKey = key.toLowerCase()
  const headerBag = headers as AxiosRequestHeaders & { get?: (headerName: string) => unknown }
  if (typeof headerBag.get === 'function') {
    return normalizeHeaderValue(headerBag.get(key) ?? headerBag.get(normalizedKey))
  }

  const headerRecord = headers as Record<string, unknown>
  return normalizeHeaderValue(headerRecord[key] ?? headerRecord[normalizedKey])
}

const shouldSkipGlobalLoading = (config: RequestConfigWithLoading) => {
  return getHeaderValue(config.headers, SKIP_GLOBAL_LOADING_HEADER).trim() === '1'
}

const removeSkipHeader = (headers: unknown) => {
  if (!headers) return

  const headerBag = headers as AxiosRequestHeaders & { delete?: (headerName: string) => unknown }
  if (typeof headerBag.delete === 'function') {
    headerBag.delete(SKIP_GLOBAL_LOADING_HEADER)
    headerBag.delete(SKIP_GLOBAL_LOADING_HEADER.toLowerCase())
    return
  }

  const headerRecord = headers as Record<string, unknown>
  delete headerRecord[SKIP_GLOBAL_LOADING_HEADER]
  delete headerRecord[SKIP_GLOBAL_LOADING_HEADER.toLowerCase()]
}

const getUiStore = () => {
  const pinia = getActivePinia()
  if (!pinia) return null
  return useUiStore(pinia)
}

const startGlobalLoading = (config: RequestConfigWithLoading) => {
  if (config.__skipGlobalLoading) return

  const uiStore = getUiStore()
  if (!uiStore) return

  uiStore.startLoading()
  config.__globalLoadingTracked = true
}

const stopGlobalLoading = (config?: RequestConfigWithLoading) => {
  if (!config?.__globalLoadingTracked) return

  const uiStore = getUiStore()
  if (uiStore) {
    uiStore.stopLoading()
  }

  config.__globalLoadingTracked = false
}

request.interceptors.request.use(
  config => {
    const nextConfig = config as RequestConfigWithLoading
    nextConfig.__skipGlobalLoading = shouldSkipGlobalLoading(nextConfig)
    removeSkipHeader(nextConfig.headers)
    startGlobalLoading(nextConfig)
    return nextConfig
  },
  error => {
    stopGlobalLoading(error?.config as RequestConfigWithLoading | undefined)
    return Promise.reject(error)
  }
)

request.interceptors.response.use(
  response => {
    stopGlobalLoading(response.config as RequestConfigWithLoading)
    return response.data
  },
  error => {
    stopGlobalLoading(error?.config as RequestConfigWithLoading | undefined)

    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      sessionStorage.removeItem('session_active')

      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        const currentPath = `${window.location.pathname}${window.location.search}`
        const redirect = encodeURIComponent(currentPath)
        window.location.replace(`/login?redirect=${redirect}`)
      }
    }

    console.error('Request failed:', error.message)
    return Promise.reject(error)
  }
)

export default request
