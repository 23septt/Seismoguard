# Critique — Future Work & Weaknesses
**Source date:** 2026-04-14
**Context:** Synthesis delivered in advisory chat. Project emphasizes the warning device over the simulator.

## 1. Dataset Limitations
- STEAD = station-grade broadband/strong-motion seismometer data; not MPU6050 MEMS-grade.
  - Lower noise floor (~25 µg/√Hz class), higher native sample rate (100 Hz vs project 50 Hz).
  - Even after resampling to 50 Hz, noise character differs from real MPU6050 deployment.
  - **Recommendation:** capture MPU6050 noise traces from realistic environments (home/office/near road/foot traffic) and overlay STEAD P-waves on them.
- Only 38 noise samples in the test set.
  - 1/38 ≈ 2.6% FA rate has wide confidence interval.
  - **Recommendation:** expand to 500–1000 samples, categorize (vehicle pass, jump, door slam, washing machine, etc.).
- No real earthquake field test. No ground truth from local events.

## 2. Warning System Incompleteness
- No remote alert path. Buzzer/LED on-device only → user must be near.
  - **Recommendation:** ESP8266/ESP32 + Wi-Fi → LINE Notify / Telegram Bot / MQTT. Alternatives: LoRa for remote sites, GSM/SIM800L for SMS.
- No magnitude estimation. Real EEW uses Pd (peak displacement of first ~3s of P-wave).
  - **Recommendation:** integrate accel → velocity → displacement and apply Pd–M regression (Wu & Zhao 2006; Kanamori 2005).
- Single-station detection. Real EEW (ShakeAlert, JMA) requires confirmation from ≥3–4 stations.
  - **Recommendation:** mesh network with rule like "≥2 nodes detect within 5 s".
- No GPS time sync → cannot compute S–P time or locate epicenter.

## 3. Algorithm Limitations
- Z-axis only CF can miss S-wave/surface-wave dominant motion.
  - **Recommendation:** retry 3-axis CF after fixing noise calibration; or PCA to auto-pick the highest-energy axis.
- Fixed thresholds. Do not adapt to changing noise environment.
  - **Recommendation:** adaptive threshold tracking 1-minute rolling noise floor.
- No classification stage to distinguish earthquake vs human activity.
  - **Recommendation:** lightweight ML (TensorFlow Lite Micro on ESP32) using features such as dominant frequency, duration, amplitude envelope.
- Calibration sensitive. Vibration during the 6 s LTA bootstrap (300 samples) corrupts baseline.
  - **Recommendation:** rolling median instead of mean; add calibration-validity check (variance below threshold).

## 4. Hardware Limitations
- MPU6050 noise density ~400 µg/√Hz — ~16× worse than ADXL355 (~25 µg/√Hz).
  - **Recommendation:** state the trade-off (cost vs sensitivity) in the report; propose ADXL345/ADXL355 as future work.
- 50 Hz sample rate may be insufficient. Nyquist = 25 Hz; P-waves can carry 30–40 Hz components.
  - **Recommendation:** raise to 100 Hz with DLPF 21 Hz.
- No backup power. Earthquakes often cut mains.
  - **Recommendation:** Li-ion + TP4056 charger + boost converter.

## 5. Evaluation Limitations
- No detailed latency breakdown. The 222 ms detection-delay figure excludes I2C read latency, buzzer activation, true end-to-end latency.
  - **Recommendation:** measure end-to-end latency with oscilloscope/logic analyzer.
- No comparison to baseline algorithms (classic non-recursive STA/LTA, AIC picker, Allen picker).
- No ROC / PR analysis. Only single operating point reported.
  - **Recommendation:** sweep RATIO and plot ROC.

## 6. Report Additions to Consider
- Robustness section (temperature, brown-out behavior).
- Cost analysis vs commercial EEW.
- Failure Mode Analysis (sensor fault, power loss, MCU hang detection).
- Watchdog timer in firmware.

## Priority Ranking
| Rank | Action | Impact | Difficulty |
|------|--------|--------|-----------|
| 1 | Wi-Fi notification (LINE/Telegram) | Very High | Easy |
| 2 | MPU6050 noise dataset (500+) | Very High | Medium |
| 3 | Pd-based magnitude estimation | High | Medium |
| 4 | Multi-node mesh confirmation | High | Hard |
| 5 | Real-quake field test | High | Time-bound |
| 6 | TFLite Micro classifier | Medium | Hard |
| 7 | Battery backup | Medium | Easy |
| 8 | ROC analysis in report | Low | Easy |

## Headline Weaknesses to Document Honestly in Chapter 5
1. STEAD over-estimates real-world performance vs MPU6050 deployment.
2. On-device-only alert does not satisfy the EEW value proposition (warn before S-wave).
3. Real-world FA rate likely higher than 2.6%.
