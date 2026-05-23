# SeismoGuard

An earthquake early warning device built on microcontroller. It detects P-waves using a accelerometer and sends push notifications via ntfy.sh before the shaking arrives.

## What it does

- Detects P-wave onset in real time using a recursive STA/LTA algorithm
- Displays a live seismograph on a small TFT screen
- Sends phone alerts (ntfy.sh) when a potential earthquake is detected
- Runs on ~$18 of hardware

## Repository layout

```
Code/        — detection algorithms and firmware (ESP32-S3)
Data/        — STEAD waveform samples and evaluation results
CDT2026/     — sensor degradation and comparison analysis
wiki/        — algorithm and design notes
tests/       — hardware test sketches
```
