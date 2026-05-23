# SeismoGuard
Single-station MEMS earthquake P-wave detector with two-tier alert.

## Status
![Build Status](https://img.shields.io/badge/build-inactive-red) ![License](https://img.shields.io/badge/license-ISC-blue) ![Firmware](https://img.shields.io/badge/firmware-1.2.0--s3-green)

## Overview
SeismoGuard is a compact, open-source earthquake detection system using MEMS inertial sensors to identify P-waves. It features a two-tier alert system with local buzzer/LED and ntfy.sh push notifications, and includes an on-device TFT seismograph for real-time visualization. The system is validated on the STEAD dataset and designed for deployment in remote or low-power environments.

## Features
- P-wave detection using recursive STA/LTA on dz^2
- Two-tier alert system: Tier 1 (buzzer + LED) and Tier 2 (buzzer + LED + ntfy push)
- On-device TFT seismograph for real-time visualization
- MEMS-based sensor (MPU6050) for cost-effective deployment
- Validated on STEAD dataset with 439 P-waves and 250 noise samples
- ROC analysis and performance metrics available
- Fully open-source with Arduino and Node.js tooling

## Hardware (BOM)
| Component         | Part                     | Qty | Approx USD |
|------------------|--------------------------|-----|------------|
| ESP32-S3         | ESP32-S3 N16R8           | 1   | $8         |
| MPU6050          | MPU6050                  | 1   | $3         |
| TFT Display      | 1.8" ST7735 TFT          | 1   | $4         |
| Buzzer           | Passive buzzer           | 1   | $1         |
| Power            | USB power supply         | 1   | $2         |
| **Total**        |                          |     | **$18**    |

## Quickstart
1. Clone the repository.
2. Copy `seismoguard_s3/config.h.template` to `seismoguard_s3/config.h`.
3. Edit `config.h` to fill in `WIFI_SSID`, `WIFI_PASSWORD`, and `NTFY_TOPIC` (use a long random topic).
4. Install Arduino libraries:
   - Adafruit MPU6050
   - Adafruit Unified Sensor
   - Adafruit GFX
   - Adafruit ST7735 and ST7789
5. Set Arduino IDE board settings:
   - Board: ESP32S3 Dev Module
   - PSRAM: OPI PSRAM
   - Flash Size: 16MB
   - Partition: 16M Flash (3MB APP/9.9MB FATFS)
   - USB CDC On Boot: Enabled
6. Flash the firmware to the device.
7. Install the ntfy app and subscribe to your `NTFY_TOPIC`.

## Algorithm
SeismoGuard runs a recursive STA/LTA detector on the squared z-axis deviation, `(a_z − mean)²`. The short-term window (STA) is 0.5 s and the long-term window (LTA) is 30 s. Trigger ratio is 6.0; 3 consecutive over-threshold samples confirm a P-onset. A spike clip at 50× LTA suppresses single-sample artifacts. The detrigger ratio is 1.5 (absolute, not relative), and a 0.8× margin gates re-arming from LOCKOUT to STANDBY.

State machine:
```
                ratio >= 6.0          MIN_TRIG=3 hit
   STANDBY  ───────────────►  DETECTING  ───────────►  ALARMING
      ▲                                                     │
      │                                                     │ ratio < 1.5
      │     ratio < 1.5 × 0.8                               ▼
      └──────────────────────────────  LOCKOUT  ◄───────────┘
```

## Alert Tiers
| Tier | Threshold     | Action                     |
|------|---------------|----------------------------|
| 1    | peakRatio >= 8.0 | buzzer + LED             |
| 2    | peakRatio >= 25.0 | buzzer + LED + ntfy push |

Note: Both thresholds are untested and require calibration.

## Performance
| Metric | Value     | Notes                        |
|--------|-----------|------------------------------|
| F1     | 0.995     | STEAD 439 P + 250 noise      |
| AUC    | 0.9919    | STEAD 439 P + 250 noise      |
| TPR    | 94%       | 200 P + 100 N test stratified by Mw |
| FPR    | 1%        | 200 P + 100 N test stratified by Mw |

## Repository Layout
```
.
├── seismoguard_s3/
│   ├── seismoguard_s3.ino       (canonical firmware)
│   └── config.h.template
├── seismoguard_esp32.ino        (legacy, deprecated)
├── config.h.template            (legacy template)
├── roc_analysis.js
├── adaptive_threshold.js
├── param_test.js
├── pd_magnitude.js
├── stead_extractor.py
├── wiki/                         (concept pages)
├── POSTER_CONTENT.md
├── WhatToDo.md                   (roadmap)
└── package.json
```

## Analysis Scripts
- `node roc_analysis.js` — ROC sweep over RATIO_TRIGGER, AUC computation
- `node adaptive_threshold.js` — adaptive PAT v2 evaluation
- `node param_test.js` — grid search over (STA_WIN, RATIO, MIN_TRIG, SPIKE_LIMIT)
- `node pd_magnitude.js` — Pd peak-displacement -> Mw regression (informational only)
- `python3 stead_extractor.py` — extract STEAD HDF5 samples to JSON

## Known Limitations
- The STEAD dataset is broadband-grade, while the MPU6050 sensor is MEMS-based, leading to a noise gap.
- SeismoGuard is a single-station system and does not perform multi-node confirmation.
- Tier thresholds (RATIO_TIER1 and RATIO_TIER2) have not been tested in real-world events.

## Roadmap
See [WhatToDo.md](WhatToDo.md) for the project roadmap.

## Security
- ntfy.sh topics are public; use a long random `NTFY_TOPIC` to avoid spam.
- The legacy LINE Notify integration is discontinued as of 2025-03-31.
- The legacy firmware uses `setInsecure()` for TLS; pin the certificate before production use.

## License
ISC. See [package.json](package.json).

## Citation
```bibtex
@misc{<YOUR_NAME>_<YEAR>,
  author       = {<YOUR_NAME>},
  title        = {SeismoGuard},
  year         = {<YEAR>},
  url          = {<REPO_URL>},
  note         = {Open-source earthquake detection system}
}
```
