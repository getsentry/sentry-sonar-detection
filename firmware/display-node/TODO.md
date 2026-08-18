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

- **Bulk cap (470–1000 µF) across the battery pads** — not required (the cells run
  the board fine now), but would add margin for a weak/aged cell against the
  Wi-Fi + refresh current spikes.
- **Partial e-ink refresh** for the routine updates — lower current and no
  full-screen flash than the current full refresh. Needs base-image management
  across deep-sleep cold-boots; deferred since full refresh works.
