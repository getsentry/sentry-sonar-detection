# Productionizing Sentry Sonar

Sentry Sonar started as a Hackweek project. It **works** — but "works as a demo
in a few rooms" and "a maintained system the office relies on" are different bars.
This document captures the current state and everything we'd (theoretically) need
to do to fully roll it out across the Vienna office and keep it running.

Nothing here is committed work — it's the map from *proof of concept* to
*production*.

## Current state (Aug 2026)

- **4 room pairs deployed** in the Vienna office (`makava-kingdom`, `urwald`,
  `servus`, `oida`), each a mains-powered **sensor node** + a battery **display
  node**. Generally working day to day.
- **Backend** is a single Cloudflare Worker (Hono) + D1, also serving the React
  dashboard as static assets. Live at
  `sentry-sonar-api.francesconovy.workers.dev` (a personal `workers.dev`
  subdomain).
- **Auth** today: per-device bearer tokens (read/write, per room) for the nodes;
  a plain **office-IP allowlist** for the dashboard read routes.
- **Enclosures**: a 3D-printable **sensor** case exists; the **displays ship with
  their own case** and are ready to mount as-is.

It's a working pilot on personal/temporary infrastructure. The gaps below are
what stand between that and "the office depends on it."

## The four big gaps

These are the things actively holding back a real rollout.

### 1. Network — a proper 2.4 GHz IoT Wi-Fi

The ESP32 radios are **2.4 GHz only**, and the office has no suitable 2.4 GHz
network for them. Right now the nodes run off a **phone/router hotspot** — fine
for a pilot, unacceptable for permanent infrastructure (single point of failure,
someone's device, no coverage guarantees).

**What we need:** a dedicated **IoT SSID** that is:

- **2.4 GHz**, WPA2-PSK (or WPA2-Enterprise if IT prefers, but PSK is far simpler
  for headless devices).
- **No captive portal.** Headless ESP32s can't click through a splash page, so
  any network with one is a non-starter. (The existing `Sentry-Guest` network has
  no captive portal and would otherwise work — it's simply **5 GHz**, which the
  radios can't join. The blocker is the band, not the auth.)
- On a **segmented VLAN** with only outbound HTTPS to the Worker allowed — these
  are cheap radar/display boards, so isolate them from the corporate LAN.
- Good AP coverage in every room that gets a pair (the radios are low-power; a
  weak signal is the #1 cause of flaky heartbeats).

**Action:** work with IT/facilities to stand up this SSID, then reflash every
device onto it (Wi-Fi credentials are baked in at flash time today — see
[gap 5, provisioning](#5-provisioning--fleet-management-at-scale)).

### 2. Power — stop babysitting display batteries

Display nodes run on a **400 mAh LiPo** and last **~9–10 days per charge**
(office-hours-only polling already triples what continuous polling would give).
For 4 rooms that's already a weekly recharge chore; across the whole office it's
untenable.

Two options, in order of preference:

- **(Preferred) USB-C wired power.** The display draws almost nothing, so a
  permanent 5 V feed removes the battery problem entirely. The idea: **tap power
  from the meeting-room display's (TV/screen) power source** — most rooms already
  have a mains-powered screen right by the door.
  - This also lets us **drop the battery, charger, and power-latch complexity**
    from the display firmware over time, and poll more frequently (snappier
    FREE/OCCUPIED) since energy is no longer the budget.
- **(Fallback) Much larger battery.** If wired power isn't feasible in some
  rooms, a 2000–3000 mAh cell pushes recharge to ~1.5–2 months. Better, but still
  a recurring manual task, and a larger cell likely won't fit the shipped display
  case. Treat as the exception, not the plan.

**Action:** pick wired-USB-C as the default; validate the "tap behind the screen"
approach in one room; keep a big-battery variant for any room where wiring is
impossible.

### 3. Hardware — build out the remaining rooms

- **More pairs.** Build sensor + display nodes for every remaining meeting room.
  Each pair is: 1× Freenove ESP32-S3 + LD2410C radar (sensor), 1× Waveshare
  1.54" e-paper ESP32-S3 (display), wiring, and power (see gap 2). Capture a
  proper **BOM + per-room cost** so procurement can order in bulk.
- **3D-print the sensor cases.** The parametric case exists
  (`hardware/enclosure/`) — we just need to print body + lid per room (PLA/PETG
  only; radar-transparent). Batch these.
- **Displays need no enclosure work** — they ship with their own case and are
  ready to mount. The only open item is routing the USB-C feed (gap 2) to each
  display's mount point.

**Action:** finalize BOM, order parts, batch-print sensor cases, design the
display case, assemble and provision one pair per remaining room.

### 4. Hosting — move the dashboard to Sentry-owned infrastructure + real auth

Today the whole thing lives on a **personal `workers.dev` subdomain**, and the
dashboard is gated only by an **office-IP allowlist** (fails closed, but IP-based
and brittle — breaks for VPN/remote, and the office's dual-uplink egress
(COLT + Wien Energie) already complicates keeping the allowlist correct).

For production:

- **Move to Sentry-owned hosting** — a Cloudflare account/zone owned by Sentry,
  not an individual, on a **custom domain** (e.g. `sonar.sentry.io` or an
  internal equivalent) instead of `*.workers.dev`. This survives the original
  author leaving and gives us a stable URL.
- **Put the dashboard behind Sentry SSO/OAuth** (Google Workspace / Okta / Sentry
  identity) instead of the IP allowlist. Cloudflare **Access** in front of the
  dashboard routes is the low-effort path — no app code change, real identity, and
  it fixes the remote/VPN gap the IP allowlist has. (Keep the device-token auth
  for the nodes as-is; that part is fine.)
- Decide what stays IP/token-gated (the node-facing `/events` and `/rooms/:id`)
  vs. identity-gated (the human-facing dashboard).

**Action:** provision a Sentry-owned CF account + domain, redeploy there, front
the dashboard with Cloudflare Access, retire the personal subdomain.
