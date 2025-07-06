import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

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