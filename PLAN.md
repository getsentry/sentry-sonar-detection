# Sentry Sonar — Implementation Plan

**Sentry Sonar** is a meeting-room occupancy system. Radar sensors detect human
presence in each room and report to a Cloudflare Workers API. Two consumers read
that data: e-ink displays on each room door showing **FREE / IN USE**, and a web
dashboard giving an overview of all rooms and how they're used.

- **Sentry** — stands watch over the room.
- **Sonar** — the radar sensing presence.

## Scope

- **4 meeting rooms:** Makava Kingdom, Urwald, Wednesday, Servus
  (ids `makava-kingdom`, `urwald`, `wednesday`, `servus`).
- **4 full room kits** (4 of each device).

## Hardware (per room)

| Component | Role |
|---|---|
| Waveshare ESP32-S3 1.54" E-Paper (200×200, battery) | **Display node** — the sign on the door |
| LD2410C 24GHz radar (FMCW, 5m, UART/GPIO) | **Presence sensor** |
| Freenove ESP32-S3 Lite | **Sensor node** MCU (hosts the radar) |
| USB-C 25W charger | Mains power for the always-on sensor node |
| Mini breadboard + M-F jumper wires | Wiring radar → ESP32 |

## Architecture

Two nodes per room — each does the job its power source suits:

- **Sensor node** = Freenove ESP32-S3 + LD2410C radar, **mains-powered**.
  Always-on, senses continuously, POSTs presence heartbeats to the API.
- **Display node** = Waveshare e-paper, **battery-powered**. Deep-sleeps, wakes
  every 30–60s, polls the API, redraws only when the state changes.

Radar presence detection wants to be always on; e-ink wants to sleep and sip
power. Splitting the roles across two devices lets each do what it's good at,
keeps the battery display alive for weeks, and keeps sensing reliable.

*(All-in-one Waveshare — sense + display on one plugged-in device — is kept as a
fallback for a single demo room. Firmware stays modular so it's a small change.)*

```
  MEETING ROOM                          CLOUDFLARE                    CONSUMERS
 ┌─────────────────────┐
 │ Sensor node         │   POST /events    ┌──────────────┐
 │ Freenove + LD2410C  │ ───────────────►  │              │
 │ (mains power)       │   {occupied}      │   Workers    │   GET /rooms/:id
 └─────────────────────┘                   │     API      │ ◄──────────────┐
                                           │   (Hono)     │                │
 ┌─────────────────────┐   GET /rooms/:id  │              │        ┌───────────────┐
 │ Display node        │ ◄──────────────►  │   + D1       │        │ Display node  │
 │ Waveshare e-paper   │   {status}        │  (state +    │        │ (same room)   │
 │ (battery, sleeps)   │                   │   history)   │        └───────────────┘
 └─────────────────────┘                   └──────────────┘
                                                   ▲
                                                   │ GET /rooms
                                           ┌──────────────┐
                                           │ Pages UI     │  overview dashboard
                                           │ React + Vite │
                                           └──────────────┘
```

## Cloudflare stack

- **Workers** — the API, using **Hono** (tiny router built for Workers).
- **D1** (SQLite) — single data store. Holds current room state **and** an event
  log. The event log powers "how rooms are used" (utilization %, busy hours) on
  the dashboard, so we capture history from day one. No KV / Durable Objects
  needed for this scope.
- **Pages** — the dashboard, a **React + Vite** app using **simple polling**
  (refresh `/rooms` every 5–10s). Plenty live enough for the demo; no WebSockets.

**Free tier, no custom domain.** Everything runs on the free Cloudflare
hostnames: dashboard at `*.pages.dev`, API at `*.workers.dev`. This shapes the
auth design (see Authentication) — notably, zone-level WAF rules aren't available
on `workers.dev`, so gating is done in Worker code.

## Observability — Sentry SDK (v11 alpha)

Both the backend (Cloudflare Worker) and the frontend (React dashboard) are
instrumented with the **Sentry SDK**, pinned to the **v11 alpha**. *(This is the
Sentry error-monitoring SDK — unrelated to the project name. Naming collision is
just a happy coincidence.)*

**Important:** v11 is pre-release, so we follow the migration guide **straight
from the repository** — `getsentry/sentry-javascript` `MIGRATION.md` on the
`develop` branch — **not** the published docs, which still describe stable v10.

### Versions & install

v11 alpha is published under the **`next`** dist-tag (there is no `alpha` tag):

```sh
# backend (Cloudflare Worker)
npm install --workspace api @sentry/cloudflare@next          # 11.0.0-alpha.1

# frontend (React dashboard)
npm install --workspace dashboard @sentry/react@next         # 11.0.0-alpha.1
```

### Backend — `@sentry/cloudflare` v11 setup notes

- **`wrangler.toml` requires `nodejs_compat`** (v11 replaced `nodejs_als`):
  ```diff
  - compatibility_flags = ["nodejs_als"]
  + compatibility_flags = ["nodejs_compat"]
  ```
- Wrap the Worker with `withSentry` (or use the Cloudflare Vite plugin, which
  **auto-instruments the Worker by default** in v11).
- `wrapRequestHandler` now lives under the **`@sentry/cloudflare/request`**
  subpath.
- **D1 is auto-instrumented via `env`** — the old `instrumentD1WithSentry` helper
  was removed, so our D1 queries get traced for free.
- DSN supplied via a Worker **secret/env var** (`SENTRY_DSN`).

> Verify each of these against `MIGRATION.md` in the repo at build time — the
> alpha is a moving target.

## Data model

```sql
rooms (
  id          TEXT PRIMARY KEY,   -- e.g. "room-a"
  name        TEXT,               -- "Room A"
  occupied    INTEGER,            -- 0 / 1
  last_seen   INTEGER,            -- unix seconds of last heartbeat
  updated_at  INTEGER
)

events (                          -- append-only history for analytics
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id     TEXT,
  occupied    INTEGER,
  distance_cm INTEGER,            -- optional, when using radar UART
  created_at  INTEGER
)

api_tokens (                      -- device auth (see Authentication section)
  id          TEXT PRIMARY KEY,   -- public token id / prefix, e.g. "ss_a1b2c3"
  token_hash  TEXT NOT NULL,      -- SHA-256 of the secret; plaintext never stored
  room_id     TEXT,               -- scoped room, or NULL/"*" for all-rooms
  scope       TEXT NOT NULL,      -- 'read' | 'write'
  label       TEXT,               -- "room-a sensor", "room-a display"
  revoked     INTEGER DEFAULT 0,
  created_at  INTEGER
)
```

## Occupancy logic

- Sensor sends a **heartbeat every ~15s** with `occupied: true/false`.
- Server **upserts** the room's current state and **appends an event on state
  change** (keeps the history compact).
- Derived status for consumers:
  - `last_seen` older than **~90s** → **`offline/unknown`** (a dead sensor must
    not show a stale "free").
  - else `occupied` → **IN USE**, else **FREE**.

## API surface

| Method | Route | Caller | Auth | Purpose |
|---|---|---|---|---|
| `POST` | `/events` | sensor node | device token — **write**, that room | heartbeat / state |
| `GET` | `/rooms/:id` | display node | device token — **read**, that room | one room's derived status |
| `GET` | `/rooms` | dashboard | **office IP allowlist** (in Worker) | all rooms + status |
| `GET` | `/rooms/:id/stats` | dashboard | **office IP allowlist** (in Worker) | utilization over time (later) |

See the next section for how each auth type works.

## Authentication & authorization

Two callers with very different trust models, so two mechanisms:

- **IoT devices** are headless and long-lived → **per-room, per-scope bearer
  tokens** we issue and store ourselves.
- **The dashboard** is used by humans and must not be queryable by other
  services/pages → **Cloudflare Access (Zero Trust SSO)**, no app-managed
  passwords.

### Device tokens (sensor + display nodes)

Opaque random bearer tokens, each scoped to **one room** and **one action**:

| Device | Scope | Room | Can do |
|---|---|---|---|
| Room A sensor | `write` | `room-a` | `POST /events` for room-a only |
| Room A display | `read` | `room-a` | `GET /rooms/room-a` only |
| …×4 rooms | | | 8 tokens total |

**How it works:**

1. Generate a random secret per device, e.g. `ss_room-a_<32 random bytes>`. The
   `ss_room-a_` prefix is the public **id**; the rest is the secret.
2. Store only the **SHA-256 hash** in `api_tokens` (plaintext never hits the DB).
   Flash the full secret into each device's config (NVS / build-time define).
3. A Hono middleware on device routes: read `Authorization: Bearer <token>`,
   split off the id, look up the row by id, `sha256(secret) === token_hash`,
   check `revoked = 0`, then enforce **scope** (read vs. write) and that
   `room_id` matches the `:id` / body room. Reject → `401`/`403`.

**Why this over signed JWTs:** with only 8 devices, a tiny D1 lookup table is
less code, instantly **revocable** (flip `revoked`), and trivial to reason about.
No key rotation or token-expiry machinery to build. Enforcing "this exact room,
this one action" is a two-field check.

### Dashboard auth — office IP allowlist (free tier, no custom domain)

We're staying on **free Cloudflare hostnames** — dashboard on `*.pages.dev`, API
on `*.workers.dev` — with **no custom domain**. That rules out some options and
shapes the design:

- **WAF custom rules are zone-only → not available on `workers.dev`.** So the IP
  gate can't be a firewall rule; it must be enforced **in Worker code**.
- **Cloudflare Access _does_ now work on `workers.dev`** (Aug 2026 Worker-level
  Access), but it's **all-or-nothing per Worker** and the cross-origin login
  redirect breaks a `pages.dev` SPA calling a `workers.dev` API. So Access isn't
  the clean default here — see the optional upgrade below.

**Default (recommended for the hackweek): IP allowlist enforced in the Worker.**
The dashboard is low-sensitivity, glanceable, and consumed **in the office**
(wall-mounted screens, people on the floor), so the office network is a natural
boundary. Read routes (`GET /rooms`, `/rooms/:id/stats`) check the caller's IP
in code; everything else is rejected:

```js
// Hono middleware on dashboard read routes
const ip = c.req.header('CF-Connecting-IP')      // set by Cloudflare, trustworthy
if (!inOfficeRanges(ip)) return c.json({ error: 'forbidden' }, 403)
```

- No login, no custom domain, works 100% on free tier.
- The `*.pages.dev` static shell can stay public — it's useless without data, and
  the data is gated at the Worker.
- Trade-off: **no remote access** to the dashboard. For an in-office occupancy
  board that's acceptable (arguably a feature).

**Prepare for multiple office egress IPs.** Offices commonly present several
static egress IPs (multiple WAN links, NAT pools, sites), plus IPv6. Model the
allowlist as a **list of CIDRs**, not a single address, in a Worker env var so
adding a site is a one-line change:

```
OFFICE_IP_RANGES = [
  "203.0.113.0/29",     # site A WAN pool (v4)
  "198.51.100.42/32",   # site B static (v4)
  "2001:db8:1234::/48", # office IPv6 range
]
```

**Optional upgrade — add remote SSO without a custom domain.** If we later want
to reach the dashboard from outside the office, the clean free-tier path is to
serve the dashboard **same-origin from the Worker** (Workers Static Assets, so
the SPA and its API share one `workers.dev` origin) and enable **Worker-level
Cloudflare Access** on it, with an Access policy of **Bypass office IPs + Allow
`@company.com`** → office is login-free, remote gets SSO. Because device routes
can't do SSO and Access is per-Worker, keep **device ingestion on a separate
Worker** (token auth in code, no Access). Validate identity via
`ctx.access.getIdentity()`. More moving parts — only if remote access is needed.

**Why not a shared read token in the frontend?** Anything shipped in browser JS
is copyable, so a bearer token there isn't "reliable auth." The IP gate ties data
access to the office network — satisfying "other services/pages cannot easily
query the rooms data."

**Caveats:** IP matching is coarse — anyone on an allowlisted network (incl.
**guest WiFi** sharing the same egress IP) is treated as in-office; acceptable
for occupancy data. Confirm the office IPs are truly static and keep the CIDR
list current.

### Provisioning & hygiene

- Seed the 8 device tokens with a small admin script / `wrangler d1 execute`.
- All traffic is HTTPS (Workers default) — tokens never travel in cleartext.
- Rotate/revoke by updating the `api_tokens` row; re-flash the affected device.
- Keep the Sentry DSN and any secrets in Worker **secrets**, not in the repo.

## Radar integration

The LD2410C offers two paths:

- **GPIO `OUT` pin** — goes HIGH on presence. One `digitalRead()`. Use for v1.
- **UART protocol** — moving vs. stationary target, distance, sensitivity config.
  Richer analytics for v2 (e.g. `ncmreynolds/ld2410` Arduino library).

Start with the OUT pin; upgrade to UART if time allows.

## Repository layout

```
sentry-sonar/
├─ firmware/
│  ├─ sensor-node/     # Freenove + LD2410C  (PlatformIO / Arduino)
│  └─ display-node/    # Waveshare e-paper   (GxEPD2 + deep sleep)
├─ api/                # Cloudflare Worker (Hono) + D1 schema/migrations
├─ dashboard/          # Cloudflare Pages (Vite + React)
└─ PLAN.md
```

## Implementation phases

1. **API + D1 spine (mock data).** Get `/events`, `/rooms`, `/rooms/:id` working
   and curl-testable. Seed the 4 rooms. Fastest path to a real endpoint the rest
   can build against.
2. **Sensor node.** Freenove + radar OUT pin → WiFi → POST heartbeats. Watch real
   state land in D1.
3. **Display node.** Waveshare polls `/rooms/:id`, renders FREE / IN USE,
   deep-sleeps between polls.
4. **Dashboard.** React + Vite grid of 4 room cards, polling `/rooms`.
5. **Polish.** Utilization stats, offline-detection UI, battery tuning, partial
   e-ink refresh, provisioning the 4 kits (room IDs, WiFi creds, tokens).

Building the cloud spine first lets firmware and dashboard progress in parallel
against a real, working API.

## Confirmed decisions

- Two nodes per room (not all-in-one). ✅
- Dashboard uses simple polling (not WebSocket push). ✅
- Dashboard front-end: React + Vite (not plain HTML). ✅
- Data store: D1 only (current state + event log). ✅
- Radar via GPIO OUT pin first, UART later. ✅
- Sentry SDK on backend + frontend, **v11 alpha (`11.0.0-alpha.1`, `next` tag)**,
  set up per the repo's `MIGRATION.md` (not the stable v10 docs). ✅
- **Free tier, no custom domain** — dashboard on `*.pages.dev`, API on
  `*.workers.dev`. ✅
- Auth: **per-room, per-scope device bearer tokens** (D1-backed) for IoT; for the
  dashboard read routes, an **office IP allowlist enforced in Worker code** (WAF
  isn't available on `workers.dev`). Allowlist modeled as a **list of CIDRs**
  (multiple static office IPs + IPv6). In-office only by default; optional remote
  SSO via Worker-level Access documented as an upgrade. ✅

## Open items

- WiFi network + credentials strategy for provisioning 4 sensor + 4 display nodes.
- Collect the office **static egress IPs** (all sites/WAN links + IPv6) for the
  CIDR allowlist; confirm they're truly static.
- Physical mounting of sensor node + display at each door.
- Sentry projects + DSNs (one combined vs. separate backend/frontend projects).
