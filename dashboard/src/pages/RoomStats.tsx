import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { fetchRooms, fetchRoomStats, type Room, type RoomStats } from '../api'
import { StatusBadge, formatDuration, hoursLabel, relativeTime } from '../ui'

const POLL_MS = 10000
const WINDOWS = [24, 168, 720] // 1d, 7d, 30d

export default function RoomStatsPage() {
  const { id = '' } = useParams()
  const [hours, setHours] = useState(24)
  const [room, setRoom] = useState<Room | null>(null)
  const [stats, setStats] = useState<RoomStats | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      try {
        const [roomsRes, statsRes] = await Promise.all([
          fetchRooms(controller.signal),
          fetchRoomStats(id, hours, controller.signal),
        ])
        if (!active) return
        setRoom(roomsRes.rooms.find((r) => r.id === id) ?? null)
        setNow(roomsRes.now)
        setStats(statsRes)
        setError(null)
      } catch (e) {
        if (!active || controller.signal.aborted) return
        setError(e instanceof Error ? e.message : 'failed to load')
      } finally {
        if (active) setLoading(false)
      }
    }

    setLoading(true)
    load()
    const t = setInterval(load, POLL_MS)
    return () => {
      active = false
      controller.abort()
      clearInterval(t)
    }
  }, [id, hours])

  const pct = stats ? Math.round(stats.ratio * 100) : 0

  return (
    <main className="app">
      <header className="app__header">
        <p className="app__subtitle">
          <Link to="/">← All rooms</Link>
        </p>
        <h1>{room?.name ?? id}</h1>
        {room && <StatusBadge status={room.status} />}
      </header>

      {error && <p className="banner banner--error">Can’t reach the API: {error}</p>}
      {loading && !stats && <p className="banner">Loading…</p>}

      {stats && (
        <section className="stats">
          <div className="stats__window">
            {WINDOWS.map((h) => (
              <button
                key={h}
                className={`chip ${h === hours ? 'chip--active' : ''}`}
                onClick={() => setHours(h)}
              >
                {hoursLabel(h)}
              </button>
            ))}
          </div>

          <div className="stat">
            <div className="stat__value">{pct}%</div>
            <div className="stat__label">occupied over the last {hoursLabel(hours)}</div>
          </div>

          <div className="meter">
            <div className="meter__fill" style={{ width: `${pct}%` }} />
          </div>

          <dl className="kv">
            <div>
              <dt>Occupied time</dt>
              <dd>{formatDuration(stats.occupiedSeconds)}</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd>{formatDuration(stats.totalSeconds)}</dd>
            </div>
            {room && (
              <div>
                <dt>Last seen</dt>
                <dd>{relativeTime(now, room.lastSeen)}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </main>
  )
}
