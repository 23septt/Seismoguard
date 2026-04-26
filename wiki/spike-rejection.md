# Spike Rejection

**Status:** #stable
**Category:** Algorithms & Methods
**Related:** [[Characteristic Function (Z-axis)]] · [[STA/LTA Recursive Algorithm]] · [[Grid Search Optimization]]

## Rule
Before feeding a CF sample to STA, clip impulse-like outliers:

```
if CF_t > SPIKE_factor × LTA_{t−1}:
    CF_t ← SPIKE_factor × LTA_{t−1}
```

Selected `SPIKE_factor = 100×` based on grid search (source: /raw/grid_search_top10_2026-04-14.md, §"Selected Operating Point").

## Why
- A single dropped I²C sample, electrostatic discharge, or mechanical bump can push CF by orders of magnitude in one tick.
- Without clipping, the recursive STA spikes immediately above ratio threshold and triggers a false alarm.
- Clipping at a multiple of LTA preserves real seismic onsets (which evolve over many samples) while neutralizing single-sample artifacts (source: /raw/earthquake.ino).

## Sensitivity
The grid search shows that `SPIKE_factor` of 20×, 50×, and 100× all reach 100% detection on the STEAD set; the lower the cap, the longer the mean detection delay (14.4 → 11.4 → 11.1 samples) (source: /raw/grid_search_top10_2026-04-14.md, §"Top 10").
