import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import * as Sentry from '@sentry/react'
import App from './App'
import { SENTRY_DSN } from './config'
import './index.css'

// Sentry (@sentry/react v11). The DSN is public (client-side); empty = disabled.
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1.0,
    // Attach sentry-trace / baggage headers to these requests so the frontend
    // trace connects to the API trace. The API allows these headers via CORS.
    tracePropagationTargets: [
      'localhost',
      /^\//, // same-origin (dev proxy)
      /^https:\/\/sentry-sonar-api\.francesconovy\.workers\.dev/,
    ],
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<p style={{ padding: '2rem' }}>Something went wrong.</p>}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
