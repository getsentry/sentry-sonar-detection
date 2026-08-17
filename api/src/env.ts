import type { TokenRow } from './types'

export interface Env {
  DB: D1Database
  /**
   * Comma-separated CIDR allowlist for dashboard read routes (see PLAN.md).
   * Provided as a binding — `.dev.vars` locally, a Worker secret in production —
   * so it is never committed. Absent → no IPs allowed (fails closed).
   */
  OFFICE_IP_RANGES?: string
  /** Sentry DSN (Worker secret). */
  SENTRY_DSN?: string
  /**
   * Local-dev only: when "true", bypass the office IP gate. Set in `.dev.vars`,
   * NEVER in production `wrangler.toml` vars.
   */
  ALLOW_INSECURE_LOCAL?: string
}

export interface Variables {
  token: TokenRow
}

export type AppEnv = { Bindings: Env; Variables: Variables }
