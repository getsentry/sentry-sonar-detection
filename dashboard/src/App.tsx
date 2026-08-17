import { useEffect, useState } from 'react'
import { fetchRooms, type Room, type RoomStatus } from './api'

const POLL_MS = 5000

const STATUS_LABEL: Record<RoomStatus, string> = {
  in_use: 'In use',
  free: 'Free',
  offline: 'Offline',
}

function relativeTime(now: number, ts: number | null): string {
  if (ts == null) return '—'
  const s = Math.max(0, now - ts)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export default function App() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      try {
        const data = await fetchRooms(controller.signal)
        if (!active) return
        setRooms(data.rooms)
        setNow(data.now)
        setError(null)
      } catch (e) {
        if (!active || controller.signal.aborted) return
        setError(e instanceof Error ? e.message : 'failed to load')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      active = false
      controller.abort()
      clearInterval(id)
    }
  }, [])

  return (
    <main className="app">
      <header className="app__header">
        <h1>Sentry Sonar</h1>
        <p className="app__subtitle">Meeting-room availability</p>
      </header>

      {error && <p className="banner banner--error">Can’t reach the API: {error}</p>}
      {loading && rooms.length === 0 && <p className="banner">Loading…</p>}

      {rooms.length > 0 && (
        <table className="rooms">
          <thead>
            <tr>
              <th>Room</th>
              <th>Status</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <td>{room.name ?? room.id}</td>
                <td>
                  <span className={`badge badge--${room.status}`}>
                    {STATUS_LABEL[room.status]}
                  </span>
                </td>
                <td className="muted">{relativeTime(now, room.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
