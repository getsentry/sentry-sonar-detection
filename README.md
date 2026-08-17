# Sentry Sonar

Real-time meeting-room availability, sensed by radar and shown right on the door.

A 24GHz radar sensor in each room detects human presence and reports to a
Cloudflare Workers API. Two consumers read that data: e-ink displays on each door
showing **FREE / IN USE**, and a web dashboard with a live overview of all rooms
and how they're used over time. No cameras, no microphones — radar senses *that*
a person is present, never *who*.

## Architecture

```
 Sensor node (Freenove ESP32 + LD2410C radar) ──POST /events──►  Cloudflare
                                                                  Worker (Hono)
 Display node (Waveshare e-paper)  ──GET /rooms/:id──►            + D1
 Dashboard (Pages, React)          ──GET /rooms─────►
```

Two nodes per room: a mains-powered **sensor node** that senses continuously, and
a battery **display node** that deep-sleeps and polls every 30–60s.

## Layout

```
firmware/sensor-node/    Freenove + LD2410C radar (PlatformIO)
firmware/display-node/   Waveshare e-paper (GxEPD2 + deep sleep)
api/                     Cloudflare Worker (Hono) + D1 migrations
dashboard/               Cloudflare Pages (Vite + React)
```

## Setup

Toolchain is pinned with [Volta](https://volta.sh/) (Node 26 + pnpm 10) and
managed with [pnpm](https://pnpm.io/) workspaces.

```sh
curl https://get.volta.sh | bash          # install Volta if you don't have it

git clone <repo-url> && cd hackweek-2026

# Volta manages pnpm behind a feature flag — enable it once in your shell:
export VOLTA_FEATURE_PNPM=1               # add to ~/.zshrc to make it stick

pnpm install                              # installs the api + dashboard workspaces
```

## Develop

```sh
# API — first run needs a local D1 (created + migrated on demand):
cp api/.dev.vars.example api/.dev.vars
pnpm --filter api db:migrate:local
pnpm dev:api            # Cloudflare Worker at http://localhost:8787

# Dashboard (proxies /rooms and /events to the local Worker):
pnpm dev:dashboard      # Vite dev server
```

## Test & typecheck

```sh
pnpm test               # all workspaces
pnpm typecheck
```

## Deploy

- **API** — Cloudflare Workers + D1, live at
  <https://sentry-sonar-api.francesconovy.workers.dev>. First-time deploy,
  redeploys, migrations, secrets, and tokens:
  **[api/README.md → Deploy & operate](./api/README.md#deploy--operate)**.
- **Dashboard** — Cloudflare Pages, live at <https://sentry-sonar.pages.dev>
  (reads the API cross-origin; data only shows from an allowlisted office IP).
  Rebuild + redeploy:
  ```sh
  pnpm --filter dashboard build
  pnpm --filter api exec wrangler pages deploy ../dashboard/dist \
    --project-name sentry-sonar --branch main
  ```
- **Firmware** — `firmware/`, built/flashed with
  [PlatformIO](https://platformio.org/): see [firmware/README.md](./firmware/README.md).

## Status

Hackweek project — 4 rooms, 4 device kits. See [PLAN.md](./PLAN.md) for the full
plan, data model, API surface, and build phases.

API deployed at <https://sentry-sonar-api.francesconovy.workers.dev>.
