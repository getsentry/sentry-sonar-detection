# Firmware

ESP32-S3 firmware for the two per-room nodes. Built and flashed with
[PlatformIO](https://platformio.org/) — **not** part of the pnpm workspace.

- **`sensor-node/`** — Freenove ESP32-S3-WROOM-1 + LD2410C radar. Mains-powered,
  always-on; POSTs presence heartbeats to the API (`POST /events`).
- **`display-node/`** — Waveshare ESP32-S3 1.54" e-paper. Battery-powered;
  deep-sleeps and polls `GET /rooms/:id` every 30–60s, redraws on change.

Each device is flashed with its own per-room bearer token and Wi-Fi credentials
(see [../PLAN.md → Authentication](../PLAN.md#authentication--authorization)). The
four rooms are `makava-kingdom`, `urwald`, `servus`, `oida` — use one of these as
the `--room` id below (they're seeded into D1 by the API migrations).

## Prerequisites

Install the PlatformIO **CLI** (`pio`). It is standalone — no VS Code required:

```sh
brew install platformio        # macOS
pio --version                  # confirm it's on PATH
```

First `pio run` for a new board downloads the ESP32 toolchain + Arduino
framework (~100 MB, a minute or two). That's a one-time cost; later builds are
fast.

## Sensor node — wiring

LD2410C 24GHz radar → ESP32-S3-WROOM-1, **3 jumper wires, no soldering, no level
shifter** (the LD2410C's IO is already 3.3V):

| LD2410C pad | → | ESP32-S3 pin |
|---|---|---|
| `VCC` (5V) | → | **5V** (USB-fed rail — *not* 3V3; the radar needs 5V) |
| `GND` | → | **GND** |
| `OUT` / `OT2` | → | **GPIO4** (silkscreen `4`; any free GPIO works if you change the sketch) |

Match the radar pads by their **silkscreen label**, not header position — the
order varies between batches. Mount the radar with its etched-antenna face
toward the room.

## Board & USB port

- **Board id:** `esp32-s3-devkitc-1` (correct generic id for the WROOM-1 module;
  already set in `sensor-node/platformio.ini`).
- The Freenove board has **two USB-C jacks**. Use the **UART** one (CH343
  bridge) — plain `Serial` output flows over it with no extra build flags. The
  other jack is the S3's *native* USB and only shows `Serial` if you compile in
  USB-CDC-on-boot, so it's the wrong choice for these sketches.
- Find the port: `pio device list`. The CH343 shows up as
  `/dev/cu.usbmodem*` with **Hardware ID `VID:PID=1A86:...`** (`1A86` = WCH).
  On macOS it enumerates driver-free.
- The two little buttons near the jacks are **BOOT** (=IO0) and **EN/RST** — not
  port labels.

## Flashing a sensor

`main.cpp` is the production firmware: read the LD2410C OUT pin → `POST /events`.
Each sensor needs a **unique room id + auth token**; the SSID defaults to
`Sentry-Guest` and you enter the WiFi password at flash time.

1. Mint a **write** token for the room and register it in the **remote
   (production) D1** (see [../api/README.md](../api/README.md#manage-device-tokens)):

   ```sh
   node ../../api/scripts/mint-token.mjs urwald write
   # It prints the token once, plus a `wrangler d1 execute … --local` line.
   # Run that line but change --local to --remote, so the hash lands in the
   # production DB the deployed Worker reads (otherwise the device gets 401).
   ```

2. Flash the board with that room + token (you'll be prompted for the WiFi
   password), from `firmware/sensor-node/`:

   ```sh
   ./flash-sensor.sh --room urwald --token 'ss_xxxx.secret' --monitor
   # --monitor opens the serial monitor after flashing so you can watch it boot.
   # options: --wifi-pass <pass>  --ssid <name>  --port /dev/cu.usbmodemXXXX
   ```

The script writes `src/config.gen.h` (gitignored — it holds the token),
compiles, and uploads. Repeat per sensor with its own room + token. Nothing
secret is committed.

## Flashing a display

`display-node/src/main.cpp` is the production firmware: wake from deep sleep,
`GET /rooms/:id`, redraw FREE / OCCUPIED only on change, sleep again. Each
display needs a **read** token for its room (a display can only read; it never
writes state).

1. Mint a **read** token for the room and register it in the **remote
   (production) D1** (see [../api/README.md](../api/README.md#manage-device-tokens)):

   ```sh
   node ../../api/scripts/mint-token.mjs makava-kingdom read
   # run the printed `wrangler d1 execute` line, changing --local to --remote
   ```

2. Flash the board with that room + token (you'll be prompted for the WiFi
   password), from `firmware/display-node/`:

   ```sh
   ./flash-display.sh --room makava-kingdom --token 'ss_xxxx.secret' --monitor
   # options: --wifi-pass <pass>  --ssid <name>  --port /dev/cu.usbmodemXXXX
   ```

   `--ssid` defaults to `Sentry-Guest`; set a per-machine default in
   `display.env` (copy `display.env.example`). The WiFi password is never stored.

Unlike the sensor's dual-jack Freenove, the display board has a **single
native-USB Type-C** port. Find it the same way — `pio device list` — but it
enumerates with **VID `303A:1001`** (Espressif), as `/dev/cu.usbmodem*`. Its two
side buttons are **PWR** and **BOOT** (the one with the "sun" icon).

> **Download mode is required to flash.** The production firmware deep-sleeps, so
> the board's USB port vanishes between wakes and the flasher can't open it. Put it
> in download mode first: unplug USB → hold **BOOT** (the "sun" side button) → plug
> USB back in → release BOOT. Then pass `--port /dev/cu.usbmodemXXXX` explicitly so
> auto-detect doesn't grab an unrelated serial device. See
> [Display board & power gotchas](#display-board--power-gotchas) for the why.

## Display power & polling strategy

The display runs on a small LiPo, so it does as little as possible. The Wi-Fi
wake is essentially the *entire* energy budget, so everything is tuned to minimize
how often the radio turns on.

- **Deep sleep between polls.** Each cycle is a fresh boot: wake → read battery →
  (in active hours) Wi-Fi + `GET /rooms/:id` → redraw **only if the frame
  changed** → deep sleep (~10 µA; e-ink holds its image with no power).
- **Office-hours only.** Polling runs **weekdays 08:00–18:00 local, every 60 s**.
  Nights and weekends the radio never turns on — the board shows an **OFF HOURS**
  message (not a stale FREE/OCCUPIED) and naps (waking at most every ~8 h just to
  re-check the battery) until the next weekday morning. Nobody's in the rooms then,
  so this roughly **triples** battery life.
- **Time without NTP.** The schedule needs a wall clock, which the ESP32 loses in
  deep sleep. Rather than an NTP round-trip, we read the `Date` header off every
  API response (free), track it across sleeps with the wake timer, and re-anchor on
  each daytime poll. Timezone/DST uses the Europe/Vienna POSIX rule.
- **Battery graphic, not a number.** The corner shows a rough fill level (redrawn
  only when the coarse level changes, not every poll); ≤10 % becomes a `!` alert;
  <3 % replaces the room status with a full-screen **RECHARGE ME** (radio kept
  off), so a dying panel never freezes on a misleading FREE/OCCUPIED.

**Expected life ≈ 9–10 days** on the 400 mAh cell (bank on ~1 week to be safe).
Weekday polling dominates, so the active-hours interval is the main lever: 2 min
→ ~2.5 weeks, 5 min → ~5 weeks, trading sign responsiveness for runtime. Tunables
are at the top of `src/main.cpp`: `POLL_SECONDS`, `ACTIVE_START_HOUR`,
`ACTIVE_END_HOUR`, `SKIP_WEEKENDS`.

## Display board & power gotchas

The display is a **Waveshare ESP32-S3-ePaper-1.54** (200×200 B/W, SSD1681 →
`GxEPD2_154_D67`, with an on-board LiPo charger). Everything is wired internally, so
the pin map is fixed and lives at the top of `src/main.cpp`:

| Signal | GPIO | | Signal | GPIO |
|---|---|---|---|---|
| EPD CS / DC | 11 / 10 | | EPD SCK / MOSI | 12 / 13 |
| EPD RST / BUSY | 9 / 8 | | EPD_PWR (panel, **active-LOW**) | 6 |
| VBAT_PWR (battery latch) | 17 | | Battery ADC (ADC1_CH3, ÷2) | 4 |

Three things about this board cost real debugging time — don't relearn them:

- **`VBAT_PWR` (GPIO17) is the battery power latch for the *whole board*, not a
  "measurement divider enable."** HIGH = battery powers the system; **LOW = power
  off** (it's exactly what the vendor demo drives on a long-press-PWR shutdown). The
  firmware asserts it HIGH once at the top of `setup()` and **never drives it LOW**.
  Toggle it — e.g. to "save power while measuring the battery" — and the board dies
  the instant USB is unplugged and browns out mid-refresh on battery, while looking
  perfectly fine on USB (USB powers the board directly, bypassing the latch).
- **Hold GPIO17 through deep sleep.** The ESP32 floats its GPIOs while asleep, so the
  latch would open mid-sleep and the board would never wake on battery. Before
  `esp_deep_sleep_start()` we call `gpio_hold_en(GPIO17)` + `gpio_deep_sleep_hold_en()`
  and release the hold on wake. Without it, USB works but battery deep-sleep is dead.
- **Power button.** On USB the board powers on automatically. On battery, **press
  and hold PWR (~5 s)** to turn it on; a board that's already running hot-swaps to
  battery when USB is pulled, no press needed. A long PWR press powers it off.

### On-device debugging

`src/main.cpp` has a `DEBUG_MODE` switch at the top. Set it to `1` and reflash for a
build identical to production **except** it polls every `DEBUG_POLL_SECONDS` (20 s)
and stamps the current time top-left, redrawing each poll — so you can watch it tick
and confirm it's alive, including on battery. Set back to `0` for production.

## Build, flash, monitor (manual / low-level)

From the node's directory (e.g. `firmware/sensor-node/`):

```sh
pio run                                     # compile only
pio run -t upload                           # compile + flash (auto-detects port)
pio run -t upload --upload-port /dev/cu.usbmodemXXXX   # if auto-detect picks wrong
pio device monitor -b 115200                # serial monitor (Ctrl-] to quit)
```

A good flash ends with `Hash of data verified` → `Hard resetting via RTS pin`
→ `[SUCCESS]`. If it hangs at `Connecting.....`, hold **BOOT**, tap **EN/RST**,
release **BOOT** to force the bootloader, then re-run.

> **Headless/automation note.** `pio device monitor` needs an interactive TTY;
> in a non-interactive shell (CI, a background task) it dies with
> `termios ... Operation not supported by device`. In a real terminal it's fine.
> To read the port from a script instead, use a pyserial reader locked to the
> baud (bundled with PlatformIO):
>
> ```python
> import serial, sys
> s = serial.Serial("/dev/cu.usbmodemXXXX", 115200, timeout=1)
> s.dtr = s.rts = False          # don't reset the board on attach
> while True:
>     line = s.readline()
>     if line: sys.stdout.write(line.decode("utf-8", "replace")); sys.stdout.flush()
> ```
>
> Do **not** use `stty … ; cat /dev/cu.…` — `cat` re-opens the port, macOS
> resets it to 9600, and you get consistent garbage bytes (a wrong-baud read).

## Verifying a flashed sensor

Open the monitor (`--monitor`, or `pio device monitor -b 115200`). Expected on
boot:

   ```
   === Sentry Sonar :: sensor-node ===
   room=urwald  api=https://sentry-sonar-api.francesconovy.workers.dev  radar=GPIO4
   [wifi] connecting to "Sentry-Guest" ...
   [wifi] connected, ip=192.168.x.y
   [http] POST /events occupied=0 -> 200
   ```

1. Move in front of the radar → `[http] POST /events occupied=1 -> 200`. Step
   away → `occupied=0` a few seconds later (24GHz radar reaches ~5m — you often
   have to leave the room, not just lean back). Cross-check with `GET /rooms`.

2. **Prove the read path (rule out a stuck-HIGH pin):** pull the OUT jumper off
   GPIO4 and touch it to a **GND** pin — `occupied` must go to `0` within a
   couple seconds. Move it back to the radar's OUT and presence returns.
   Toggling both ways confirms VCC/GND/OUT and the GPIO read are all correct.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| Garbage bytes on serial | Wrong baud — use `pio device monitor -b 115200`, not `cat` |
| Stuck `occupied=1`, never clears | You're within radar range (usually fine), or OUT on the wrong pad — run the GND test above |
| Stuck `occupied=0` even in front | OUT not connected to GPIO4, or radar unpowered (VCC on 3V3 instead of 5V) |
| No serial port in `pio device list` | Wrong USB-C jack, charge-only cable, or board not powered — try the other jack |
| Flash hangs at `Connecting.....` | Hold **BOOT**, tap **EN/RST**, release **BOOT**, re-run |
| `[http] … -> 401` or `403` | Token wrong/rotated, unregistered, or scoped to another room — re-mint (see api/README) |
| `[http] … failed` or `[wifi] connect timed out` | Wrong WiFi password/SSID or out of range — reflash with the right `--wifi-pass` |
