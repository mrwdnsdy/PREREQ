import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

const Login = () => {
  const [token, setToken] = useState('')
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (token.trim()) {
      await login(token)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to PREREQ
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your authentication token
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="token" className="sr-only">
              Authentication Token
            </label>
            <input
              id="token"
              name="token"
              type="text"
              required
              className="input"
              placeholder="Enter your auth token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>

          <div>
            <button type="submit" className="w-full btn btn-primary">
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Login 