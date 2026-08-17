import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { app } from '../src/index'
import { hourlyUtilization } from '../src/rooms'

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Insert a device token directly into the test D1 and return the plaintext.
async function mint(roomId: string | null, scope: 'read' | 'write'): Promise<string> {
  const id = 'ss_' + Math.random().toString(16).slice(2, 10)
  const secret = 'secret-' + Math.random().toString(16).slice(2)
  await env.DB.prepare(
    'INSERT INTO api_tokens (id, token_hash, room_id, scope, revoked, created_at) VALUES (?, ?, ?, ?, 0, 0)',
  )
    .bind(id, await sha256Hex(secret), roomId, scope)
    .run()
  return `${id}.${secret}`
}

const baseEnv = () => ({ DB: env.DB, OFFICE_IP_RANGES: '', ALLOW_INSECURE_LOCAL: '' })
const officeEnv = () => ({ ...baseEnv(), OFFICE_IP_RANGES: '203.0.113.0/24' })
const bypassEnv = () => ({ ...baseEnv(), ALLOW_INSECURE_LOCAL: 'true' })
const officeHeaders = { 'CF-Connecting-IP': '203.0.113.9' }

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const jsonHeaders = (token: string) => ({ ...auth(token), 'content-type': 'application/json' })

describe('health', () => {
  it('GET / responds ok', async () => {
    const res = await app.request('/', {}, baseEnv())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})

describe('dashboard routes — office IP gate', () => {
  it('rejects a non-office IP', async () => {
    const res = await app.request('/rooms', { headers: {} }, officeEnv())
    expect(res.status).toBe(403)
  })

  it('allows an office IP and lists the 4 seeded rooms (all offline)', async () => {
    const res = await app.request('/rooms', { headers: officeHeaders }, officeEnv())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { rooms: { id: string; status: string }[] }
    expect(body.rooms).toHaveLength(4)
    expect(body.rooms.map((r) => r.id).sort()).toEqual([
      'makava-kingdom',
      'oida',
      'servus',
      'urwald',
    ])
    expect(body.rooms.every((r) => r.status === 'offline')).toBe(true)
  })

  it('local bypass allows access without an office IP', async () => {
    const res = await app.request('/rooms', {}, bypassEnv())
    expect(res.status).toBe(200)
  })
})

describe('device routes — auth', () => {
  it('401 without a token', async () => {
    const res = await app.request('/rooms/urwald', {}, baseEnv())
    expect(res.status).toBe(401)
  })

  it('401 with a bad secret', async () => {
    const token = await mint('urwald', 'read')
    const bad = `${token.split('.')[0]}.wrong`
    const res = await app.request('/rooms/urwald', { headers: auth(bad) }, baseEnv())
    expect(res.status).toBe(401)
  })

  it('200 with a valid room token', async () => {
    const token = await mint('urwald', 'read')
    const res = await app.request('/rooms/urwald', { headers: auth(token) }, baseEnv())
    expect(res.status).toBe(200)
  })

  it('403 when the token is scoped to another room', async () => {
    const token = await mint('urwald', 'read')
    const res = await app.request('/rooms/servus', { headers: auth(token) }, baseEnv())
    expect(res.status).toBe(403)
  })

  it('403 when a read token attempts a write', async () => {
    const token = await mint('urwald', 'read')
    const res = await app.request(
      '/events',
      { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ room_id: 'urwald', occupied: true }) },
      baseEnv(),
    )
    expect(res.status).toBe(403)
  })
})

describe('heartbeat flow', () => {
  it('POST /events marks the room in_use and appends one event', async () => {
    const token = await mint('urwald', 'write')

    const post = await app.request(
      '/events',
      {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({ room_id: 'urwald', occupied: true }),
      },
      baseEnv(),
    )
    expect(post.status).toBe(200)
    expect(await post.json()).toMatchObject({ ok: true, room: { status: 'in_use', occupied: true } })

    const get = await app.request('/rooms/urwald', { headers: auth(token) }, baseEnv())
    expect(((await get.json()) as { status: string }).status).toBe('in_use')

    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE room_id = ?')
      .bind('urwald')
      .first<{ n: number }>()
    expect(row?.n).toBe(1)
  })

  it('does not append a second event when state is unchanged', async () => {
    const token = await mint('urwald', 'write')
    const body = JSON.stringify({ room_id: 'urwald', occupied: true })
    await app.request('/events', { method: 'POST', headers: jsonHeaders(token), body }, baseEnv())
    await app.request('/events', { method: 'POST', headers: jsonHeaders(token), body }, baseEnv())

    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE room_id = ?')
      .bind('urwald')
      .first<{ n: number }>()
    expect(row?.n).toBe(1)
  })

  it('400 when occupied is missing', async () => {
    const token = await mint('urwald', 'write')
    const res = await app.request(
      '/events',
      { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ room_id: 'urwald' }) },
      baseEnv(),
    )
    expect(res.status).toBe(400)
  })

  it('404 for an unknown room (all-rooms token)', async () => {
    const token = await mint(null, 'write')
    const res = await app.request(
      '/events',
      { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ room_id: 'nope', occupied: true }) },
      baseEnv(),
    )
    expect(res.status).toBe(404)
  })
})

describe('stats', () => {
  it('returns a utilization shape with hourly buckets', async () => {
    const res = await app.request('/rooms/urwald/stats', { headers: officeHeaders }, officeEnv())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { room: string; hours: number; ratio: number; buckets: unknown[] }
    expect(body).toMatchObject({ room: 'urwald', hours: 24 })
    expect(typeof body.ratio).toBe('number')
    expect(Array.isArray(body.buckets)).toBe(true)
  })
})

describe('hourlyUtilization', () => {
  it('attributes occupied time to the correct hour bucket', async () => {
    const H = 1_800_000 // hour-aligned unix second
    // occupied from H+600 to H+1200 (600s) within hour H
    await env.DB.prepare('INSERT INTO events (room_id, occupied, created_at) VALUES (?, 1, ?)')
      .bind('urwald', H + 600)
      .run()
    await env.DB.prepare('INSERT INTO events (room_id, occupied, created_at) VALUES (?, 0, ?)')
      .bind('urwald', H + 1200)
      .run()

    const buckets = await hourlyUtilization(env.DB, 'urwald', H, H + 3600)
    expect(buckets).toHaveLength(1)
    expect(buckets[0]).toEqual({ start: H, occupiedSeconds: 600, totalSeconds: 3600 })
  })

  it('splits a segment across hour boundaries', async () => {
    const H = 1_800_000
    // occupied starting mid-first-hour, spanning into the next hour
    await env.DB.prepare('INSERT INTO events (room_id, occupied, created_at) VALUES (?, 1, ?)')
      .bind('servus', H + 3000)
      .run()
    const buckets = await hourlyUtilization(env.DB, 'servus', H, H + 7200)
    expect(buckets).toHaveLength(2)
    expect(buckets[0]).toMatchObject({ start: H, occupiedSeconds: 600 }) // H+3000..H+3600
    expect(buckets[1]).toMatchObject({ start: H + 3600, occupiedSeconds: 3600 }) // full 2nd hour
  })
})
