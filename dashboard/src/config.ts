// Base URL of the Sentry Sonar API.
//
// - Dev: left empty so requests are relative (`/rooms`, `/events`) and Vite's
//   proxy forwards them to the local Worker (see vite.config.ts).
// - Prod: the deployed Worker on workers.dev.
//
// Override either with the VITE_API_BASE env var.
//
// NOTE: in production the dashboard (pages.dev) calls this API cross-origin, so
// the API's dashboard routes will need CORS headers for the dashboard origin —
// to wire up when the dashboard fetch layer lands (phase ④).
export const API_BASE: string =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.PROD ? 'https://sentry-sonar-api.francesconovy.workers.dev' : '')
