# STA/LTA Recursive Algorithm

**Status:** #stable
**Category:** Algorithms & Methods
**Related:** [[Characteristic Function (Z-axis)]] · [[Spike Rejection]] · [[State Machine]] · [[Grid Search Optimization]] · [[Project — Earthquake Early Warning Device]]

## Definition
Short-Term Average / Long-Term Average is a classical seismic onset detector. The recursive (EMA) variant updates STA and LTA via exponential moving averages instead of strict windowed sums, allowing O(1) per-sample updates suitable for microcontrollers (source: /raw/earthquake.ino).

## Update equations
- `STA_t = α_STA · CF_t + (1 − α_STA) · STA_{t−1}`
- `LTA_t = α_LTA · CF_t + (1 − α_LTA) · LTA_{t−1}` (frozen during DETECTING/ALARMING/LOCKOUT)
- `Ratio_t = STA_t / LTA_t`
- α derived from window length: `α = 1 − exp(−Δt / τ)` where τ is the desired window in seconds (source: /raw/param_test.js).

## Operating parameters (selected by [[Grid Search Optimization]])
- STA window τ_STA = 0.5 s
- LTA window τ_LTA = 30 s (held fixed across the search)
- Trigger ratio threshold = **6.0** (v3 optimal, 439P+250N stratified STEAD)
- Minimum consecutive ratio-above-threshold samples = **3** × 20 ms = 60 ms latency
- Spike rejection factor = **50 × LTA**
- Source: grid search v3, 980 combinations, F1=0.995, TPR=100%, FPR=1%

## Why recursive form
- Constant memory & per-sample cost — suitable for ATmega/ESP-class hardware (source: /raw/earthquake.ino).
- Smooth response without abrupt window-edge artifacts.

## Known caveats
- Fixed thresholds do not adapt to varying noise environments — see [[Future Work & Limitations]] §3 (source: /raw/critique_future_work_2026-04-14.md, §"Algorithm Limitations").
- Calibration sensitive: vibration during the 6 s LTA bootstrap (300 samples) corrupts baseline (source: /raw/critique_future_work_2026-04-14.md, §3).

## References
- Allen, R. V. (1978). Automatic earthquake recognition and timing from single traces. *Bulletin of the Seismological Society of America, 68*(5), 1521–1532.
- Withers, M., Aster, R., Young, C., Beiriger, J., Harris, M., Moore, S., & Trujillo, J. (1998). A comparison of select trigger algorithms for automated global seismic phase and event detection. *Bulletin of the Seismological Society of America, 88*(1), 95–106.
