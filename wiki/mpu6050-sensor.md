# MPU6050 Sensor

**Status:** #stable
**Category:** Hardware & Components
**Related:** [[Project — Earthquake Early Warning Device]] · [[Characteristic Function (Z-axis)]] · [[Future Work & Limitations]]

## Role in project
6-axis MEMS IMU (3-axis accelerometer + 3-axis gyroscope) used as the vibration sensor for the warning device. Communicates via I²C with the MCU (source: /raw/earthquake.ino).

## Configuration in this project
- Interface: I²C
- Sample rate: 50 Hz
- Digital Low-Pass Filter (DLPF): 10 Hz cut-off
- Channel actually used by the algorithm: **Z-axis only** (vertical) (source: /raw/grid_search_top10_2026-04-14.md, §"Constants Across All Top-10").

## Strengths
- Very low cost.
- Straightforward I²C integration with Arduino-class MCUs.

## Limitations (deferred to [[Future Work & Limitations]])
- Noise density ~400 µg/√Hz, roughly 16× worse than ADXL355 (~25 µg/√Hz) (source: /raw/critique_future_work_2026-04-14.md, §"Hardware Limitations").
- 50 Hz sampling: Nyquist = 25 Hz, but P-waves can carry 30–40 Hz components in some cases — recommend raising to 100 Hz with DLPF 21 Hz (source: /raw/critique_future_work_2026-04-14.md, §4).
- No on-device noise dataset has been collected yet for realistic environments — STEAD noise is from station-grade instruments, not MPU6050 (source: /raw/critique_future_work_2026-04-14.md, §"Dataset Limitations").

## References
- InvenSense. (2013). *MPU-6000 and MPU-6050 product specification* (Rev. 3.4). InvenSense Inc.
