import axios from 'axios'

const request = axios.create({
  baseURL: '/api',
  withCredentials: true
})

request.interceptors.response.use(
  response => response.data,
  error => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      sessionStorage.removeItem('session_active')

      if (window.location.pathname !== '/login') {
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
