import type { Context, MiddlewareHandler } from 'hono'
import type { AppEnv } from './env'
import type { TokenRow } from './types'
import { ipInAllowlist, parseRanges } from './ip'

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time comparison of two equal-length hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function bearer(c: Context): string | null {
  const header = c.req.header('Authorization')
  if (!header) return null
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m ? m[1].trim() : null
}

/** A token may act on a room if it is all-rooms (null) or matches that room. */
export function tokenAllowsRoom(token: TokenRow, roomId: string): boolean {
  return !token.room_id || token.room_id === roomId
}

/**
 * Device auth: validates a per-room bearer token of the form `id.secret`.
 * Enforces the required scope (a `write` token also satisfies `read`). The
 * per-room check is left to the handler, which knows the target room.
 */
export function deviceAuth(scope: 'read' | 'write'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = bearer(c)
    if (!token) return c.json({ error: 'unauthorized' }, 401)

    const dot = token.indexOf('.')
    if (dot <= 0) return c.json({ error: 'unauthorized' }, 401)
    const id = token.slice(0, dot)
    const secret = token.slice(dot + 1)

    const row = await c.env.DB.prepare(
      'SELECT id, token_hash, room_id, scope, revoked FROM api_tokens WHERE id = ?',
    )
      .bind(id)
      .first<TokenRow>()

    if (!row || row.revoked) return c.json({ error: 'unauthorized' }, 401)
    if (!timingSafeEqualHex(await sha256Hex(secret), row.token_hash)) {
      return c.json({ error: 'unauthorized' }, 401)
    }

    // A read-only token cannot perform writes.
    if (scope === 'write' && row.scope !== 'write') {
      return c.json({ error: 'forbidden' }, 403)
    }

    c.set('token', row)
    await next()
    return
  }
}

/**
 * Office IP allowlist for dashboard routes. Matches `CF-Connecting-IP` against
 * the OFFICE_IP_RANGES CIDR list. Fails closed. A documented local-dev bypass
 * (`ALLOW_INSECURE_LOCAL=true` in `.dev.vars`) skips the check for development.
 */
export const officeOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.env.ALLOW_INSECURE_LOCAL === 'true') {
    await next()
    return
  }
  const ip = c.req.header('CF-Connecting-IP')
  if (!ipInAllowlist(ip, parseRanges(c.env.OFFICE_IP_RANGES))) {
    return c.json({ error: 'forbidden' }, 403)
  }
  await next()
  return
}
