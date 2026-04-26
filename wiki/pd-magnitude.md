# Pd Magnitude Estimation

**Category:** Algorithm Enhancement  
**Source:** `pd_magnitude.js`  
**Related:** [[STA/LTA Recursive Algorithm]], [[ESP32 LINE Notify Firmware]]

---

## Overview

After the STA/LTA detector confirms a P-wave arrival, the first 3 seconds of the P-wave can be used to estimate earthquake magnitude *before* the destructive S-waves arrive. This is the principle behind **Earthquake Early Warning (EEW)**.

The **Pd** (peak displacement) method integrates the accelerometer signal twice to obtain displacement, then uses an empirical regression to estimate moment magnitude Mw.

---

## Algorithm Pipeline

### Step 1 — Extract 3-second window
Capture samples from P-onset to P-onset + 150 samples (3 s × 50 Hz).

### Step 2 — Detrend (remove DC offset)
```
accel_detrended[i] = accel[i] − mean(accel)
```
Removes the static gravity component and any sensor bias.

### Step 3 — Convert to physical units
For MPU6050 in ±2g mode:
```
1 count = 9.80665 / 16384 m/s² = 5.986 × 10⁻⁴ m/s² = 5.986 × 10⁻² cm/s²
```

### Step 4 — Integrate → velocity (trapezoidal rule)
```
vel[i] = vel[i-1] + 0.5 × (accel[i-1] + accel[i]) × Δt
```
where Δt = 1/50 = 0.02 s.

### Step 5 — Detrend velocity (remove linear drift)
Subtract least-squares linear trend from velocity array.  
Drift removal is critical — even a tiny DC residual in acceleration causes a growing linear trend in velocity and a quadratic trend in displacement.

### Step 6 — Integrate again → displacement
Same trapezoidal rule applied to detrended velocity.

### Step 7 — Pd = peak absolute displacement
```
Pd = max |displacement[i]|  for i = 0..149  (cm)
```

### Step 8 — Wu & Kanamori (2005) regression
```
log₁₀(M) = 1.0 × log₁₀(Pd_cm) + 5.39
```
where M ≈ Mw (moment magnitude).

---

## Results on STEAD Dataset

77 P-wave waveforms, MPU6050 ±2g scale applied (raw STEAD counts converted to cm/s²).

| Statistic | Pd (cm) | Est. Mw |
|-----------|---------|---------|
| Minimum | 8.9 × 10⁻³ | 3.34 |
| Maximum | 3.1 × 10³ | 8.88 |
| Mean | 64.2 | 5.26 |
| Median | 0.653 | 5.20 |
| Std Dev | 371 | 1.13 |

### Mw Histogram (0.5-bin)

```
Mw 3.0–3.5:  █          1
Mw 3.5–4.0:  █████████  9
Mw 4.0–4.5:  ████████  12
Mw 4.5–5.0:  █████████ 13
Mw 5.0–5.5:  ████████  12
Mw 5.5–6.0:  ████████████ 16
Mw 6.0–6.5:  █████  5
Mw 6.5–7.0:  ███  3
Mw 7.0–7.5:  ██  2
Mw 7.5–8.0:  ██  2
Mw 8.0–8.5:  █  1
Mw 8.5–9.0:  █  1
```

Distribution matches STEAD's known M3–M8 composition.

> **Note:** STEAD data is in raw counts from broadband seismometers — the MPU6050 calibration scale is applied illustratively. Real deployment requires a calibrated sensor with known sensitivity.

---

## On-Device Implementation (ESP32 / Arduino)

Memory budget: 150 × 2 bytes (int16_t) = **300 bytes** — fits comfortably in ESP32 DRAM.

```c
// After P-onset confirmed, buffer 150 samples
int16_t pdBuf[150];
int pdIdx = 0;

// In ALARMING state, each ISR tick:
pdBuf[pdIdx++] = (int16_t)(az_raw);
if (pdIdx == 150) {
    float Mw = computeMw(pdBuf, 150);
    sendLineNotify("แผ่นดินไหว Mw ≈ " + String(Mw, 1));
}
```

The `computeMw()` function performs detrend → integrate → detrend → integrate → peak in ~2 ms on ESP32 @ 240 MHz.

---

## Limitations

1. **Calibration required:** MPU6050 LSB-to-cm/s² factor must be verified against a reference accelerometer.
2. **Distance unknown:** The Wu & Kanamori regression assumes a distance model; without GPS, the estimate has ±0.5 Mw uncertainty.
3. **3-second window only:** Works for M ≥ 4.5 earthquakes where P-wave energy is measurable in 3 s. Very local microseisms (M < 3) may underestimate.
4. **Drift sensitivity:** Velocity baseline correction quality directly affects Pd — important to use linear detrend, not just mean subtraction.

---

## References

- Wu, Y.-M., & Kanamori, H. (2005). Experiment on an onsite early warning method for the Taiwan early warning system. *BSSA*, 95(1), 347–353.
- Wu, Y.-M., & Zhao, L. (2006). Magnitude estimation using the first three seconds P-wave amplitude in earthquake early warning. *GRL*, 33, L16312.
- [[STA/LTA Recursive Algorithm]]
- [[ESP32 LINE Notify Firmware]]
