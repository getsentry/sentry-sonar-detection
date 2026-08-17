import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll } from 'vitest'

// Apply schema + seed migrations to the test D1 before tests run. With
// isolatedStorage, this seeded state is the per-test baseline and each test's
// writes are rolled back afterwards.
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})
