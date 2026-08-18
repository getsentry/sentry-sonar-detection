# Sentry Sonar — API

Cloudflare Worker ([Hono](https://hono.dev/)) backed by [D1](https://developers.cloudflare.com/d1/).
It ingests presence heartbeats from the sensor nodes and serves room status to
the e-ink displays and the dashboard. See [`../PLAN.md`](../PLAN.md) for the
overall design.

**Deployed at:** <https://sentry-sonar-api.francesconovy.workers.dev>

## Endpoints

| Method | Path | Caller | Auth |
|---|---|---|---|
| `GET` | `/healthz` | anyone | none (health check) |
| `POST` | `/events` | sensor node | device token — **write**, that room |
| `GET` | `/rooms/:id` | display node | device token — **read**, that room |
| `GET` | `/rooms` | dashboard | office IP allowlist |
| `GET` | `/rooms/:id/stats` | dashboard | office IP allowlist |

This same Worker also **serves the dashboard SPA** as static assets (Workers Static
Assets): the API paths above are listed under `run_worker_first` in `wrangler.jsonc`
so they always reach the Worker, and every other path (`/`, `/room-details/:id`,
`/assets/*`, …) is served from the built dashboard, with an `index.html` SPA
fallback. Same origin, so no CORS.

A room's `status` is **derived**, not stored:

- `offline` — no heartbeat within 90s (`OFFLINE_AFTER_SECONDS`), or never seen.
- `in_use` — a recent heartbeat with `occupied: true`.
- `free` — a recent heartbeat with `occupied: false`.

### `GET /healthz` — health

(`/` serves the dashboard SPA, so the health check lives at `/healthz`.)

```console
$ curl https://sentry-sonar-api.francesconovy.workers.dev/healthz
{"service":"sentry-sonar-api","ok":true}
```

### `POST /events` — sensor heartbeat

Send every ~15s. The current room state is upserted; a row is appended to the
event log **only when the occupied state changes** (keeps history compact).

Headers: `Authorization: Bearer <write-token>`, `Content-Type: application/json`

Body:

| field | type | required | notes |
|---|---|---|---|
| `room_id` | string | yes | must match the token's room |
| `occupied` | boolean | yes | radar presence (LD2410C `OUT` pin) |

```console
$ curl -X POST https://sentry-sonar-api.francesconovy.workers.dev/events \
    -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d '{"room_id":"urwald","occupied":true}'
{"ok":true,"room":{"id":"urwald","name":"Urwald","status":"in_use","occupied":true,"lastSeen":1786957010}}
```

Errors: `400` invalid body · `401` bad/missing token · `403` token not allowed
for that room, or a read-only token · `404` unknown room.

### `GET /rooms/:id` — single room (display node)

Tiny payload for the e-ink display. Auth: a **read** (or write) token for that room.

```console
$ curl https://sentry-sonar-api.francesconovy.workers.dev/rooms/urwald -H "Authorization: Bearer $TOKEN"
{"id":"urwald","name":"Urwald","status":"in_use","occupied":true,"lastSeen":1786957010}
```

### `GET /rooms` — all rooms (dashboard)

```console
$ curl https://sentry-sonar-api.francesconovy.workers.dev/rooms
{"now":1786957010,"rooms":[
  {"id":"makava-kingdom","name":"Makava Kingdom","status":"offline","occupied":false,"lastSeen":null},
  {"id":"servus","name":"Servus","status":"offline","occupied":false,"lastSeen":null},
  {"id":"urwald","name":"Urwald","status":"in_use","occupied":true,"lastSeen":1786957010},
  {"id":"wednesday","name":"Wednesday","status":"offline","occupied":false,"lastSeen":null}
]}
```

### `GET /rooms/:id/stats` — utilization

Fraction of **office hours** (Mon–Fri 08:00–18:00 Europe/Vienna) the room was
occupied, reconstructed from the event log — nights and weekends are excluded from
both `occupiedSeconds` and `totalSeconds`. Query: `hours` (default `24`, max `720`).

```console
$ curl "https://sentry-sonar-api.francesconovy.workers.dev/rooms/urwald/stats?hours=24"
{"room":"urwald","hours":24,"occupiedSeconds":5400,"totalSeconds":86400,"ratio":0.0625}
```

## Authentication

Two mechanisms for two very different callers (full rationale in `../PLAN.md`).

**Device tokens (sensor + display nodes).** Opaque bearer tokens of the form
`id.secret`, each scoped to one room and one action (`read`/`write`). Only the
SHA-256 hash of the secret is stored in the `api_tokens` table; a `write` token
also satisfies `read`. Sent as `Authorization: Bearer <token>`.

**Office IP allowlist (dashboard).** `GET /rooms` and `/rooms/:id/stats` are
gated by `OFFICE_IP_RANGES` (comma-separated CIDRs, IPv4 + IPv6) matched against
`CF-Connecting-IP`. Fails closed. It's supplied as a **binding**, not committed:
`.dev.vars` locally, a Worker **secret** (`wrangler secret put OFFICE_IP_RANGES`)
in production. For local dev you can instead set `ALLOW_INSECURE_LOCAL=true` in
`.dev.vars` to bypass the gate entirely (never set it in production).

## Local development

```sh
export VOLTA_FEATURE_PNPM=1              # once per shell (see repo README)

cp .dev.vars.example .dev.vars           # local secrets + ALLOW_INSECURE_LOCAL
pnpm --filter api db:migrate:local       # create + migrate the local D1
pnpm --filter api dev                    # wrangler dev on http://localhost:8787
```

Mint a device token and register its hash in the local D1:

```sh
node scripts/mint-token.mjs urwald write
# prints the token once + a `wrangler d1 execute ... --local` INSERT to run
```

Then exercise it:

```sh
TOKEN=<the printed token>
curl -X POST localhost:8787/events -H "Authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"room_id":"urwald","occupied":true}'
curl localhost:8787/rooms          # ALLOW_INSECURE_LOCAL bypasses the IP gate
```

## Testing

Tests run inside the Workers runtime with a real local D1
([`@cloudflare/vitest-pool-workers`](https://developers.cloudflare.com/workers/testing/vitest-integration/)):
`ip`/`status` unit tests plus full route + auth + D1 integration tests.

```sh
pnpm --filter api test
```

## Deploy & operate

`wrangler` below is the api workspace's binary — run each from the repo root as
`pnpm --filter api exec wrangler …`, or drop the prefix from inside `api/`.
`deploy` needs `pnpm … run deploy` (it's a reserved pnpm subcommand).

**The Worker also serves the dashboard** (`assets` in `wrangler.jsonc` →
`../dashboard/dist`), so the SPA must be **built before deploying**. The easiest path
is the root **`pnpm run deploy`**, which runs `dashboard build` then `api run deploy`.

### First-time deploy

```sh
wrangler login                                   # authenticate (opens a browser)
wrangler d1 create sentry_sonar                  # → copy the printed database_id
# paste that id into api/wrangler.jsonc:  "database_id": "…"
pnpm --filter api db:migrate                     # apply schema + seed to the remote D1
pnpm run deploy                                       # (from repo root) build dashboard + deploy Worker
wrangler secret put OFFICE_IP_RANGES             # office CIDRs, e.g. 203.0.113.0/29
```

Deployed at <https://sentry-sonar-api.francesconovy.workers.dev>. First deploy on
a fresh account prompts you to pick a free `workers.dev` subdomain.

### Update the Worker (after code changes)

```sh
pnpm --filter api test && pnpm --filter api typecheck
pnpm run deploy   # (from repo root) rebuilds the dashboard + redeploys the Worker
```

(If you only changed the Worker and the dashboard `dist` is current, `pnpm --filter
api run deploy` alone works too.)

### Change a secret / the office allowlist

Secrets apply immediately (a new version, no redeploy). Re-run to change a value:

```sh
wrangler secret put OFFICE_IP_RANGES             # replace the office CIDRs
wrangler secret list
wrangler secret delete OFFICE_IP_RANGES
```

### Change the database schema

Add a **new** migration (never edit an already-applied one), then apply it
local → remote:

```sh
# create api/migrations/0003_<name>.sql
pnpm --filter api db:migrate:local               # apply to the local dev DB
pnpm --filter api db:migrate                     # apply to the remote DB
```

Ad-hoc SQL: `wrangler d1 execute sentry_sonar --remote --command "…"` (use
`--local` for the dev DB).

### Manage device tokens

```sh
# mint (prints the token once + an INSERT statement):
node scripts/mint-token.mjs urwald write
wrangler d1 execute sentry_sonar --remote --command "<the INSERT it printed>"

# list:
wrangler d1 execute sentry_sonar --remote \
  --command "SELECT id, room_id, scope, label, revoked FROM api_tokens;"

# revoke (takes effect immediately):
wrangler d1 execute sentry_sonar --remote \
  --command "UPDATE api_tokens SET revoked=1 WHERE id='ss_xxxx';"
```

### Logs & rollback

```sh
wrangler tail                                    # live request logs
wrangler deployments list                        # deployment history
wrangler rollback                                # revert to the previous version
```

## Layout

```
src/
  index.ts    routes
  auth.ts     device-token + office-IP middleware
  rooms.ts    DB helpers, derived status, heartbeat, utilization
  ip.ts       CIDR matching (IPv4 + IPv6)
  types.ts    shared row/view types
  env.ts      bindings + Hono generics
migrations/   D1 schema (0001) + room seed (0002)
scripts/      mint-token.mjs
test/         vitest (unit + integration)
```
