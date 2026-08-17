# Sentry Sonar — Implementation Plan

**Sentry Sonar** is a meeting-room occupancy system. Radar sensors detect human
presence in each room and report to a Cloudflare Workers API. Two consumers read
that data: e-ink displays on each room door showing **FREE / IN USE**, and a web
dashboard giving an overview of all rooms and how they're used.

- **Sentry** — stands watch over the room.
- **Sonar** — the radar sensing presence.

## Scope

- **4 meeting rooms.**
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

| Method | Route | Caller | Purpose |
|---|---|---|---|
| `POST` | `/events` | sensor node | heartbeat / state (Bearer device token) |
| `GET` | `/rooms/:id` | display node | one room's derived status (tiny payload) |
| `GET` | `/rooms` | dashboard | all rooms + status |
| `GET` | `/rooms/:id/stats` | dashboard | utilization over time (later phase) |

**Auth:** shared **device Bearer token** for sensor POSTs (simple, fine for
hackweek). Dashboard read routes public or behind Cloudflare Access.

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

## Open items

- Room naming / IDs for the 4 rooms.
- WiFi network + credentials strategy for provisioning 4 sensor + 4 display nodes.
- Device token scheme (one shared token vs. per-device).
- Physical mounting of sensor node + display at each door.
