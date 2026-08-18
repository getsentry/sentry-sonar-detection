# Display-node — open items

## Battery operation — RESOLVED

Battery/deep-sleep operation works. Two board-specific fixes were needed, both now
in `src/main.cpp` and documented in
[README.md → Display board & power gotchas](../README.md#display-board--power-gotchas):

1. **`VBAT_PWR` (GPIO17) is the battery power latch** — assert HIGH at boot, never
   drive it LOW. (We were driving it LOW after every battery read, i.e. running the
   board's shutdown command, which killed battery operation while looking fine on USB.)
2. **Hold GPIO17 through deep sleep** (`gpio_hold_en` + `gpio_deep_sleep_hold_en`),
   or the latch opens mid-sleep and the board never wakes on battery.

## Optional / nice-to-have

- **Skip DHCP with a self-learning static IP** (Wi-Fi power). Every wake currently
  re-runs DHCP (~0.3–0.8 s of radio-on time). Cache the DHCP-assigned IP / gateway /
  subnet / DNS in RTC on the first connect, then `WiFi.config(...)` with them before
  `WiFi.begin` on later wakes to bring the link up with no DHCP round-trip; clear the
  cache and fall back to DHCP if a static connect fails. ~10–20 % less Wi-Fi energy
  → roughly +1–2 days on the ~9–10 day life, no responsiveness cost. The bigger cost
  (TLS handshake) needs session resumption across deep-sleep, which the Arduino
  `WiFiClientSecure` wrapper doesn't expose cleanly — not worth it.
- **Bulk cap (470–1000 µF) across the battery pads** — not required (the cells run
  the board fine now), but would add margin for a weak/aged cell against the
  Wi-Fi + refresh current spikes.
- **Partial e-ink refresh** for the routine updates — lower current and no
  full-screen flash than the current full refresh. Needs base-image management
  across deep-sleep cold-boots; deferred since full refresh works.
