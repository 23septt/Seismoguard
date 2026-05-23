# SeismoGuard

[![CDT2026 tests](https://github.com/23septt/Seismoguard/actions/workflows/cdt2026.yml/badge.svg)](https://github.com/23septt/Seismoguard/actions/workflows/cdt2026.yml)

An earthquake early warning device built on a microcontroller. It detects P-waves using a low-cost MEMS accelerometer and sends push notifications via ntfy.sh before the shaking arrives.

## What it does

- Detects P-wave onset in real time using a recursive STA/LTA algorithm
- Displays a live seismograph on a small TFT screen
- Sends phone alerts (ntfy.sh) when a potential earthquake is detected
- Runs on ~$18 of hardware

## Repository layout

```
Code/        detection algorithms and firmware (ESP32-S3, original build)
Data/        STEAD waveform samples and evaluation results
CDT2026/     Coding Thailand 2026 competition track — Arduino UNO Q + Modulino
             port, 4-language polyglot algorithm, slides, BUILD_DAY, BOM
wiki/        algorithm and design notes
tests/       hardware test sketches
```

## CDT2026 (Coding Thailand 2026 competition)

The `CDT2026/` folder is a self-contained competition build derived from this
project. See [`CDT2026/README.md`](CDT2026/README.md) for the entry point —
covers the UNO Q port (`CDT2026/seismoguard_uno_q/`), the four-language
polyglot algorithm (`CDT2026/algo_polyglot/`), and the original CDT2026
sensor-degradation analysis (`CDT2026/0[1-4]_*.js`). The original ESP32-S3
firmware in `Code/firmware/` is untouched by that work.
