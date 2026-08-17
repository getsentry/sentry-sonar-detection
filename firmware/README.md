# Firmware

ESP32-S3 firmware for the two per-room nodes. Built and flashed with
[PlatformIO](https://platformio.org/) — **not** part of the pnpm workspace.

- **`sensor-node/`** — Freenove ESP32-S3-WROOM-1 + LD2410C radar. Mains-powered,
  always-on; POSTs presence heartbeats to the API (`POST /events`).
- **`display-node/`** — Waveshare ESP32-S3 1.54" e-paper. Battery-powered;
  deep-sleeps and polls `GET /rooms/:id` every 30–60s, redraws on change.

Each device is flashed with its own per-room bearer token and Wi-Fi credentials
(see PLAN.md → Authentication).

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

## Build, flash, monitor

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

## Testing the sensor node

`sensor-node/src/main.cpp` is currently a **wiring test**: it only reads the
radar's OUT pin and prints presence — no WiFi, no HTTP. Use it to prove the
hardware before adding the network layer.

1. Flash it and open the monitor (see above). Expected on boot:

   ```
   === Sentry Sonar :: LD2410C OUT-pin test ===
   Reading radar OUT on GPIO4
   [status] occupied=0        ← heartbeat every 2s
   ```

2. Move in front of the radar → `[change] PRESENCE`, `occupied=1`. Step away →
   `[change] clear`, `occupied=0` a few seconds later. (24GHz radar is
   sensitive and reaches ~5m — to see it clear, you often have to leave the
   room, not just lean back.)

3. **Prove the read path (rule out a stuck-HIGH pin):** pull the OUT jumper off
   GPIO4 and touch it to a **GND** pin — `occupied` must go to `0` within ~2s.
   Move it back to the radar's OUT and presence returns. Toggling both ways
   confirms VCC/GND/OUT and the GPIO read are all correct.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| Garbage bytes on serial | Wrong baud — use `pio device monitor -b 115200`, not `cat` |
| Stuck `occupied=1`, never clears | You're within radar range (usually fine), or OUT on the wrong pad — run the GND test above |
| Stuck `occupied=0` even in front | OUT not connected to GPIO4, or radar unpowered (VCC on 3V3 instead of 5V) |
| No serial port in `pio device list` | Wrong USB-C jack, charge-only cable, or board not powered — try the other jack |
| Flash hangs at `Connecting.....` | Hold **BOOT**, tap **EN/RST**, release **BOOT**, re-run |
