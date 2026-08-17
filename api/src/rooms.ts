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
  distanceCm: number | null,
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
        .prepare('INSERT INTO events (room_id, occupied, distance_cm, created_at) VALUES (?, ?, ?, ?)')
        .bind(room.id, occupied ? 1 : 0, distanceCm, now),
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

/**
 * Fraction of the window [since, now] during which the room was occupied,
 * reconstructed from the events log (state changes).
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
    if (occupiedState) occupiedSeconds += e.created_at - cursor
    cursor = e.created_at
    occupiedState = !!e.occupied
  }
  if (occupiedState) occupiedSeconds += now - cursor

  const totalSeconds = Math.max(1, now - since)
  return { occupiedSeconds, totalSeconds, ratio: occupiedSeconds / totalSeconds }
}
