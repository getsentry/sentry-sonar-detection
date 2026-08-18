# Sentry Sonar

Real-time meeting-room availability, sensed by radar and shown right on the door.

## What it does

A 24GHz radar sensor in each room detects human presence — *that* a person is
there, never *who* (no cameras, no microphones) — and reports to a Cloudflare
Workers API. Two consumers read that data:

- **E-ink door displays** show **FREE / OCCUPIED** at a glance. Battery-powered,
  they deep-sleep and poll during office hours, running ~1–2 weeks per charge.
- **A web dashboard** gives a live overview of every room, plus how they're used
  over time (utilization, busy hours).

**The outcome:** walk down the hall and see which rooms are free without opening a
calendar or a booking app — and see room-usage trends on the dashboard. Privacy by
design: radar only knows presence, not identity.

## Architecture

```
 Sensor node (Freenove ESP32 + LD2410C radar) ──POST /events──►  Cloudflare
                                                                  Worker (Hono)
 Display node (Waveshare e-paper)  ──GET /rooms/:id──►            + D1
 Dashboard (Pages, React)          ──GET /rooms─────►
```

Two nodes per room: a mains-powered **sensor node** that senses continuously, and a
battery **display node** that deep-sleeps and polls during office hours. A Cloudflare
Worker (Hono) on D1 holds current room state plus an append-only event log; the
dashboard (Cloudflare Pages, React) reads the aggregate and the history.

## Repo layout

```
firmware/sensor-node/    Freenove + LD2410C radar (PlatformIO)
firmware/display-node/   Waveshare e-paper (GxEPD2 + deep sleep)
api/                     Cloudflare Worker (Hono) + D1 migrations
dashboard/               Cloudflare Pages (Vite + React)
```

## Docs

- **[SETUP.md](./SETUP.md)** — step-by-step to stand up your own copy end to end
  (Cloudflare backend, dashboard, device tokens, firmware).
- **[PLAN.md](./PLAN.md)** — design, data model, API surface, and the decisions
  behind them.
- **[api/README.md](./api/README.md)** — API endpoints, deploy & operate, tokens.
- **[firmware/README.md](./firmware/README.md)** — flashing sensors & displays,
  board pinouts, and the battery/power gotchas.

## Status

Hackweek project — 4 rooms, 4 device kits, all provisioned and running.

- API: <https://sentry-sonar-api.francesconovy.workers.dev>
- Dashboard: <https://sentry-sonar.pages.dev> (data shows only from an allowlisted
  office IP)
