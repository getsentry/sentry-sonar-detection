import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const roomsResponse = {
  now: 1000,
  rooms: [{ id: 'urwald', name: 'Urwald', status: 'in_use', occupied: true, lastSeen: 995 }],
}

describe('overview', () => {
  it('renders the Sentry Sonar heading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // pending
    renderAt('/')
    expect(screen.getByRole('heading', { name: /sentry sonar/i })).toBeTruthy()
  })

  it('lists rooms and links each to its stats page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => roomsResponse })))
    renderAt('/')
    await waitFor(() => expect(screen.getByText('Urwald')).toBeTruthy())
    expect(screen.getByText('In use')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Urwald' }).getAttribute('href')).toBe('/rooms/urwald')
  })
})

describe('room stats', () => {
  it('renders utilization for a room', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/stats')
          ? {
              ok: true,
              json: async () => ({
                room: 'urwald',
                hours: 24,
                occupiedSeconds: 5400,
                totalSeconds: 86400,
                ratio: 0.0625,
              }),
            }
          : { ok: true, json: async () => roomsResponse },
      ),
    )
    renderAt('/rooms/urwald')
    await waitFor(() => expect(screen.getByText('6%')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Urwald' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /all rooms/i })).toBeTruthy()
  })
})
