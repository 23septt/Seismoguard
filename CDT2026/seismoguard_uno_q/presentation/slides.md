---
title: SeismoGuard EEW
subtitle: Coding Thailand 2026 — Health & Well-Being
author: Team SeismoGuard
date: 2026
theme: black
---

# 1. The pain

**28 March 2025** — Sagaing fault, Myanmar.
Mw **7.7**. Felt across Bangkok.

- High-rise residents had **no warning**.
- 30+ killed. Hundreds of buildings damaged.
- Most casualties: elderly, mobility-impaired, asleep, deaf.

> *Question: ถ้ารู้ล่วงหน้า 10 วินาที จะช่วยใครได้กี่คน?*

---

# 2. What SeismoGuard does

A **personal earthquake early warning** device.

- Detects the **P-wave** (the small precursor) in real time.
- Decides Mw within **3 seconds** of P-onset.
- Alerts in **4 channels** simultaneously: siren, light, voice, phone.
- Buys 5–60 s of heads-up before destructive S-wave arrives.
- **฿2,000 BOM**. Multi-modal so **no one is left out**.

---

# 3. How it works (30-second version)

```
IMU 100 Hz  →  STA/LTA trigger  →  3 s Pd window  →  Mw decision
   │              (ratio ≥ 6.0)        │                  │
   └─ Modulino    └─ MCU side          └─ Linux side      └─ Mw ≥ 4.5
      Movement                            float64 pipeline    fire alert
```

- **STA/LTA** = short-term/long-term-average ratio (industry standard,
  used in JMA EEW since 1980s)
- **Pd** = peak displacement after triple-HPF + double-integration
- **Mw** = Wu & Kanamori (2005) magnitude formula

Validated on **STEAD** open dataset: 689 events, F1 = **0.995**.

---

# 4. Live demo flow

**Scenario A — Tap test (false-positive reject)**

> Tap sensor → window opens → Mw below threshold → **silent reset**.
> No false alarm.

**Scenario B — Shake (true-positive)**

> Phone vibrator → trigger → Mw ≥ T2 → **siren + red flash + Thai TTS +
> phone push notification**.

Dashboard on screen shows live ratio + state + decision.

---

# 5. Why it works for **Health & Well-Being**

Multi-modal alert by design — no single point of failure:

| Channel | Reaches |
|---|---|
| Buzzer siren | hearing people, those nearby |
| Pixels red flash | deaf, hearing-impaired |
| Thai TTS voice | visually impaired, kids who can't read |
| ntfy phone push | people in another room |

Use case: elderly in high-rise condos. Bedside SeismoGuard wakes them
in time to brace under a doorway.

---

# 6. Numbers that matter

| Metric | Value | Source |
|---|---|---|
| F1 (STEAD eval) | **0.995** | 689 samples, grid-search optimum |
| False Positive Rate | **1%** | 3 / 250 noise samples |
| Detection delay | **232 ms** | from P-onset |
| Mw window | 3.0 s | post-trigger |
| End-to-end alert latency | **≤ 500 ms** (T1), **≤ 3.2 s** (T2) | bench probe |
| Cost (BOM) | ~**฿2,000** | competition hardware kit |
| Commercial EEW per-station | ~฿100,000+ | ShakeAlert reference |

---

# 7. What's novel here

- **Algorithm portable across 4 languages** (Python, Rust, Java, C) —
  one schema, one validation, deploy anywhere.
- **Mw-gated alert** — not just "ratio went up", checks the energy is
  consistent with a real earthquake. Rejects taps that fool simpler
  detectors.
- **Multi-modal accessibility-first** — explicitly designed for the
  people who suffer most from missed warnings.

---

# 8. Roadmap (post-competition)

- **Multi-station mesh** (ESP-NOW) — vote-based confirm → FPR ↓↓
- **Thailand-calibrated Mw coefficients** — recalibrate Wu & Kanamori
  against TMD/USGS local events
- **TFLite Micro classifier** — earthquake vs. footsteps/HVAC, post-trigger
- **Field deploy** in Chiang Rai for 30-day FA rate measurement
- **Public dashboard** — privacy-preserving alert map

---

# 9. Team & roles

| | |
|---|---|
| Hardware | wiring, enclosure, ESD, vibration coupling |
| Firmware | MCU sketch, threshold tuning, Modulino lib |
| Linux/Dashboard | detector pipeline, dashboard, ntfy, TTS |
| Presenter | this deck, Q&A, judge interaction |

---

# 10. Questions we expect

- **"ทำไม STA/LTA?"** Adaptive to whatever ambient noise the venue has.
- **"FPR เท่าไหร่?"** 1% on 689 STEAD samples (439 P-waves, 250 noise).
- **"ทำไมต้อง Mw gate?"** Tap spikes the ratio but has tiny energy →
  Pd stays small → no alarm.
- **"ต้นทุนเท่าไหร่?"** ~฿2,000 BOM (kit price), vs ฿100k+ for commercial.
- **"ถ้าไม่มีไฟทำไง?"** UNO Q rides through ~2 s; Li-ion add-on on roadmap.
- **"จริงไหมว่าใช้ได้?"** F1 = 0.995 on real seismograph data (STEAD).
  Hardware adaptation honest about MEMS noise floor — bench probe pending.

---

# Thank you

GitHub: github.com/23septt/Seismoguard
Theme: **Health & Well-Being** — Coding Thailand 2026
