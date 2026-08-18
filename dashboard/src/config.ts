// Base URL of the Sentry Sonar API.
//
// Empty by default so requests are **relative** (`/rooms`, `/events`): the
// dashboard is served by the same Worker that hosts the API (Workers Static
// Assets), so it's same-origin in production, and Vite's proxy forwards the same
// relative paths to the local Worker in dev (see vite.config.ts). No CORS needed.
//
// Override with the VITE_API_BASE env var if you ever host the SPA elsewhere.
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''

// Sentry DSN for the frontend project (sentry-sonar-frontend). A DSN is public
// by design (it ships in the client bundle), so committing it is fine; override
// with VITE_SENTRY_DSN if needed. Empty string disables Sentry.
export const SENTRY_DSN: string =
  import.meta.env.VITE_SENTRY_DSN ??
  'https://4664a8c502ae2d469dcc32c40206cf1c@o447951.ingest.us.sentry.io/4511926438854656'
