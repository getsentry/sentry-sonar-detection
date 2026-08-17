import { API_BASE } from './config'

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
  if (!res.ok) throw new Error(`API returned ${res.status}`)
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
  if (!res.ok) throw new Error(`API returned ${res.status}`)
  return (await res.json()) as RoomStats
}
