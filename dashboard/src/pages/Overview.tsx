import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchRooms, type Room } from '../api'
import { StatusBadge, relativeTime } from '../ui'
import OfficeMap from '../components/OfficeMap'

const POLL_MS = 5000

export default function Overview() {
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
    <main className="app overview">
      <header className="app__header">
        <img className="app__logo" src="/sentry-sonar.png" alt="Sentry Sonar" />
      </header>

      {error && <p className="banner banner--error">Can’t reach the API: {error}</p>}
      {loading && rooms.length === 0 && <p className="banner">Loading…</p>}

      {rooms.length > 0 && <OfficeMap rooms={rooms} />}

      <p className="app__intro">
          Sentry Sonar watches the office meeting rooms with presence detection
          radar and reports, live, which rooms are occupied and which are free —
          so you can find an open room at a glance instead of walking the floor.
      </p>

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
                <td>
                  <Link to={`/room-details/${room.id}`}>{room.name ?? room.id}</Link>
                </td>
                <td>
                  <StatusBadge status={room.status} />
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
