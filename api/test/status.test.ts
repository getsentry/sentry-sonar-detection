import { describe, it, expect } from 'vitest'
import {
  deriveStatus,
  toRoomView,
  OFFLINE_AFTER_SECONDS,
  officeSecondsInInterval,
} from '../src/rooms'

// Vienna is CEST (UTC+2) in August, so local hour h = UTC hour h-2.
const vie = (y: number, mo: number, d: number, h: number) =>
  Date.UTC(y, mo - 1, d, h - 2, 0, 0) / 1000

describe('officeSecondsInInterval (Mon–Fri 08:00–18:00 Europe/Vienna)', () => {
  it('counts 10h for a full weekday', () => {
    expect(officeSecondsInInterval(vie(2026, 8, 17, 0), vie(2026, 8, 18, 0))).toBe(10 * 3600)
  })
  it('counts 0 for a weekend day', () => {
    expect(officeSecondsInInterval(vie(2026, 8, 15, 0), vie(2026, 8, 16, 0))).toBe(0) // Sat
  })
  it('counts only the in-window part when spanning the 08:00 boundary', () => {
    expect(officeSecondsInInterval(vie(2026, 8, 17, 6), vie(2026, 8, 17, 10))).toBe(2 * 3600)
  })
  it('counts an interval fully inside office hours', () => {
    expect(officeSecondsInInterval(vie(2026, 8, 17, 10), vie(2026, 8, 17, 12))).toBe(2 * 3600)
  })
  it('excludes the weekend from a Fri→Mon span (Fri 10:00 → Mon 10:00 = 8h + 2h)', () => {
    // Fri 2026-08-14 10:00 → Mon 2026-08-17 10:00: Fri 10–18 (8h) + Mon 08–10 (2h)
    expect(officeSecondsInInterval(vie(2026, 8, 14, 10), vie(2026, 8, 17, 10))).toBe(10 * 3600)
  })
})

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
