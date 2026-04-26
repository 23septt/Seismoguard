# LLM Wiki — Master Index

> Maintained by the Knowledge Architect & Librarian.
> Each entry below links to an atomic Markdown page in `/wiki/`.

## Categories

### Projects
- [[Project — Earthquake Early Warning Device]](project-eew-device.md) — STA/LTA-based single-station P-wave detector on MPU6050.

### Concepts & Theory
- [[Characteristic Function (Z-axis)]](characteristic-function.md) — `(a_z − mean)²` preprocessor feeding STA/LTA.

### Datasets
- [[STEAD Dataset]](stead-dataset.md) — STanford EArthquake Dataset; 200 P-wave (stratified Mw 3–6+) + 100 noise samples used for validation.

### Algorithms & Methods
- [[STA/LTA Recursive Algorithm]](sta-lta-recursive-algorithm.md) — EMA-based onset detector.
- [[Spike Rejection]](spike-rejection.md) — clip CF at 100× LTA to suppress single-sample artifacts.
- [[State Machine]](state-machine.md) — STANDBY / DETECTING / ALARMING / LOCKOUT.
- [[Grid Search Optimization]](grid-search-optimization.md) — 225-combo sweep selecting STA=0.5s, RATIO=5, MIN=10, SPIKE=100.
- [[ROC Analysis]](roc-analysis.md) — RATIO sweep 1.5–10.0; AUC=0.9689; deployed RATIO=5.0 (TPR=94%, FPR=1%, F1=0.964) on 200P+100N stratified dataset.
- [[Adaptive Threshold]](adaptive-threshold.md) — PAT v2 + 2D grid: bufSize=50/PK=1.1 → TPR=82%/FPR=0%/F1=0.898 (zero-FP, stratified 200P+100N).
- [[Pd Magnitude Estimation]](pd-magnitude.md) — double-integration of 3-s P-wave window; Wu & Kanamori (2005) Mw regression.

### Hardware & Components
- [[MPU6050 Sensor]](mpu6050-sensor.md) — 6-axis MEMS IMU; Z-axis used at 50 Hz.
- [[ESP32 LINE Notify Firmware]](esp32-line-notify.md) — ESP32 port with WiFi, LINE Notify HTTPS alert, Pd estimation, hardware timer ISR.

### People & Entities
- _(none yet)_

### Strategies / Recommendations
- [[Future Work & Limitations]](future-work-limitations.md) — prioritized roadmap and honest weaknesses for Chapter 5.

---

## Conventions

- **Atomic pages**: one concept per file; cross-link with `[[Double Brackets]]`.
- **Citations**: every statement is followed by `(source: /raw/<filename>, §<section or line>)`.
- **References**: external sources rendered in APA 7th at the bottom of each page under `## References`.
- **Status tags**: `#stub`, `#draft`, `#stable`, `#deprecated`.

## Activity
See `log.md` for the chronological history of ingest and lint operations.
