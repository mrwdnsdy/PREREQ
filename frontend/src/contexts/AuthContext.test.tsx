import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

// Mock the axios instance so no real network calls are made.
vi.mock('../services/api', () => ({
  default: {
    defaults: { headers: { common: {} as Record<string, string> } },
    get: vi.fn(),
  },
}))

import api from '../services/api'

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    ;(api as any).defaults.headers.common = {}
  })

  it('throws if useAuth is used outside of an AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within an AuthProvider',
    )
  })

  it('starts unauthenticated and stops loading when no token is stored', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('login() stores the token, fetches the profile and authenticates', async () => {
    ;(api.get as Mock).mockResolvedValue({ data: { id: 'u1', email: 'e@x.com' } })

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.login('tok-123')
    })

    expect(localStorage.getItem('authToken')).toBe('tok-123')
    expect((api as any).defaults.headers.common['Authorization']).toBe('Bearer tok-123')
    expect(api.get).toHaveBeenCalledWith('/auth/profile')
    expect(result.current.user).toEqual({ id: 'u1', email: 'e@x.com' })
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('logout() clears the token and user', async () => {
    ;(api.get as Mock).mockResolvedValue({ data: { id: 'u1', email: 'e@x.com' } })
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.login('tok-123')
    })

    act(() => {
      result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(localStorage.getItem('authToken')).toBeNull()
    expect((api as any).defaults.headers.common['Authorization']).toBeUndefined()
  })

  it('clears a stored token when the profile fetch fails on mount', async () => {
    localStorage.setItem('authToken', 'stale-token')
    ;(api.get as Mock).mockRejectedValue(new Error('401'))

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('authToken')).toBeNull()
  })
})
