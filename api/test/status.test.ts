import { describe, it, expect } from 'vitest'
import { deriveStatus, toRoomView, OFFLINE_AFTER_SECONDS } from '../src/rooms'

const now = 1_000_000
const base = { id: 'urwald', name: 'Urwald', updated_at: now }

describe('deriveStatus', () => {
  it('offline when never seen', () => {
    expect(deriveStatus({ ...base, occupied: 1, last_seen: null }, now)).toBe('offline')
  })
  it('offline when the heartbeat is stale', () => {
    const stale = now - OFFLINE_AFTER_SECONDS - 1
    expect(deriveStatus({ ...base, occupied: 1, last_seen: stale }, now)).toBe('offline')
  })
  it('in_use when recent and occupied', () => {
    expect(deriveStatus({ ...base, occupied: 1, last_seen: now - 5 }, now)).toBe('in_use')
  })
  it('free when recent and not occupied', () => {
    expect(deriveStatus({ ...base, occupied: 0, last_seen: now - 5 }, now)).toBe('free')
  })
  it('exactly at the threshold is still online', () => {
    const edge = now - OFFLINE_AFTER_SECONDS
    expect(deriveStatus({ ...base, occupied: 0, last_seen: edge }, now)).toBe('free')
  })
})

describe('toRoomView', () => {
  it('shapes the client view', () => {
    const view = toRoomView({ ...base, occupied: 1, last_seen: now - 5 }, now)
    expect(view).toEqual({
      id: 'urwald',
      name: 'Urwald',
      status: 'in_use',
      occupied: true,
      lastSeen: now - 5,
    })
  })
})
