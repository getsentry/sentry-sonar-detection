import * as Sentry from '@sentry/cloudflare'
import { Hono } from 'hono'
import type { AppEnv, Env } from './env'
import { deviceAuth, officeOnly, tokenAllowsRoom } from './auth'
import {
  applyHeartbeat,
  getRoom,
  hourlyUtilization,
  listRooms,
  nowSec,
  toRoomView,
  utilization,
} from './rooms'

const app = new Hono<AppEnv>()

// The dashboard SPA is served by this same Worker via Workers Static Assets
// (same origin), so no CORS is needed. `/` serves the dashboard's index.html;
// the health check lives at /healthz. The API paths below are marked
// `run_worker_first` in wrangler.jsonc so they always reach the Worker; every
// other path falls through to the static assets / SPA fallback.

// Health check.
app.get('/healthz', (c) => c.json({ service: 'sentry-sonar-api', ok: true }))

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
  const since = now - hours * 3600
  const stats = await utilization(c.env.DB, id, since, now)
  const buckets = await hourlyUtilization(c.env.DB, id, since, now)
  return c.json({ room: id, hours, ...stats, buckets })
})

// Exported for tests, which drive the router directly via app.request().
export { app }

// Wrap the Worker with Sentry (@sentry/cloudflare v11). The DSN comes from the
// SENTRY_DSN secret; with no DSN (e.g. local dev) Sentry is a no-op. D1 is
// auto-instrumented via env.
export default Sentry.withSentry<Env>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  } satisfies ExportedHandler<Env>,
)
