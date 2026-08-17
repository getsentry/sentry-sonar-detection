import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// Run tests inside the workerd runtime with a real (local) D1 binding, so auth,
// routing and SQL are all exercised for real. Migrations are read here and
// applied before each test file (see test/apply-migrations.ts).
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = fileURLToPath(new URL('./migrations', import.meta.url))
      const migrations = await readD1Migrations(migrationsPath)
      return {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
})
