# Sentry Sonar — API

Cloudflare Worker ([Hono](https://hono.dev/)) backed by [D1](https://developers.cloudflare.com/d1/).
It ingests presence heartbeats from the sensor nodes and serves room status to
the e-ink displays and the dashboard. See [`../PLAN.md`](../PLAN.md) for the
overall design.

## Endpoints

| Method | Path | Caller | Auth |
|---|---|---|---|
| `GET` | `/` | anyone | none (health check) |
| `POST` | `/events` | sensor node | device token — **write**, that room |
| `GET` | `/rooms/:id` | display node | device token — **read**, that room |
| `GET` | `/rooms` | dashboard | office IP allowlist |
| `GET` | `/rooms/:id/stats` | dashboard | office IP allowlist |

A room's `status` is **derived**, not stored:

- `offline` — no heartbeat within 90s (`OFFLINE_AFTER_SECONDS`), or never seen.
- `in_use` — a recent heartbeat with `occupied: true`.
- `free` — a recent heartbeat with `occupied: false`.

### `GET /` — health

```console
$ curl https://<worker>/
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
$ curl -X POST https://<worker>/events \
    -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d '{"room_id":"urwald","occupied":true}'
{"ok":true,"room":{"id":"urwald","name":"Urwald","status":"in_use","occupied":true,"lastSeen":1786957010}}
```

Errors: `400` invalid body · `401` bad/missing token · `403` token not allowed
for that room, or a read-only token · `404` unknown room.

### `GET /rooms/:id` — single room (display node)

Tiny payload for the e-ink display. Auth: a **read** (or write) token for that room.

```console
$ curl https://<worker>/rooms/urwald -H "Authorization: Bearer $TOKEN"
{"id":"urwald","name":"Urwald","status":"in_use","occupied":true,"lastSeen":1786957010}
```

### `GET /rooms` — all rooms (dashboard)

```console
$ curl https://<worker>/rooms
{"now":1786957010,"rooms":[
  {"id":"makava-kingdom","name":"Makava Kingdom","status":"offline","occupied":false,"lastSeen":null},
  {"id":"servus","name":"Servus","status":"offline","occupied":false,"lastSeen":null},
  {"id":"urwald","name":"Urwald","status":"in_use","occupied":true,"lastSeen":1786957010},
  {"id":"wednesday","name":"Wednesday","status":"offline","occupied":false,"lastSeen":null}
]}
```

### `GET /rooms/:id/stats` — utilization

Fraction of the window the room was occupied, reconstructed from the event log.
Query: `hours` (default `24`, max `720`).

```console
$ curl "https://<worker>/rooms/urwald/stats?hours=24"
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
`CF-Connecting-IP`. Fails closed. For local dev, set `ALLOW_INSECURE_LOCAL=true`
in `.dev.vars` to bypass the gate (never set it in production).

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

## Deploy

```sh
wrangler d1 create sentry_sonar          # paste the id into wrangler.toml
pnpm --filter api db:migrate             # migrate the remote D1
wrangler secret put SENTRY_DSN           # + any other secrets
# set OFFICE_IP_RANGES (real office CIDRs) in wrangler.toml [vars]
pnpm --filter api deploy
```

Then mint production tokens with `node scripts/mint-token.mjs <room> <scope>`
using the `--remote` INSERT.

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
