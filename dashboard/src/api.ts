import { API_BASE } from './config'

/** Thrown on a non-OK API response; carries the HTTP status for handling. */
export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API returned ${status}`)
    this.name = 'ApiError'
  }
}

/** Shown when the API returns 403 — the office IP allowlist rejected the caller. */
export const OFFICE_ONLY_MESSAGE =
  'This dashboard can only be viewed from inside the Sentry Vienna office Wi‑Fi.'

/**
 * Turn a caught fetch error into a user-facing banner. A 403 is the office IP
 * gate, shown as a friendly `notice`; anything else is a real `error`.
 */
export function describeError(e: unknown): { message: string; notice: boolean } {
  if (e instanceof ApiError && e.status === 403) return { message: OFFICE_ONLY_MESSAGE, notice: true }
  const detail = e instanceof Error ? e.message : 'failed to load'
  return { message: `Can’t reach the API: ${detail}`, notice: false }
}

export type RoomStatus = 'in_use' | 'free' | 'offline'

export interface Room {
  id: string
  name: string | null
  status: RoomStatus
  occupied: boolean
  lastSeen: number | null
}

export interface RoomsResponse {
  now: number
  rooms: Room[]
}

export interface HourBucket {
  start: number // unix seconds, start of the hour (UTC)
  occupiedSeconds: number
  totalSeconds: number
}

export interface RoomStats {
  room: string
  hours: number
  occupiedSeconds: number
  totalSeconds: number
  ratio: number
  buckets: HourBucket[]
}

export async function fetchRooms(signal?: AbortSignal): Promise<RoomsResponse> {
  const res = await fetch(`${API_BASE}/rooms`, { signal })
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as RoomsResponse
}

export async function fetchRoomStats(
  id: string,
  hours: number,
  signal?: AbortSignal,
): Promise<RoomStats> {
  const res = await fetch(
    `${API_BASE}/rooms/${encodeURIComponent(id)}/stats?hours=${hours}`,
    { signal },
  )
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as RoomStats
}
