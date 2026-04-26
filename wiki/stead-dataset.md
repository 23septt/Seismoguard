# STEAD Dataset

**Status:** #stable  
**Category:** Datasets  
**Related:** [[STA/LTA Recursive Algorithm]] · [[Grid Search Optimization]] · [[ROC Analysis]] · [[Adaptive Threshold]] · [[Future Work & Limitations]]

---

## Description

STEAD (STanford EArthquake Dataset) is a global, labeled dataset of seismic and non-seismic waveforms collected from broadband and strong-motion stations worldwide. It is widely used to benchmark seismic onset detectors and ML pickers.

- **Size:** >1,050,000 earthquake waveforms + 100,000 noise waveforms
- **Channels:** 3-component (N, E, Z) at 100 Hz
- **Labels:** P-arrival and S-arrival sample indices, magnitude, depth, distance
- **Source:** Mousavi et al. (2019), IEEE Access

---

## Use in this project

### Extraction (`stead_extractor.py`)

Only the **Z-component (vertical)** channel is used, downsampled from 100 Hz → 50 Hz via `[::2]` to match MPU6050 firmware.

**P-wave window:** 300 samples = 50 (pre-onset quiet) + 250 (detection window) @ 50 Hz  
**Noise window:** 2,000 samples = 1,750 (warmup) + 250 (detection) @ 50 Hz

### Stratified Dataset (v3 — aligned to 2-tier alert thresholds)

| Bin | Mw range | Target | Extracted | Role |
|-----|----------|--------|-----------|------|
| sub | 3.0–4.5 | 100 | **100** ✓ | ต่ำกว่า threshold → ห้ามแจ้งเตือน |
| T1 | 4.5–5.0 | 100 | **100** ✓ | Tier-1: buzzer only |
| T2 | 5.0–6.5 | 200 | **200** ✓ | Tier-2: buzzer + LINE |
| crit | 6.5+ | 100 | **39** ⚠ | critical (STEAD limited) |
| **Total P-wave** | | **500** | **439** | |
| Noise | — | 250 | **250** ✓ | |

⚠ The crit bin (Mw 6.5+) contains only 39 samples because large earthquakes are rare in STEAD.

### Dataset Versions

| Version | P-wave | Noise | Stratification | Date |
|---------|--------|-------|---------------|------|
| v1 | 77 | 38 | None (Mw 3–7 mixed) | 2026-04-14 |
| v2 | 200 | 100 | Equal bins 50×4 (Mw 3–4/4–5/5–6/6+) | 2026-04-19 |
| **v3** | **439** | **250** | **Alert-tier bins** (sub/T1/T2/crit) | **2026-04-20** |

---

## Known Limitations

- STEAD signals come from station-grade broadband seismometers — noise floor and bandwidth are far better than [[MPU6050 Sensor]] in deployment.
- The crit bin has only 39 samples (target 100) — large Mw 6.5+ events are rare in STEAD.
- Pd magnitude estimation (Wu & Kanamori 2005) was calibrated for broadband seismometers; **overestimates Mw significantly on STEAD data**: 91% of Mw 3–4.5 events are estimated as Mw≥4.5 — see [[Pd Magnitude Estimation]] for details.
- No real earthquake field test conducted — see [[Future Work & Limitations]].

---

## References

- Mousavi, S. M., Sheng, Y., Zhu, W., & Beroza, G. C. (2019). STanford EArthquake Dataset (STEAD): A global data set of seismic signals for AI. *IEEE Access*, 7, 179464–179476. https://doi.org/10.1109/ACCESS.2019.2947848
