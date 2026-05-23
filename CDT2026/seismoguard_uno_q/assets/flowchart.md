# SeismoGuard CDT2026 — Detection flowchart

Print A3, tape to demo table. Mirrors `linux/detector.py` + `arduino/seismoguard_uno_q.ino`.

```
 ┌────────────────────────────┐
 │ Modulino Movement (LSM6DSOX)│  100 Hz, 3-axis accel
 └──────────────┬─────────────┘
                │ ax, ay, az  (m/s²)
                ▼
 ┌────────────────────────────┐
 │ MCU: DC tracker (α = 0.001) │  remove gravity baseline
 └──────────────┬─────────────┘
                │ dz = az − baseline_z
                ▼
 ┌────────────────────────────┐
 │ MCU: CF = dz² + spike clamp │  cap at 50× LTA
 └──────────────┬─────────────┘
                │
                ▼
 ┌────────────────────────────┐
 │ MCU: recursive STA/LTA      │  STA τ=0.5s   LTA τ=30s
 │  ratio = sta / lta          │  LTA frozen when triggered
 └──────────────┬─────────────┘
                │
        ratio ≥ 6.0 for ≥ 3 samples AND cf ≥ 2e-4 ?
                │
       ┌────────┴────────┐
       │ NO              │ YES
       ▼                 ▼
   continue        ┌──────────────────────────┐
                   │ MCU: buzzer pre-tone     │  local fast-path heads-up
                   │      Pixels → YELLOW     │  (< 500 ms after P-onset)
                   │      emit "E,trigger"    │
                   └─────────────┬────────────┘
                                 │  USB serial 115200
                                 ▼
                   ┌──────────────────────────┐
                   │ Linux: open 3-s window   │
                   │  HPF→∫→HPF→∫→HPF (1 Hz)  │  drift-killed double integration
                   │  accumulate Pd, τc       │
                   └─────────────┬────────────┘
                                 │  300 samples (3 s @ 100 Hz)
                                 ▼
                   ┌──────────────────────────┐
                   │ Linux: Mw estimate       │
                   │  Mw = 0.813·log Pd       │  Wu & Kanamori 2005
                   │     + 1.512·log R        │  R = 10 km (single-station)
                   │     + 5.130              │
                   └─────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
        Mw ≥ 4.5 (T2)      Mw ≥ 3.5 (T1)       Mw < 3.5
              │                  │                  │
              ▼                  ▼                  ▼
   ┌────────────────────┐  ┌──────────────┐  ┌──────────────┐
   │ siren + RED flash  │  │ short tone   │  │ silent reset │
   │ + Thai TTS         │  │ + YELLOW     │  │ no alarm     │
   │ + ntfy push        │  │              │  │              │
   │ (30 s cooldown)    │  │ (30 s cd)    │  │ → STANDBY    │
   └────────────────────┘  └──────────────┘  └──────────────┘
```

## Why this design

- **STA/LTA** = ratio-based detector, adaptive to whatever noise floor the
  venue throws at us. Standard in seismology since the 1980s.
- **3-second window** = enough for Pd to converge (Allen 2007, Wu 2008).
- **Mw gate** = a tap on the sensor spikes the ratio but has tiny energy →
  Pd stays small → Mw below threshold → no false alarm. Pure ratio-based
  EEW prototypes fail this test; we don't.
- **Split MCU/Linux** = MCU does the time-critical sampling and pre-tone
  (sub-frame latency). Linux does the heavy float64 pipeline and can be
  retuned without reflashing.
