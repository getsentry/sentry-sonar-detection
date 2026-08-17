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

export async function fetchRooms(signal?: AbortSignal): Promise<RoomsResponse> {
  const res = await fetch(`${API_BASE}/rooms`, { signal })
  if (!res.ok) throw new Error(`API returned ${res.status}`)
  return (await res.json()) as RoomsResponse
}
