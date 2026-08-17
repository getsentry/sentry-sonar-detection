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

## Getting started

```sh
npm install
npm run dev:api          # Cloudflare Worker (local)
npm run dev:dashboard    # dashboard (local)
```

Firmware is built and flashed with [PlatformIO](https://platformio.org/).

## Status

Hackweek project — 4 rooms, 4 device kits. See [PLAN.md](./PLAN.md) for the full
plan, data model, API surface, and build phases.
