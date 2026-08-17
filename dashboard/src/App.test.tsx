import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import App from './App'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('renders the Sentry Sonar heading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // pending
    render(<App />)
    expect(screen.getByRole('heading', { name: /sentry sonar/i })).toBeTruthy()
  })

  it('renders rooms returned by the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          now: 1000,
          rooms: [
            { id: 'urwald', name: 'Urwald', status: 'in_use', occupied: true, lastSeen: 995 },
            { id: 'oida', name: 'Oida', status: 'offline', occupied: false, lastSeen: null },
          ],
        }),
      })),
    )
    render(<App />)
    await waitFor(() => expect(screen.getByText('Urwald')).toBeTruthy())
    expect(screen.getByText('In use')).toBeTruthy()
    expect(screen.getByText('Offline')).toBeTruthy()
  })
})
