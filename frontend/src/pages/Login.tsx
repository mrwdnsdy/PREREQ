import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'

const Login = () => {
  const [isSignup, setIsSignup] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [confirmationCode, setConfirmationCode] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const { login } = useAuth()

  // Development login for demo user
  const handleDevLogin = async () => {
    setError('')
    try {
      console.log('Attempting dev login...')
      const response = await api.post('/auth/dev-login', { email: 'demo@prereq.com' })
      console.log('Dev login response:', response.data)
      await login(response.data.accessToken)
    } catch (err: any) {
      console.error('Dev login error:', err)
      setError(err.response?.data?.message || 'Development login failed')
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    try {
      const response = await api.post('/auth/login', { email, password })
      await login(response.data.accessToken)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed')
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    try {
      const response = await api.post('/auth/signup', { email, password, fullName })
      setMessage(response.data.message)
      setIsConfirming(true)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Signup failed')
    }
  }

  const handleConfirmSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    try {
      const response = await api.post('/auth/confirm-signup', { 
        email, 
        confirmationCode 
      })
      setMessage(response.data.message)
      setIsConfirming(false)
      setIsSignup(false)
      // Clear form
      setPassword('')
      setConfirmationCode('')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Confirmation failed')
    }
  }

  if (isConfirming) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Confirm your email
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              We sent a verification code to {email}
            </p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleConfirmSignup}>
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            {message && (
              <div className="rounded-md bg-green-50 p-4">
                <p className="text-sm text-green-800">{message}</p>
              </div>
            )}
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700">
                Verification Code
              </label>
              <input
                id="code"
                name="code"
                type="text"
                required
                className="mt-1 input"
                placeholder="Enter 6-digit code"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
              />
            </div>

            <div>
              <button type="submit" className="w-full btn btn-primary">
                Confirm Email
              </button>
            </div>
            
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsConfirming(false)
                  setError('')
                }}
                className="text-sm text-primary-600 hover:text-primary-500"
              >
                Back to signup
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isSignup ? 'Create your account' : 'Sign in to PREREQ'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}
            {' '}
            <button
              onClick={() => {
                setIsSignup(!isSignup)
                setError('')
                setMessage('')
              }}
              className="font-medium text-primary-600 hover:text-primary-500"
            >
              {isSignup ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>

        {/* Development Login */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Development Mode</h3>
          <p className="text-xs text-blue-600 mb-3">
            Quick access to demo account with seeded project data
          </p>
          <button
            onClick={handleDevLogin}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            Login as Demo User (demo@prereq.com)
          </button>
        </div>

        <form className="mt-8 space-y-6" onSubmit={isSignup ? handleSignup : handleLogin}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          {message && (
            <div className="rounded-md bg-green-50 p-4">
              <p className="text-sm text-green-800">{message}</p>
            </div>
          )}
          <div className="space-y-4">
            {isSignup && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  className="mt-1 input"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                required
                className="mt-1 input"
                placeholder={isSignup ? 'Min 8 chars, uppercase, lowercase, number, symbol' : 'Enter your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button type="submit" className="w-full btn btn-primary">
              {isSignup ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Login 