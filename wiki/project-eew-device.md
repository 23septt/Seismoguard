# Project — Earthquake Early Warning Device

**Status:** #stable  
**Category:** Projects  
**Related:** [[STA/LTA Recursive Algorithm]] · [[Characteristic Function (Z-axis)]] · [[State Machine]] · [[Spike Rejection]] · [[MPU6050 Sensor]] · [[STEAD Dataset]] · [[Grid Search Optimization]] · [[ROC Analysis]] · [[Pd Magnitude Estimation]] · [[Future Work & Limitations]]

---

## One-line summary

A low-cost, single-station Earthquake Early Warning (EEW) device that detects P-wave onset on a vertical-axis MEMS accelerometer using a recursive STA/LTA detector, estimates magnitude via Pd method, and issues a 2-tier alert (buzzer + LINE Notify).

---

## Pipeline

1. Read Z-axis acceleration from [[MPU6050 Sensor]] at 50 Hz.
2. Compute [[Characteristic Function (Z-axis)]] `CF = (a_z − DC)²`.
3. Apply [[Spike Rejection]] with cap = **50 × LTA**.
4. Update STA (τ=0.5 s) and LTA (τ=30 s) recursively → ratio. See [[STA/LTA Recursive Algorithm]].
5. Run [[State Machine]] STANDBY → DETECTING → ALARMING → LOCKOUT.
6. On P-onset confirmation: collect 75-sample Pd buffer → estimate Mw via Wu & Kanamori (2005).
7. **2-tier alert:**
   - Mw < 4.5 → silent (log only)
   - Mw ≥ 4.5 → Tier-1: buzzer + LED
   - Mw ≥ 5.0 → Tier-2: buzzer + LED + LINE Notify (ESP32 only)

---

## Validation Results (v3 — 439P+250N stratified STEAD)

### STA/LTA Detection (RATIO=6.0, MIN=3, SPIKE=50)

| Metric | Value |
|--------|-------|
| TPR (overall) | **100%** (439/439) |
| FPR | **1%** (3/250) |
| F1 | **0.995** |
| ROC AUC | **0.9919** |
| Detection delay | **11.6 samples** (0.23 s after P-onset) |

**Per-bin detection:**

| Bin | Detected | Rate |
|-----|----------|------|
| sub Mw 3–4.5 | 99/100 | 99% |
| T1 Mw 4.5–5.0 | 100/100 | 100% |
| T2 Mw 5.0–6.5 | 200/200 | 100% |
| crit Mw 6.5+ | 39/39 | 100% |

### Pd Magnitude Estimation (post-detection)

| Bin (actual Mw) | Silent (<4.5) | Tier-1 (4.5–5) | Tier-2 (≥5.0) |
|---|---|---|---|
| sub 3–4.5 (n=100) | 9% ✓ | 12% | **79% ✗** overestimate |
| T1 4.5–5.0 (n=100) | 0% | 3% | **97%** ↑ Tier-2 |
| T2 5.0–6.5 (n=200) | 2% | 2% | **97%** ✓ |
| crit 6.5+ (n=39) | 0% | 3% | **97%** ✓ |

⚠ **Critical limitation:** 91% of sub-threshold events (Mw 3–4.5) are overestimated as Mw≥4.5 → trigger buzzer falsely. This reflects a known incompatibility between Wu & Kanamori (2005) broadband coefficients and MEMS sensor data.

---

## Hardware Variants

| Variant | File | Alert capability |
|---------|------|-----------------|
| Arduino Uno | `earthquake.ino` | Buzzer only (Tier-1) |
| ESP32 | `seismoguard_esp32.ino` | Buzzer + LINE Notify (Tier-1 + Tier-2) |

---

## Honest Limitations

See [[Future Work & Limitations]]. Three headline weaknesses:
1. STEAD broadband data over-estimates real-world MPU6050 performance.
2. Pd magnitude estimation incompatible with MEMS sensors — 91% overestimate on sub-threshold events.
3. Single-station, on-site detection — no advance warning time before S-wave arrives for nearby events.
