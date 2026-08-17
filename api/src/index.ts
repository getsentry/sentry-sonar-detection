import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './env'
import { deviceAuth, officeOnly, tokenAllowsRoom } from './auth'
import {
  applyHeartbeat,
  getRoom,
  listRooms,
  nowSec,
  toRoomView,
  utilization,
} from './rooms'

const app = new Hono<AppEnv>()

// Allow the browser dashboard to read cross-origin. Read routes stay IP-gated —
// CORS only lets the browser *read* the response; it is not an access control.
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }),
)

// Health check.
app.get('/', (c) => c.json({ service: 'sentry-sonar-api', ok: true }))

// --- Device routes — per-room bearer token (see PLAN.md → Authentication) ---

// Sensor heartbeat / state. Auth: WRITE scope, that room.
app.post('/events', deviceAuth('write'), async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }

  const b = body as Record<string, unknown>
  const roomId = typeof b.room_id === 'string' ? b.room_id : null
  if (!roomId) return c.json({ error: 'room_id_required' }, 400)
  if (typeof b.occupied !== 'boolean') return c.json({ error: 'occupied_must_be_boolean' }, 400)

  if (!tokenAllowsRoom(c.get('token'), roomId)) return c.json({ error: 'forbidden' }, 403)

  const room = await getRoom(c.env.DB, roomId)
  if (!room) return c.json({ error: 'unknown_room' }, 404)

  const updated = await applyHeartbeat(c.env.DB, room, b.occupied)
  return c.json({ ok: true, room: toRoomView(updated, nowSec()) })
})

// Single room status for the e-ink display. Auth: READ scope, that room.
app.get('/rooms/:id', deviceAuth('read'), async (c) => {
  const id = c.req.param('id')
  if (!tokenAllowsRoom(c.get('token'), id)) return c.json({ error: 'forbidden' }, 403)

  const room = await getRoom(c.env.DB, id)
  if (!room) return c.json({ error: 'not_found' }, 404)
  return c.json(toRoomView(room, nowSec()))
})

// --- Dashboard routes — office IP allowlist (see PLAN.md → Authentication) ---

// All rooms + status for the overview dashboard.
app.get('/rooms', officeOnly, async (c) => {
  const now = nowSec()
  const rooms = await listRooms(c.env.DB)
  return c.json({ now, rooms: rooms.map((r) => toRoomView(r, now)) })
})

// Utilization over the last N hours (default 24, max 720).
app.get('/rooms/:id/stats', officeOnly, async (c) => {
  const id = c.req.param('id')
  const room = await getRoom(c.env.DB, id)
  if (!room) return c.json({ error: 'not_found' }, 404)

  const hours = Math.min(720, Math.max(1, Math.floor(Number(c.req.query('hours')) || 24)))
  const now = nowSec()
  const stats = await utilization(c.env.DB, id, now - hours * 3600, now)
  return c.json({ room: id, hours, ...stats })
})

// NOTE: Sentry (@sentry/cloudflare v11 alpha) wrapping is intentionally not wired
// yet. Add it per PLAN.md → Observability, verifying the exact withSentry API
// against the repo MIGRATION.md at implementation time (alpha is a moving target).
export default app
