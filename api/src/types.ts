export interface RoomRow {
  id: string
  name: string | null
  occupied: number // 0 / 1
  last_seen: number | null // unix seconds
  updated_at: number | null
}

export type RoomStatus = 'in_use' | 'free' | 'offline'

export interface RoomView {
  id: string
  name: string | null
  status: RoomStatus
  occupied: boolean
  lastSeen: number | null
}

export interface TokenRow {
  id: string
  token_hash: string
  room_id: string | null // null = all rooms
  scope: 'read' | 'write'
  revoked: number
}
