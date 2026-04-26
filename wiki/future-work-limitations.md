# Future Work & Limitations

**Status:** #stable
**Category:** Strategies / Recommendations
**Related:** [[Project — Earthquake Early Warning Device]] · [[STEAD Dataset]] · [[MPU6050 Sensor]] · [[STA/LTA Recursive Algorithm]] · [[Characteristic Function (Z-axis)]]

> Source for this page: /raw/critique_future_work_2026-04-14.md (synthesized 2026-04-14). Project priority is the warning device, not the simulator — items below are weighted accordingly.

## 1. Dataset Limitations
- STEAD ≠ MPU6050. Station-grade noise floor and bandwidth flatter the algorithm; real MPU6050 deployment will see worse SNR (source: /raw/critique_future_work_2026-04-14.md, §1).
- Only 38 noise samples — wide CI on the 2.6% false-alarm figure. Recommend ≥500 categorized samples (vehicle pass, jump, door slam, washing machine) (source: /raw/critique_future_work_2026-04-14.md, §1).
- No real earthquake field test (source: /raw/critique_future_work_2026-04-14.md, §1).

## 2. Warning System Incompleteness *(highest-impact gap)*
- **No remote alert path.** Buzzer/LED on-device only. Recommend ESP8266/ESP32 + Wi-Fi → LINE Notify / Telegram Bot / MQTT; LoRa or GSM/SIM800L for remote sites (source: /raw/critique_future_work_2026-04-14.md, §2).
- **No magnitude estimation.** Add Pd method (peak displacement of first ~3 s of P-wave) with Wu & Zhao or Kanamori regression (source: /raw/critique_future_work_2026-04-14.md, §2).
- **Single-station detection.** Real EEW (ShakeAlert, JMA) requires ≥3–4 stations; recommend mesh with "≥2 nodes within 5 s" rule (source: /raw/critique_future_work_2026-04-14.md, §2).
- **No GPS time sync** → cannot compute S–P time or locate epicenter (source: /raw/critique_future_work_2026-04-14.md, §2).

## 3. Algorithm Limitations
- Z-axis-only [[Characteristic Function (Z-axis)]] misses S-/surface-wave-dominant motion. Retry 3-axis or PCA (source: /raw/critique_future_work_2026-04-14.md, §3).
- Fixed thresholds — no adaptation to noise environment. Add adaptive threshold tracking 1-min rolling noise floor (source: /raw/critique_future_work_2026-04-14.md, §3).
- No classification stage to separate earthquake vs human activity. Consider TFLite Micro on ESP32 (source: /raw/critique_future_work_2026-04-14.md, §3).
- Calibration sensitive — vibration during the 6 s LTA bootstrap (300 samples) corrupts baseline. Use rolling median + variance check (source: /raw/critique_future_work_2026-04-14.md, §3).

## 4. Hardware Limitations
- [[MPU6050 Sensor]] noise density ~16× worse than ADXL355 — propose ADXL345/ADXL355 as future hardware (source: /raw/critique_future_work_2026-04-14.md, §4).
- 50 Hz may be insufficient: P-waves can carry 30–40 Hz components — raise to 100 Hz with DLPF 21 Hz (source: /raw/critique_future_work_2026-04-14.md, §4).
- No backup power (mains often cut by quakes). Add Li-ion + TP4056 + boost converter (source: /raw/critique_future_work_2026-04-14.md, §4).

## 5. Evaluation Limitations
- 222 ms is "detection delay," not end-to-end latency. Excludes I²C read, buzzer activation. Measure end-to-end with logic analyzer (source: /raw/critique_future_work_2026-04-14.md, §5).
- No baseline comparison vs classic STA/LTA, AIC picker, Allen picker (source: /raw/critique_future_work_2026-04-14.md, §5).
- No ROC / PR analysis — only a single operating point reported. Sweep RATIO and plot (source: /raw/critique_future_work_2026-04-14.md, §5).

## 6. Report Additions to Consider
- Robustness section (temperature, brown-out behavior).
- Cost analysis vs commercial EEW.
- Failure Mode Analysis (sensor fault, power loss, MCU hang).
- Watchdog timer in firmware (source: /raw/critique_future_work_2026-04-14.md, §6).

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
(source: /raw/critique_future_work_2026-04-14.md, §"Priority Ranking")

## Three Honest Headline Weaknesses for Chapter 5
1. STEAD over-estimates real-world performance vs MPU6050 deployment.
2. On-device-only alert does not satisfy the EEW value proposition (warn *before* S-wave arrives).
3. Real-world FA rate likely higher than 2.6% (source: /raw/critique_future_work_2026-04-14.md, §"Headline Weaknesses").

## References
- Wu, Y.-M., & Zhao, L. (2006). Magnitude estimation using the first three seconds P-wave amplitude in earthquake early warning. *Geophysical Research Letters, 33*(16), L16312. https://doi.org/10.1029/2006GL026871
- Kanamori, H. (2005). Real-time seismology and earthquake damage mitigation. *Annual Review of Earth and Planetary Sciences, 33*, 195–214. https://doi.org/10.1146/annurev.earth.33.092203.122626
