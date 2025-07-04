import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'

const Login = () => {
  const [isSignup, setIsSignup] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [confirmationCode, setConfirmationCode] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const { login } = useAuth()

  // Development login for any user
  const handleDevLogin = async (email: string) => {
    setError('')
    setIsLoading(true)
    try {
      console.log('Attempting dev login...')
      const response = await api.post('/auth/dev-login', { email })
      console.log('Dev login response:', response.data)
      await login(response.data.accessToken)
    } catch (err: any) {
      console.error('Dev login error:', err)
      setError(err.response?.data?.message || 'Development login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    
    try {
      const response = await api.post('/auth/login', { email, password })
      await login(response.data.accessToken)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    
    try {
      const response = await api.post('/auth/signup', { email, password, fullName })
      setMessage(response.data.message)
      setIsConfirming(true)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Signup failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    
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
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = isSignup ? handleSignup : handleLogin

  if (isConfirming) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-2xl font-extrabold text-gray-900">
              Confirm your account
            </h2>
            <p className="mt-2 text-center text-base text-gray-600">
              Enter the confirmation code sent to your email
            </p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleConfirmSignup}>
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-base text-red-800">{error}</p>
              </div>
            )}
            {message && (
              <div className="rounded-md bg-green-50 p-4">
                <p className="text-base text-green-800">{message}</p>
              </div>
            )}
            
            <div>
              <label htmlFor="code" className="block text-base font-medium text-gray-700">
                Confirmation Code
              </label>
              <div className="mt-1">
                <input
                  id="code"
                  name="code"
                  type="text"
                  required
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10"
                  placeholder="Enter confirmation code"
                  value={confirmationCode}
                  onChange={(e) => setConfirmationCode(e.target.value)}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-base font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50"
              >
                {isLoading ? 'Confirming...' : 'Confirm Account'}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                className="text-base text-primary-600 hover:text-primary-500"
              >
                Back to login
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
          <h2 className="mt-6 text-center text-2xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-base text-gray-600">
            Or{' '}
            <button
              onClick={() => setIsSignup(true)}
              className="font-medium text-primary-600 hover:text-primary-500"
            >
              create a new account
            </button>
          </p>
        </div>

        {/* Development Mode Login */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="text-base font-medium text-blue-800 mb-2">Development Mode</h3>
            <p className="text-sm text-blue-600 mb-3">
              Quick login options for development and testing
            </p>
            
            <div className="space-y-2">
              <button
                onClick={() => handleDevLogin('demo@prereq.com')}
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 text-base font-medium disabled:opacity-50"
              >
                Login as Demo User
              </button>
              <button
                onClick={() => handleDevLogin('admin@prereq.com')}
                disabled={isLoading}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 text-base font-medium disabled:opacity-50"
              >
                Login as Admin
              </button>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-base text-red-800">{error}</p>
            </div>
          )}
          {message && (
            <div className="rounded-md bg-green-50 p-4">
              <p className="text-base text-green-800">{message}</p>
            </div>
          )}
          
          {isSignup && (
            <div>
              <label htmlFor="fullName" className="block text-base font-medium text-gray-700">
                Full Name
              </label>
              <div className="mt-1">
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-base font-medium text-gray-700">
              Email address
            </label>
            <div className="mt-1">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-base font-medium text-gray-700">
              Password
            </label>
            <div className="mt-1">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-base font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50"
            >
              {isLoading ? (isSignup ? 'Creating account...' : 'Signing in...') : (isSignup ? 'Create Account' : 'Sign in')}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
              className="text-base text-primary-600 hover:text-primary-500"
            >
              {isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Login 