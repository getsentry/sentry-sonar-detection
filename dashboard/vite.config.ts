import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API calls to the local Worker during dev (adjust port if needed).
    proxy: {
      '/rooms': 'http://localhost:8787',
      '/events': 'http://localhost:8787',
    },
  },
})
