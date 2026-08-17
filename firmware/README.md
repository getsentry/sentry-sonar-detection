# Firmware

ESP32-S3 firmware for the two per-room nodes. Built and flashed with
[PlatformIO](https://platformio.org/) — **not** part of the pnpm workspace.

- **`sensor-node/`** — Freenove ESP32-S3 + LD2410C radar. Mains-powered,
  always-on; POSTs presence heartbeats to the API (`POST /events`).
- **`display-node/`** — Waveshare ESP32-S3 1.54" e-paper. Battery-powered;
  deep-sleeps and polls `GET /rooms/:id` every 30–60s, redraws on change.

Each device is flashed with its own per-room bearer token and Wi-Fi credentials
(see PLAN.md → Authentication). The `platformio.ini` files are placeholders —
board IDs and libraries are finalized during the firmware phase.
