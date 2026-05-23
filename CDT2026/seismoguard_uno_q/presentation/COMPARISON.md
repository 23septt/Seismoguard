# SeismoGuard vs. existing EEW solutions

A competitive snapshot for the pitch. Quote sparingly — judges will not
forgive over-claiming. Sources listed at the bottom.

## At-a-glance

| | **SeismoGuard CDT2026** | ShakeAlert (USGS) | MyShake (Berkeley) | Earthquake Network (Crowdsource) | JMA EEW (Japan) |
|---|---|---|---|---|---|
| Sensor | Modulino LSM6DSOX (MEMS) | broadband seismometers | smartphone IMU | smartphone IMU | seismograph network |
| Per-station cost | **~฿2,000** (kit) | **฿100k+** | smartphone (~฿10k+) | smartphone | **millions ฿** |
| Detection algo | STA/LTA + Pd Mw-gate | STA/LTA + Pd / FinDer | ANN on IMU + GPS | crowd-vote | STA/LTA, multi-station |
| Validation set | STEAD 689 events, F1=0.995 | decades of catalogue | published 2019 (>200 quakes) | crowd-validated | decades, gold standard |
| Latency to alert | ≤ 500 ms T1, ≤ 3.2 s T2 | 3–7 s (after multi-station confirm) | ~5–10 s | ~10 s+ | 1–5 s |
| Alert channels | **Buzzer + LEDs + Thai TTS + ntfy** | phone push, sirens | phone push only | phone push only | TV/radio/phone |
| Multi-modal (deaf/blind ok) | **YES — by design** | partial (vibration) | NO (visual only) | NO (visual only) | YES (multi-broadcast) |
| Per-station deploy | tabletop, plug-and-play | site survey + install crew | install app | install app | dedicated infra |
| Open source | **YES — MIT/MPL** | partial | NO | NO | NO |
| Personal/private deploy | **YES** | NO (network only) | partial | partial | NO |
| Works offline | **YES** (local siren + LED + TTS) | requires network for alert | requires network | requires network | requires network |

## What SeismoGuard does that's actually new

1. **Multi-modal alert as a design requirement.** ShakeAlert and JMA push
   to phones; MyShake and EQNet are visual-first. Deaf users with no
   smartphone are left out. SeismoGuard fires four channels at once
   (siren + LED flash + Thai TTS + push) by default. It's the only
   solution in this table designed around accessibility from the start.

2. **Personal/private deploy + offline operation.** Commercial EEW is a
   subscription to someone else's network. SeismoGuard runs locally —
   no internet required for the core alert chain. Useful for elderly
   in condos with flaky WiFi, or rural sites outside ShakeAlert/JMA
   coverage.

3. **Four-language polyglot port** with bit-identical (1e-9) parity. Any
   downstream consumer (school project, NGO, research lab) can pick the
   language they already know and ship — Python for analysis, C/Rust
   for production deploys, Java for JVM integration. The schema is
   the integration surface, not the language.

4. **Mw-gated alert.** Most low-cost EEW prototypes are ratio-only —
   they fire on STA/LTA exceeding threshold. That makes them brittle:
   a tap on the sensor spikes the ratio. SeismoGuard adds a 3-second
   Pd window + Mw estimate gate. The tap test in our demo proves this
   directly: window opens, but Mw < threshold → silent reset.

## What we're honest about

- **F1=0.995 is on simulated MEMS replay of STEAD waveforms**, not on
  raw real-quake data captured by our specific Modulino. Field testing
  is on the roadmap, not the manifesto.
- **Wu & Kanamori 2005 coefficients are Taiwan-calibrated.** Thailand
  recalibration would need a local catalogue of P-wave Pd values — not
  done. Mw is preliminary.
- **Single-station Mw assumes R = 10 km fixed.** True epicenter
  distance needs multi-station mesh (ESP-NOW roadmap).
- **MEMS noise floor degrades real-world TPR/FPR** vs broadband
  seismometers. We expect ≥1 false alert per week in deployment,
  vs ShakeAlert's much lower rate.

## When to pick SeismoGuard vs alternatives

- **Pick SeismoGuard for:** personal/family use, low budget, accessibility
  matters (elderly, deaf, blind), prototype/research deploys, schools.
- **Pick ShakeAlert/JMA for:** authoritative regional network, integration
  with civil defense, life-critical infrastructure (hospitals, nuclear).
- **Pick MyShake/EQNet for:** crowd-density urban areas where smartphone
  penetration is high and a third-party app is acceptable.

## Sources

- ShakeAlert: USGS, [https://www.shakealert.org/](https://www.shakealert.org/)
- MyShake: Allen et al., 2019. *Berkeley Seismology Lab*. App on iOS/Android.
- Earthquake Network: F. Finazzi et al., 2016. *BSSA*. Crowdsourced EEW app.
- JMA EEW: [https://www.data.jma.go.jp/eew/](https://www.data.jma.go.jp/eew/)
- STEAD dataset: Mousavi et al., 2019. *IEEE Access*.
- Wu & Kanamori 2005: *Bulletin of the Seismological Society of America*,
  Pd-Mw scaling for Taiwan EEW.
