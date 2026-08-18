# Setup — replicate Sentry Sonar

End-to-end instructions to stand up your own Sentry Sonar somewhere else — the
Cloudflare backend, the dashboard, device tokens, and firmware on each sensor and
display. This file is the ordered how-to; the deep detail for each piece lives in
[api/README.md](./api/README.md) (backend + tokens) and
[firmware/README.md](./firmware/README.md) (flashing, wiring, gotchas), and the
design rationale is in [PLAN.md](./PLAN.md).

## Prerequisites

- **Node + pnpm** via [Volta](https://volta.sh/) (Node 26 + pnpm 10, pinned in
  `package.json`).
- A **Cloudflare account** with Workers + D1. `wrangler` ships with the api
  workspace — the commands below run it from `api/` as `pnpm exec wrangler …`.
- **[PlatformIO CLI](https://platformio.org/)** (`pio`) for firmware.
- **Hardware per room:** Freenove ESP32-S3 + LD2410C 24GHz radar (sensor node);
  Waveshare ESP32-S3-ePaper-1.54 (display node). Full list in
  [PLAN.md → Hardware](./PLAN.md#hardware-per-room).

## 1. Clone & install

```sh
curl https://get.volta.sh | bash          # if you don't have Volta
git clone https://github.com/getsentry/sentry-sonar-detection.git && cd sentry-sonar-detection
export VOLTA_FEATURE_PNPM=1               # add to your shell profile (e.g. ~/.zshrc) to persist
pnpm install                              # installs the api + dashboard workspaces
```

## 2. Cloudflare — one Worker serves the API **and** the dashboard

Details in [api/README.md → Deploy & operate](./api/README.md#deploy--operate).

```sh
# Set up D1 (from api/):
cd api
pnpm exec wrangler login                        # authenticate (opens a browser)
pnpm exec wrangler d1 create sentry_sonar       # → copy the printed database_id
# paste that id into api/wrangler.jsonc:  "database_id": "…"
pnpm db:migrate                                 # schema + seeds the 4 rooms (remote D1)

# Build the dashboard + deploy the Worker together (from the repo root):
cd ..
pnpm run deploy                                     # = dashboard build, then api deploy

# Secrets (from api/):
cd api
pnpm exec wrangler secret put OFFICE_IP_RANGES  # office CIDRs, e.g. 203.0.113.0/29
pnpm exec wrangler secret put SENTRY_DSN        # optional — error/trace monitoring
```

`pnpm run deploy` (root) builds the dashboard into `dashboard/dist` and deploys the
Worker, which bundles that as its static assets. The migration seeds the rooms (no
separate seed step). First deploy on a fresh account prompts for a free
`workers.dev` subdomain — the **API and dashboard share that one URL**; note it for
the firmware config. The dashboard's data routes stay gated to `OFFICE_IP_RANGES`.

## 3. Device tokens

Every room needs **two** tokens: a **write** token for its sensor and a **read**
token for its display. The seeded room ids are `makava-kingdom`, `urwald`, `servus`,
`oida` — use one as `<room-id>`. Mint each (prints the token once + an `INSERT`),
then register the hash in D1. See
[api/README.md → Manage device tokens](./api/README.md#manage-device-tokens).

```sh
cd api
node scripts/mint-token.mjs <room-id> write     # sensor  → save the token
node scripts/mint-token.mjs <room-id> read      # display → save the token
# For EACH: run the printed `wrangler d1 execute` line, changing --local to
# --remote so the hash lands in the production DB the deployed Worker reads.
```

The plaintext token is shown **once** — save it, you'll flash it into the device
next. Only its SHA-256 hash is stored, so a lost token means re-minting.

## 4. Flash the firmware

Full wiring, download-mode, and power notes in
[firmware/README.md](./firmware/README.md).

```sh
# Sensor (write token; prompts for the WiFi password, never stored):
cd firmware/sensor-node
./flash-sensor.sh --room <room-id> --token 'ss_xxx.secret' --ssid <SSID> --monitor

# Display (read token; the board deep-sleeps, so put it in DOWNLOAD MODE first —
# see the firmware README — then pass its port explicitly):
cd firmware/display-node
./flash-display.sh --room <room-id> --token 'ss_xxx.secret' --ssid <SSID> \
  --port /dev/cu.usbmodemXXXX --monitor
```

Repeat per room.

> **Point the firmware at *your* Worker.** The flash scripts default `SS_API_BASE`
> to the reference deployment (`sentry-sonar-api.francesconovy.workers.dev`), so a
> verbatim flash talks to *that* backend, not yours. Set it to the `workers.dev`
> URL from step 2 before flashing — export `SS_API_BASE=…`, or set it in
> `sensor.env` / `display.env` (copy the `*.env.example`).

## Local development

```sh
cp api/.dev.vars.example api/.dev.vars
pnpm --filter api db:migrate:local        # create + migrate the local dev D1
pnpm dev:api                              # Worker at http://localhost:8787
pnpm dev:dashboard                        # Vite dev server (proxies /rooms, /events)
```

Use the **Vite dev server** (`pnpm dev:dashboard`, with HMR) for frontend work — it
proxies API calls to the local Worker. `pnpm dev:api` (`wrangler dev`) also serves
`dashboard/dist` as assets, so if you want to exercise the single-Worker path
locally, run `pnpm --filter dashboard build` first.

Local dashboard data shows up only because `api/.dev.vars.example` sets
`ALLOW_INSECURE_LOCAL="true"`, which bypasses the office-IP gate. Keep it for local
dev; **never set it in production** (there the gate uses `OFFICE_IP_RANGES`).

## Test & typecheck

```sh
pnpm test
pnpm typecheck
```
