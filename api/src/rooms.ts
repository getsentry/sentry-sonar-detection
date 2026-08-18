import type { RoomRow, RoomStatus, RoomView } from './types'

/** A room is considered offline/unknown if no heartbeat within this window. */
export const OFFLINE_AFTER_SECONDS = 90

export const nowSec = (): number => Math.floor(Date.now() / 1000)

export function deriveStatus(room: RoomRow, now: number): RoomStatus {
  if (room.last_seen == null || now - room.last_seen > OFFLINE_AFTER_SECONDS) {
    return 'offline'
  }
  return room.occupied ? 'in_use' : 'free'
}

export function toRoomView(room: RoomRow, now: number): RoomView {
  return {
    id: room.id,
    name: room.name,
    status: deriveStatus(room, now),
    occupied: !!room.occupied,
    lastSeen: room.last_seen,
  }
}

const ROOM_COLS = 'id, name, occupied, last_seen, updated_at'

export function getRoom(db: D1Database, id: string): Promise<RoomRow | null> {
  return db.prepare(`SELECT ${ROOM_COLS} FROM rooms WHERE id = ?`).bind(id).first<RoomRow>()
}

export async function listRooms(db: D1Database): Promise<RoomRow[]> {
  const { results } = await db.prepare(`SELECT ${ROOM_COLS} FROM rooms ORDER BY name`).all<RoomRow>()
  return results
}

/**
 * Record a sensor heartbeat: update the room's current state and append an
 * event row only when the occupied state changes (or on the first-ever report).
 */
export async function applyHeartbeat(
  db: D1Database,
  room: RoomRow,
  occupied: boolean,
): Promise<RoomRow> {
  const now = nowSec()
  const changed = room.last_seen == null || !!room.occupied !== occupied

  const statements = [
    db
      .prepare('UPDATE rooms SET occupied = ?, last_seen = ?, updated_at = ? WHERE id = ?')
      .bind(occupied ? 1 : 0, now, now, room.id),
  ]
  if (changed) {
    statements.push(
      db
        .prepare('INSERT INTO events (room_id, occupied, created_at) VALUES (?, ?, ?)')
        .bind(room.id, occupied ? 1 : 0, now),
    )
  }
  await db.batch(statements)

  return { ...room, occupied: occupied ? 1 : 0, last_seen: now, updated_at: now }
}

export interface Utilization {
  occupiedSeconds: number
  totalSeconds: number
  ratio: number
}

interface EventRow {
  occupied: number
  created_at: number
}

// --- Office hours -----------------------------------------------------------
// Utilization only counts working hours: Mon–Fri 08:00–18:00 Europe/Vienna
// (matches the display firmware's active window). Nights and weekends "don't
// count" — excluded from both the occupied time and the total.
const OFFICE_TZ = 'Europe/Vienna'
const OFFICE_START_HOUR = 8
const OFFICE_END_HOUR = 18

// Timezone offset (seconds, local − UTC) at a given instant, via Intl.
function tzOffsetSeconds(epochSec: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(
    dtf.formatToParts(new Date(epochSec * 1000)).map((x) => [x.type, x.value]),
  ) as Record<string, string>
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000
  return asUTC - epochSec
}

// Epoch (seconds) for a Vienna local wall-clock date + hour, DST-aware. (Office
// boundaries 08:00/18:00 are never at a DST transition, so one correction is exact.)
function zonedEpoch(y: number, m: number, d: number, hour: number): number {
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0) / 1000
  return guess - tzOffsetSeconds(guess, OFFICE_TZ)
}

// Local calendar date + weekday (0=Sun..6=Sat) for an epoch, in OFFICE_TZ.
function localParts(epochSec: number): { y: number; m: number; d: number; wday: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: OFFICE_TZ,
    weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const p = Object.fromEntries(
    dtf.formatToParts(new Date(epochSec * 1000)).map((x) => [x.type, x.value]),
  ) as Record<string, string>
  const wday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday] ?? 0
  return { y: +p.year, m: +p.month, d: +p.day, wday }
}

/** Seconds within office hours (Mon–Fri 08:00–18:00 Europe/Vienna) in [start, end). */
export function officeSecondsInInterval(start: number, end: number): number {
  if (end <= start) return 0
  let total = 0
  let cursor = start
  for (let guard = 0; guard < 400 && cursor < end; guard++) {
    const { y, m, d, wday } = localParts(cursor)
    if (wday >= 1 && wday <= 5) {
      const lo = Math.max(start, zonedEpoch(y, m, d, OFFICE_START_HOUR))
      const hi = Math.min(end, zonedEpoch(y, m, d, OFFICE_END_HOUR))
      if (hi > lo) total += hi - lo
    }
    cursor = zonedEpoch(y, m, d + 1, 0) // next local midnight
  }
  return total
}

/**
 * Fraction of **office hours** in the window [since, now] during which the room
 * was occupied, reconstructed from the events log (state changes). Time outside
 * Mon–Fri 08:00–18:00 Europe/Vienna is excluded from both occupied and total.
 */
export async function utilization(
  db: D1Database,
  roomId: string,
  since: number,
  now: number,
): Promise<Utilization> {
  // State entering the window = the last event at or before `since`.
  const prior = await db
    .prepare(
      'SELECT occupied, created_at FROM events WHERE room_id = ? AND created_at <= ? ORDER BY created_at DESC LIMIT 1',
    )
    .bind(roomId, since)
    .first<EventRow>()

  const { results: within } = await db
    .prepare(
      'SELECT occupied, created_at FROM events WHERE room_id = ? AND created_at > ? ORDER BY created_at ASC',
    )
    .bind(roomId, since)
    .all<EventRow>()

  let cursor = since
  let occupiedState = prior ? !!prior.occupied : false
  let occupiedSeconds = 0

  for (const e of within) {
    if (occupiedState) occupiedSeconds += officeSecondsInInterval(cursor, e.created_at)
    cursor = e.created_at
    occupiedState = !!e.occupied
  }
  if (occupiedState) occupiedSeconds += officeSecondsInInterval(cursor, now)

  // Total = office-hours seconds in the window (nights/weekends don't count).
  const totalSeconds = Math.max(1, officeSecondsInInterval(since, now))
  return { occupiedSeconds, totalSeconds, ratio: occupiedSeconds / totalSeconds }
}

export interface HourBucket {
  start: number // unix seconds, start of the hour (UTC)
  occupiedSeconds: number
  totalSeconds: number
}

/**
 * Per-hour occupied/observed seconds across [since, now], reconstructed from the
 * events log. A segment that straddles an hour boundary is split across buckets.
 * The client folds these into local hour-of-day bins for the busy-hours chart.
 */
export async function hourlyUtilization(
  db: D1Database,
  roomId: string,
  since: number,
  now: number,
): Promise<HourBucket[]> {
  const prior = await db
    .prepare(
      'SELECT occupied, created_at FROM events WHERE room_id = ? AND created_at <= ? ORDER BY created_at DESC LIMIT 1',
    )
    .bind(roomId, since)
    .first<EventRow>()

  const { results: within } = await db
    .prepare(
      'SELECT occupied, created_at FROM events WHERE room_id = ? AND created_at > ? ORDER BY created_at ASC',
    )
    .bind(roomId, since)
    .all<EventRow>()

  const HOUR = 3600
  const buckets = new Map<number, { occ: number; total: number }>()
  for (let h = Math.floor(since / HOUR) * HOUR; h < now; h += HOUR) {
    buckets.set(h, { occ: 0, total: 0 })
  }

  const points = [
    { t: since, occ: prior ? !!prior.occupied : false },
    ...within.map((e) => ({ t: e.created_at, occ: !!e.occupied })),
  ]

  for (let i = 0; i < points.length; i++) {
    const segStart = Math.max(points[i].t, since)
    const segEnd = i + 1 < points.length ? points[i + 1].t : now
    if (segEnd <= segStart) continue
    const occ = points[i].occ
    let t = segStart
    while (t < segEnd) {
      const hourStart = Math.floor(t / HOUR) * HOUR
      const chunkEnd = Math.min(segEnd, hourStart + HOUR)
      const bucket = buckets.get(hourStart)
      if (bucket) {
        bucket.total += chunkEnd - t
        if (occ) bucket.occ += chunkEnd - t
      }
      t = chunkEnd
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, v]) => ({ start, occupiedSeconds: v.occ, totalSeconds: v.total }))
}
