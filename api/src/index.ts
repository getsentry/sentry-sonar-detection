import { Hono } from 'hono'

export interface Env {
  DB: D1Database
  /** Comma-separated CIDR allowlist for dashboard read routes (see PLAN.md). */
  OFFICE_IP_RANGES: string
  /** Sentry DSN (Worker secret). */
  SENTRY_DSN?: string
}

const app = new Hono<{ Bindings: Env }>()

// Health check.
app.get('/', (c) => c.json({ service: 'sentry-sonar-api', ok: true }))

// --- Device routes — per-room bearer token (see PLAN.md → Authentication) ---

// Sensor heartbeat / state. Auth: WRITE scope, that room.
app.post('/events', async (c) => {
  // TODO(auth): verify per-room WRITE device token from `Authorization: Bearer`.
  // TODO: upsert rooms state + append an events row on state change.
  return c.json({ error: 'not_implemented' }, 501)
})

// Single room status for the e-ink display. Auth: READ scope, that room.
app.get('/rooms/:id', async (c) => {
  // TODO(auth): verify per-room READ device token.
  // TODO: return derived status (offline/unknown if last_seen older than ~90s).
  return c.json({ error: 'not_implemented' }, 501)
})

// --- Dashboard routes — office IP allowlist (see PLAN.md → Authentication) ---

// All rooms + status for the overview dashboard.
app.get('/rooms', async (c) => {
  // TODO(auth): office IP allowlist via `CF-Connecting-IP` against OFFICE_IP_RANGES.
  return c.json({ error: 'not_implemented' }, 501)
})

// Utilization over time (later phase).
app.get('/rooms/:id/stats', async (c) => {
  // TODO(auth): office IP allowlist. TODO: aggregate from events.
  return c.json({ error: 'not_implemented' }, 501)
})

// NOTE: Sentry (@sentry/cloudflare v11 alpha) wrapping is intentionally not wired
// yet. Add it per PLAN.md → Observability, verifying the exact withSentry API
// against the repo MIGRATION.md at implementation time (alpha is a moving target).
export default app
