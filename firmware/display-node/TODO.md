# Display-node — open items

## [FIXED] Battery operation — we were issuing the power-off command

**Root cause:** `VBAT_PWR` (GPIO17) is the **battery power latch** for the whole
board — HIGH = battery powers the system, LOW = power off. (Confirmed in Waveshare's
factory demo: `BoardPower_VBAT_ON()` at boot, `BoardPower_VBAT_OFF()` only under
`//长按PWR关机` = "long-press PWR to shut down".) Our `readBatteryMv()` set it HIGH
to read, then drove it **LOW every time** — i.e. we ran the shutdown command after
every battery read. On USB that's invisible (USB powers the board); on battery it
cut power → died instantly on unplug, browned out mid-refresh on a PWR cold-boot.
It was never the cell, the Wi-Fi burst, or the refresh current.

**Fix:** assert `VBAT_PWR` HIGH once at the top of `setup()`, and never drive it
LOW. `readBatteryMv()` now only reads the ADC. (`src/main.cpp`.)

## Old (now-disproven) theory kept for reference

**Symptom:** the makava-kingdom display, powered on **from off** on battery
(hold PWR ~5 s → cold boot), starts its refresh but the e-ink comes up **dim /
half-developed** — the panel's high-voltage waveform is being starved. On USB it
boots and draws perfectly every time.

**Key evidence it's a COLD-START issue, not a flat/undersized cell:**
- A second board running the *original* always-awake bring-up firmware, unplugged
  from USB **while running**, hot-swaps to battery and keeps updating fine — no
  PWR press, no brownout. So the cell + board can run on battery.
- Every makava failure was on a **`(cold boot)`** log (full power-off beforehand):
  PWR-on inrush + immediate Wi-Fi connect + e-ink booster inrush + refresh all
  firing at once on a cold board.

**Theory:** the cold power-on inrush, stacked with the first Wi-Fi burst and the
panel booster inrush, sags the cell below the regulator's dropout and starves the
refresh. A board that's already running (caps charged, no inrush) doesn't hit it.

**Things to try:**
- On a battery cold-boot, **settle before load**: delay after power-on, and/or
  draw a cheap frame before bringing Wi-Fi up.
- **Bulk cap (470–1000 µF)** across the battery pads to absorb inrush — likely the
  real fix (hardware).
- Get a hard number: stash on-battery Vbat in RTC at phase 1, print on next USB
  boot — is the cell actually collapsing, and at what voltage?
- Already in `src/main.cpp`: radio off before refresh, lowered Wi-Fi TX power,
  80 MHz CPU, `rtcPhase` + `reset_reason` brownout probe.

**Root cause found — it's the battery *connection* on this specific board, not
firmware or cold-boot inrush.** Test with the debug build (always awake, polls
every 20 s, no deep sleep): unplug USB and it **stops instantly** — it does not
hot-swap to the battery even while running. A *different* board running the
original firmware hot-swaps to battery and keeps running fine. Same battery model.
So: this board's cell shows ~4 V at the pin (no load) but can't source current —
a loose / high-resistance / not-fully-seated JST (these were pre-assembled). That
also explains the earlier dim/collapsing refresh (weak power through a bad
contact). On USB everything works because USB powers the board directly.

**Fix (hardware, per board):** firmly reseat / re-crimp the battery JST; verify
the cell is clicked in. Retest with the debug build — unplug USB, and if the
top-left clock keeps ticking every 20 s, the connection is fixed. If it still dies
instantly after a solid reseat, that board's connector/cell is faulty — swap it.

**Status:** not a firmware bug. Does NOT block USB-powered operation.
