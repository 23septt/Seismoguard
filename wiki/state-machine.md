# State Machine — STANDBY / DETECTING / ALARMING / LOCKOUT

**Status:** #stable
**Category:** Algorithms & Methods
**Related:** [[STA/LTA Recursive Algorithm]] · [[Spike Rejection]] · [[Project — Earthquake Early Warning Device]]

## Purpose
Wraps the per-sample [[STA/LTA Recursive Algorithm]] with explicit operating modes so that LTA does not adapt away the signal during an event and so that the alarm is debounced.

## States and transitions
- **STANDBY** — LTA continues to track noise. Transition → **DETECTING** when `Ratio ≥ 5.0` (source: /raw/grid_search_top10_2026-04-14.md, §"Selected Operating Point").
- **DETECTING** — LTA is **frozen**. Count consecutive samples with `Ratio` still above threshold. Transition → **ALARMING** when count ≥ MIN = 10 samples; transition back → **STANDBY** if `Ratio` collapses before the count is reached (source: /raw/grid_search_top10_2026-04-14.md, §"Selected Operating Point").
- **ALARMING** — Buzzer/LED active. Transition → **LOCKOUT** when `Ratio < 1.5` for sustained samples or after a 3-second cap.
- **LOCKOUT** — Inhibits re-trigger for ~5 s, then returns to **STANDBY**.

## Implementation notes
- LTA freeze during DETECTING/ALARMING is critical: without it, a long event would pull the LTA up and the ratio would shrink to zero (source: /raw/earthquake.ino).
- The 6-second LTA bootstrap (300 samples at 50 Hz) requires the device to be stationary at power-on (source: /raw/critique_future_work_2026-04-14.md, §"Algorithm Limitations").

## Visual reference
See `/raw/flowchart_system.png` for the system flowchart that illustrates the state machine alongside the sampling loop (source: /raw/flowchart_system.png).
