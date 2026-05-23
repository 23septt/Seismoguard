# Bill of Materials — SeismoGuard CDT2026

All parts are in the standard CDT2026 มัธยม/อาชีว hardware kit. No
out-of-kit purchases needed for the baseline build. Optional items are
nice-to-have add-ons (3D-printed case, etc.).

## Core electronics (in kit)

| Qty | Part | Role | Notes |
|---:|---|---|---|
| 1 | **Arduino UNO Q** | host (Linux MPU + STM32 MCU) | 2 GB RAM, runs detector + dashboard |
| 1 | **Modulino Movement** (LSM6DSOX) | 3-axis accelerometer + gyro | 100 Hz polled |
| 1 | **Modulino Buzzer** | siren | freq + duration via I²C |
| 1 | **Modulino Pixels** | 8 RGB LEDs | green/yellow/red state FSM |
| 1 | **Modulino Thermo** | *(optional)* DHT11-class T/RH | dropped from MVP, keep for post-quake bundle stretch |
| 1 | **Modulino Distance** | *(optional)* ToF | dropped from MVP, keep for fall-detect stretch |
| 1 | **Portable USB Speaker** | TTS playback | Thai voice via espeak-ng + aplay |
| 1 | **Ugreen 65 W Gan 3** charger | power | UNO Q under load ~8 W max |
| 2 | **USB-C cable** | UNO Q ← charger, UNO Q ↔ laptop | one each |
| 1 | **Kingston 16 GB flash** | backup of code + events.jsonl | bootable image optional |
| 1 | **Type-C mic** | *(optional)* future TTS recording | not in MVP |
| 1 | **UGREEN USB hub** | spare-port host | webcam, speaker, mic |
| 1 | **Webcam** | *(optional)* dashboard view | future vision-confirm add-on |
| 1 | **Camera (product photos)** | rubric/poster evidence | snap final assembly for the panel |

## Enclosure (optional but recommended)

| Qty | Part | Role | Source |
|---:|---|---|---|
| 1 | 3D-printed PLA case (base + lid) | rigid floor-coupled enclosure | print on-site, ~5 hr |
| 4 | M3 self-tap screws (×6 mm) | hold UNO Q to base | kit |
| 4 | M4 bolts + nuts | bolt base to table | kit |
| 1 | Foam isolation pad | *(NOT recommended)* under enclosure | breaks vibration coupling, only for power-only mock-up |

Fallbacks if no 3D printer: laser-cut 3 mm acrylic (kit allows) or
hot-glue-on-foamboard. See `enclosure/README.md`.

## Software dependencies (zero-cost)

| Layer | Tool | Version | Source |
|---|---|---|---|
| MCU sketch | Arduino IDE | 2.x | arduino.cc |
| MCU lib | `Arduino_Modulino` | latest | Library Manager |
| Linux side | Python | 3.10+ | pre-installed on UNO Q image |
| Linux libs | `pyserial`, `flask`, `requests` | via `linux/requirements.txt` | pip |
| TTS | `espeak-ng` | apt | provides Thai voice |
| Audio | `aplay` (alsa-utils) | apt | wav playback |

## Cost summary

| Category | Cost (฿) |
|---:|---|
| All electronics (kit, no purchase needed) | **0** (loaner) |
| Equivalent retail BOM (for reference) | ~2,000 |
| Software | 0 (all OSS) |
| Enclosure consumables (PLA, M3/M4) | ~50 |
| **Total marginal cost to build** | **~50 ฿** |

Reference for the "vs commercial EEW" pitch line: commercial single-
station EEW nodes (Sentinel, ShakeAlert reference) start around **฿100,000+**
per station. Our prototype delivers the core detection function (P-wave
trigger + Mw-gated alert) at **2 % of that cost**, with the accessibility
multi-modal alert layer that commercial nodes typically lack.
