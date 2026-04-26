# Characteristic Function (Z-axis)

**Status:** #stable
**Category:** Algorithms & Methods
**Related:** [[STA/LTA Recursive Algorithm]] · [[MPU6050 Sensor]] · [[Spike Rejection]]

## Definition
The characteristic function (CF) preprocesses the raw acceleration stream into a strictly-positive, energy-like signal that the [[STA/LTA Recursive Algorithm]] can compare.

This project uses the squared-deviation form on the **Z-axis only**:

```
CF_t = (a_z(t) − mean(a_z))²
```

where `mean(a_z)` is the long-term DC level estimated during the LTA bootstrap window (source: /raw/grid_search_top10_2026-04-14.md, §"Constants Across All Top-10"; /raw/earthquake.ino).

## Why Z-axis only
- Vertical channel best resolves the P-wave first arrival in this hardware/dataset combination.
- Earlier 3-axis variant `CF = a_x² + a_y² + a_z²` was retired in favor of single-axis CF after empirical comparison.

## Limitations
- Misses events whose energy lies primarily in horizontal motion (S-wave or surface-wave dominant). Retrying 3-axis CF or PCA-derived principal axis is listed as future work (source: /raw/critique_future_work_2026-04-14.md, §"Algorithm Limitations").
