import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
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

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken')
      // Don't force a page reload - let React Router handle navigation
      // The AuthContext will redirect to login when it detects no valid token
    }
    return Promise.reject(error)
  }
)

export default api 