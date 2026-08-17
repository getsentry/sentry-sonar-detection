import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './index.css'

// NOTE: Sentry (@sentry/react v11 alpha) init is intentionally not wired yet.
// Add Sentry.init(...) here per PLAN.md → Observability, verifying the exact
// options against the repo MIGRATION.md at implementation time.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
