# Setup — replicate Sentry Sonar

End-to-end instructions to stand up your own Sentry Sonar somewhere else: the
Cloudflare backend, the dashboard, device tokens, and firmware on each sensor and
display. For *why* it's built this way, see [PLAN.md](./PLAN.md); this file is the
how-to.

The deep detail for each piece lives in [api/README.md](./api/README.md) (backend +
tokens) and [firmware/README.md](./firmware/README.md) (flashing, wiring, gotchas) —
this file is the ordered path through them.

## Prerequisites

- **Node + pnpm** via [Volta](https://volta.sh/) (Node 26 + pnpm 10, pinned in
  `package.json`).
- A **Cloudflare account** with Workers, D1, and Pages. `wrangler` ships with the
  api workspace (run it as `pnpm --filter api exec wrangler …`).
- **[PlatformIO CLI](https://platformio.org/)** (`pio`) for firmware.
- **Hardware per room:** Freenove ESP32-S3 + LD2410C 24GHz radar (sensor node);
  Waveshare ESP32-S3-ePaper-1.54 (display node). Full list in
  [PLAN.md → Hardware](./PLAN.md).

## 1. Clone & install

```sh
curl https://get.volta.sh | bash          # if you don't have Volta
git clone https://github.com/getsentry/sentry-sonar-detection.git && cd sentry-sonar-detection
export VOLTA_FEATURE_PNPM=1               # add to ~/.zshrc to persist
pnpm install                              # installs the api + dashboard workspaces
```

## 2. Cloudflare backend (Worker + D1)

Details in [api/README.md → Deploy & operate](./api/README.md#deploy--operate).

```sh
cd api
pnpm exec wrangler login                        # authenticate (opens a browser)
pnpm exec wrangler d1 create sentry_sonar       # → copy the printed database_id
# paste that id into api/wrangler.jsonc:  "database_id": "…"
pnpm db:migrate                                 # schema + seeds the 4 rooms (remote D1)
pnpm run deploy                                 # publish the Worker
pnpm exec wrangler secret put OFFICE_IP_RANGES  # office CIDRs, e.g. 203.0.113.0/29
pnpm exec wrangler secret put SENTRY_DSN        # optional — error/trace monitoring
```

The migration seeds the rooms, so there's no separate seed step. First deploy on a
fresh account prompts for a free `workers.dev` subdomain — note the resulting API
URL; you'll point the firmware and dashboard at it.

## 3. Dashboard (Cloudflare Pages)

```sh
pnpm --filter dashboard build
pnpm --filter api exec wrangler pages deploy ../dashboard/dist \
  --project-name sentry-sonar --branch main
```

The dashboard reads the API cross-origin; room data only renders from an IP in
`OFFICE_IP_RANGES` (set above).

## 4. Device tokens

Every room needs **two** tokens: a **write** token for its sensor and a **read**
token for its display. Mint each (prints the token once + an `INSERT`), then register
the hash in D1. See
[api/README.md → Manage device tokens](./api/README.md#manage-device-tokens).

```sh
cd api
node scripts/mint-token.mjs <room-id> write     # sensor  → save the token
node scripts/mint-token.mjs <room-id> read      # display → save the token
# run the printed `wrangler d1 execute … --remote` INSERT for each
```

The plaintext token is shown **once** — save it, you'll flash it into the device
next. Only its SHA-256 hash is stored, so a lost token means re-minting.

## 5. Flash the firmware

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

Repeat per room. The API base defaults to the deployed Worker; override with
`SS_API_BASE` (see each node's `*.env.example`).

## Local development

```sh
cp api/.dev.vars.example api/.dev.vars
pnpm --filter api db:migrate:local        # create + migrate the local dev D1
pnpm dev:api                              # Worker at http://localhost:8787
pnpm dev:dashboard                        # Vite dev server (proxies /rooms, /events)
```

## Test & typecheck

```sh
pnpm test
pnpm typecheck
```
