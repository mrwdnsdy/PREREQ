import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

interface User {
  id: string
  email: string
  fullName?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (token: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      fetchUserProfile()
    } else {
      setLoading(false)
    }
  }, [])

  const fetchUserProfile = async () => {
    try {
      const response = await api.get('/auth/profile')
      setUser(response.data)
    } catch (error) {
      console.error('Failed to fetch user profile:', error)
      localStorage.removeItem('authToken')
      delete api.defaults.headers.common['Authorization']
    } finally {
      setLoading(false)
    }
  }

  const login = async (token: string) => {
    localStorage.setItem('authToken', token)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    await fetchUserProfile()
    navigate('/')
  }

  const logout = () => {
    localStorage.removeItem('authToken')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
    navigate('/login')
  }

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
} 