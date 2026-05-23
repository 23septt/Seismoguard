# SeismoGuard CDT2026 — Arduino UNO Q port

Earthquake Early Warning device for the **Coding Thailand 2026** competition
(มัธยม/อาชีว track). Ports the SeismoGuard EEW algorithm — STA/LTA trigger +
3-second Pd/Mw decision gate — to the competition hardware kit.

> Theme: **Health & Well-Being.** Pitch: personal/communal earthquake warning
> that detects P-waves and gives a few seconds of heads-up before destructive
> shaking — enough to take cover, stop cooking, etc.

This is a **new build** under `CDT2026/seismoguard_uno_q/`. It does not
modify the existing ESP32-S3 firmware in `Code/firmware/` — that remains the
source of truth for the original project.

## Hardware

| Component | Role |
|---|---|
| Arduino UNO Q (2 GB RAM, Linux + MCU) | host platform |
| Modulino **Movement** (LSM6DSOX) | 3-axis accelerometer, 100 Hz |
| Modulino **Buzzer** | local heads-up tone, T1/T2 siren |
| Modulino **Pixels** (8 LEDs) | state indicator (green/yellow/red) |
| Portable USB Speaker | Thai TTS alert playback |
| (optional) USB webcam | demo recording, not in detection loop |

All Modulinos chain over Qwiic I²C. No soldering required.

## Architecture

```
              ┌──────────────────────┐         ┌──────────────────────┐
              │ MCU side (Arduino)   │  USB    │ Linux side (Python)  │
              │  • 100 Hz IMU sample │ serial  │  • detector.py       │
              │  • STA/LTA trigger   │ <──────>│    HPF→∫→HPF→∫→HPF   │
              │  • local pre-tone    │ 115200  │    Pd, τc, Mw        │
              │  • Pixels FSM        │  CSV    │  • Mw decision gate  │
              │  • exec T1/T2 cmds   │         │  • Thai TTS + ntfy   │
              └──────────────────────┘         │  • Flask dashboard   │
                                               └──────────────────────┘
```

## Layout

```
seismoguard_uno_q/
├─ arduino/
│  ├─ seismoguard_uno_q.ino      MCU sketch (Modulino lib, self-test cmd)
│  ├─ config.h.template          per-venue threshold overrides
│  └─ BRIDGE_NOTES.md            MCU↔Linux wiring options (USB-CDC vs ttyHS1)
├─ linux/
│  ├─ detector.py                Pd/τc/Mw pipeline + decision
│  ├─ serial_bridge.py           parse MCU CSV, dispatch
│  ├─ alert.py                   TTS playback, ntfy, cooldown
│  ├─ dashboard.py               Flask live view (port 8080)
│  ├─ event_log.py               append-only JSONL log + rotation
│  ├─ main.py                    orchestrator
│  ├─ requirements.txt
│  └─ seismoguard.conf.example   copy to .conf and edit
├─ tests/
│  ├─ test_pipeline.py           unittest — pipeline sanity
│  └─ fixtures/synthetic_pwave.csv   500-sample canned waveform
├─ enclosure/
│  ├─ seismoguard_case.scad      OpenSCAD source (base + lid)
│  └─ README.md                  print + fallback notes
├─ presentation/
│  ├─ slides.md                  3-min pitch (pandoc-friendly)
│  ├─ QA_FLASHCARDS.md           judge Q&A drill
│  └─ README.md                  render commands + speaker notes
├─ BOM.md                        parts + cost summary
├─ scripts/
│  ├─ install.sh                 apt + pip bootstrap
│  ├─ calibrate.py               on-venue noise floor → threshold rec
│  ├─ gen_tts.py                 render Thai alert wavs (espeak-ng)
│  ├─ latency_probe.py           round-trip P-onset → alert measurer
│  └─ replay_stead.py            CSV → detector or → MCU stream
├─ assets/                       generated TTS wavs land here
├─ BUILD_DAY.md                  12-hour competition checklist
└─ README.md                     (this file)
```

## Quickstart

On the UNO Q Linux side, fresh image:

```bash
cd CDT2026/seismoguard_uno_q
bash scripts/install.sh
cp linux/seismoguard.conf.example linux/seismoguard.conf
# edit linux/seismoguard.conf — set ntfy_topic, venue_name
python3 scripts/gen_tts.py
```

Flash MCU sketch from Arduino IDE:
1. Open `arduino/seismoguard_uno_q.ino`
2. Install library: **Arduino_LSM6DSOX** (Library Manager)
3. Select board: Arduino UNO Q (MCU side)
4. Upload

Then run orchestrator:

```bash
ls /dev/ttyACM*                 # confirm MCU port
. .venv/bin/activate
python3 -m linux.main --port /dev/ttyACM0
# dashboard: http://<unoq-ip>:8080
```

## Algorithm summary

1. **MCU:** 100 Hz sample → DC tracker → Z-axis CF (dz²) → spike clamp →
   recursive STA/LTA (α_s = 0.02, α_l = 0.000333) → trigger when ratio ≥ 6.0
   for ≥ 3 consecutive samples AND raw CF ≥ 2×10⁻⁴ m²/s⁴ (anti-tap).
2. **Linux (on trigger):** open 3-second Pd window, run HPF (1 Hz) →
   integrate → HPF → integrate → HPF chain per sample, accumulate
   Pd = max|disp| and τc = 2π·√(Σdisp²/Σvel²).
3. **Decision:** Mw = 0.813·log₁₀(Pd) + 1.512·log₁₀(R) + 5.130
   (Wu & Kanamori 2005 BSSA, Taiwan coefficients).
   - Mw ≥ 4.5 → T2: siren + Pixels red flash + Thai TTS + ntfy push.
   - Mw ≥ 3.5 → T1: short tone + Pixels yellow.
   - Below → silent reset (no false alarm on tap).
4. **30-second cooldown** per tier to prevent spam.

## Improvements vs. original ESP32-S3 firmware

| Area | S3 firmware | UNO Q port |
|---|---|---|
| Sample rate | 50 Hz | **100 Hz** (Nyquist for P-wave 30–40 Hz content) |
| Decision compute | inline on MCU, float32 | Linux **float64**, easy to iterate without reflash |
| Display | 1.8″ ST7735 TFT | **Pixels** state FSM + Flask **web dashboard** (bigger surface for judges) |
| Alert path | ntfy only | **Buzzer + Pixels + Thai TTS + ntfy** (multi-modal — covers deaf/blind/asleep) |
| TLS | client.setInsecure() | ntfy push from Linux uses system CA bundle (requests) |
| Calibration | bench-tuned | `scripts/calibrate.py` runs **on-venue** before each demo |
| Threshold tuning | recompile | override in `arduino/config.h`, or just retune on Linux side without reflash |
| Tests | none | `tests/test_pipeline.py` runs offline (no hardware) |

## Rubric mapping (30 pts)

| Rubric item | Weight | Where it lives |
|---|---|---|
| Setup & Safety | 1.25× | `BUILD_DAY.md` H0–H1, enclosure + cable tie + ESD signage |
| **Core Implementation** | **2.5×** | end-to-end MCU↔Linux flow → live demo |
| Data & Testing | 1.25× | `tests/test_pipeline.py` + 2 live scenarios in `BUILD_DAY.md` |
| Debug & Explain | 1.25× | Flask dashboard ratio/state live + `assets/flowchart.md` |
| Participation | 1.25× | role split: HW / FW / Linux / present |

## Limitations (honest)

- **Single-station Mw is preliminary** — R is fixed at 10 km. Real EEW needs
  multi-station mesh + GPS for hypocentral distance. Documented in
  `linux/detector.py`.
- **Wu & Kanamori 2005 coefficients are Taiwan-calibrated.** Thailand
  recalibration requires a local catalog of P-wave Pd values, not in scope
  for the competition.
- **Modulino I²C addresses** in `seismoguard_uno_q.ino` use factory
  defaults. Confirm with `i2cdetect -y 1` on the UNO Q before flashing.
- **No persistent event log** on this build (S3 had FFat). Linux side keeps
  a session log only — add `logging.FileHandler` if persistence needed.

## Pitch hook (3-minute presentation outline)

1. **Pain.** Mar 2025 Mw 7.7 Sagaing → Bangkok high-rises shook → 시민들 had
   no warning. Elderly and disabled hit hardest. (Slide: news photo.)
2. **What it is.** ฿2,000 device that detects the **P-wave** (low-amplitude
   precursor) and gives a few seconds before destructive **S-wave** arrives.
3. **Demo.** Tap test → window opens but Mw below threshold → silent reset
   (no false alarm). Vibrator/shake → siren + Pixels red + Thai TTS + phone
   ntfy. Show dashboard with live ratio plot.
4. **How it works.** STA/LTA + 3-second Pd window + Mw gate. Validated F1 =
   0.995 on 689 STEAD samples (original SeismoGuard study).
5. **Why Health & Well-Being.** Multi-modal alert reaches everyone:
   sound (buzzer + TTS), light (Pixels), phone (ntfy). No one left behind.
