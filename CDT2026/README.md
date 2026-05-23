# CDT2026 — Coding Thailand 2026 work

Everything in this folder is the **Coding Thailand 2026** competition
track work. The original SeismoGuard EEW project (ESP32-S3, S3 firmware,
STEAD analysis, manuscript) lives in `Code/`, `Data/`, `wiki/` at the
repo root and is **untouched** by this folder.

Theme: **Health & Well-Being.**
Hardware target: **Arduino UNO Q** (Linux MPU + STM32 MCU) + Modulino chain.

## Layout

```
CDT2026/
├─ seismoguard_uno_q/        the competition build (everything end-to-end)
│  ├─ arduino/               MCU sketch (Modulino lib, Self-test mode)
│  ├─ linux/                 Python detector + dashboard + alert + log
│  ├─ tests/                 unit tests
│  ├─ scripts/               install, calibrate, gen_tts, replay_stead, latency_probe
│  ├─ enclosure/             OpenSCAD 3D-print case
│  ├─ presentation/          3-min slide deck + judge Q&A flashcards
│  ├─ assets/                flowchart, TTS text
│  ├─ README.md              full architecture overview
│  ├─ BUILD_DAY.md           12-hour competition checklist
│  └─ BOM.md                 parts list + cost summary
│
├─ algo_polyglot/            the EEW algorithm in 4 languages
│  ├─ spec/                  canonical JSON SampleRecord schema + constants
│  ├─ python/                reference implementation (5 unit tests)
│  ├─ rust/                  Cargo crate (lib + bin + tests)
│  ├─ java/                  single-file Java 17+ with inline tests
│  ├─ c/                     C99 lib + CLI + Makefile (5 tests)
│  ├─ tools/parity_check.py  cross-port numerically-aware diff
│  └─ README.md              one-liner build/test per port
│
├─ 01_clean.js ... 04_*.js   prior CDT2026 sensor-degradation analysis
├─ visualization.html        prior visualization
└─ dataset_clean.json        prior cleaned dataset
```

## TL;DR for judges

1. **What it is.** An earthquake early warning device that detects the
   P-wave seconds before the destructive S-wave arrives. Multi-modal
   alert (siren + LEDs + Thai voice + phone push) covers everyone
   regardless of disability.
2. **What's working.** Algorithm validated at F1 = 0.995 on the open
   STEAD dataset (689 events). Ported to the UNO Q + Modulino kit.
   Demoable with tap (no false alarm) and shake (full alert chain).
3. **What's polyglot.** The detection algorithm is implemented four
   ways (Python, Rust, Java, C) against a single locked JSON schema,
   so the same data flow works across any of them.

## Start here

| If you want to... | Open |
|---|---|
| See the architecture | [seismoguard_uno_q/README.md](seismoguard_uno_q/README.md) |
| Walk the 12-hour build day | [seismoguard_uno_q/BUILD_DAY.md](seismoguard_uno_q/BUILD_DAY.md) |
| Wire MCU ↔ Linux (USB-CDC vs ttyHS1) | [seismoguard_uno_q/arduino/BRIDGE_NOTES.md](seismoguard_uno_q/arduino/BRIDGE_NOTES.md) |
| Read the pitch | [seismoguard_uno_q/presentation/slides.md](seismoguard_uno_q/presentation/slides.md) |
| Q&A drill | [seismoguard_uno_q/presentation/QA_FLASHCARDS.md](seismoguard_uno_q/presentation/QA_FLASHCARDS.md) |
| Competitive comparison | [seismoguard_uno_q/presentation/COMPARISON.md](seismoguard_uno_q/presentation/COMPARISON.md) |
| Backup demo storyboard | [seismoguard_uno_q/presentation/DEMO_VIDEO.md](seismoguard_uno_q/presentation/DEMO_VIDEO.md) |
| Algo schema spec | [algo_polyglot/spec/SAMPLE_RECORD.md](algo_polyglot/spec/SAMPLE_RECORD.md) |
| Bill of materials | [seismoguard_uno_q/BOM.md](seismoguard_uno_q/BOM.md) |
| Post-competition roadmap | [ROADMAP.md](ROADMAP.md) |
