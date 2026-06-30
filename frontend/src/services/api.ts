import axios from 'axios'
import { demoAdapter } from '../demo/demoAdapter'

// Demo mode: when the build is flagged for the public Pages demo AND no real
// backend URL is configured, serve every request from an in-browser mock store
// so the site is fully clickable with no server. A configured VITE_API_URL
// always wins (real backend), and local dev is unaffected.
const DEMO = import.meta.env.VITE_DEMO === '1' && !import.meta.env.VITE_API_URL

const api = axios.create({
  // Configurable so a hosted build (e.g. GitHub Pages) can point at a real
  // backend; defaults to the local dev server.
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

if (DEMO) {
  // Route all HTTP through the in-browser demo backend, synchronously, so the
  // adapter is in place before AuthProvider's mount effect fires its first
  // request. Seed a token first so the app hydrates the demo user and skips
  // the login page.
  try { localStorage.setItem('authToken', 'demo') } catch { /* SSR/no storage */ }
  api.defaults.adapter = demoAdapter
}

// Add request interceptor for better error handling
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('authToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    // Log task creation requests
    if (config.method === 'post' && config.url === '/tasks') {
      console.log('API REQUEST: POST /tasks')
      console.log('API REQUEST DATA:', JSON.stringify(config.data, null, 2))
      console.log('API REQUEST TITLE:', config.data?.title)
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle CORS and network errors more gracefully
    if (error.code === 'ERR_NETWORK' || error.message.includes('CORS')) {
      console.warn('Network/CORS error - this is usually temporary during development')
    }
    
    // Handle 401 errors by clearing auth
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken')
      delete api.defaults.headers.common['Authorization']
    }
    
    return Promise.reject(error)
  }
)

export default api 