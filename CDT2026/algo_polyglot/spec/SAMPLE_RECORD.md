# SeismoGuard SampleRecord — canonical communication schema

Every port (Python, Rust, Java, C) emits one `SampleRecord` per IMU sample
as a single-line JSON object. Byte-for-byte field set is the same across
languages — that's the whole point of pinning it here.

## Schema

| Field | Type | Unit | Meaning |
|---|---|---|---|
| `timestamp_ms` | `uint32` | ms since algo start | wall time of this sample |
| `sta_lta_ratio` | `float` | dimensionless | STA/LTA ratio after spike-clamp + LTA floor |
| `cf_z` | `float` | m²/s⁴ | characteristic function — instantaneous, dz² with spike clamp applied |
| `mpd_raw` | `float` | metres | running max peak displacement (Pd) accumulator since trigger; 0.0 when not in window |
| `sample_count` | `uint16` | samples | cumulative sample index since algo start (wraps at 65536) |

### Example line

```
{"timestamp_ms":12345,"sta_lta_ratio":1.234,"cf_z":1.23e-05,"mpd_raw":0.0,"sample_count":1234}
```

### Field notes

- `cf_z`: characteristic function used by the STA/LTA detector, after the
  spike clamp (`cf = min(dz², SPIKE_LIMIT · LTA)`). Pre-clamp raw value is
  not emitted — clamp is part of the algorithm contract.
  - **Deliberate divergence from the S3 firmware:** the anti-tap gate
    (`cf >= MIN_TRIG_CF_ABS`) evaluates the **raw** `dz²`, not the clamped
    `cf_z`. In quiet environments (LTA at floor) the clamp would push
    `cf_z` below 2e-4 and block all triggers. All ports implement this
    fix identically — verify against the Python reference output.
- `mpd_raw`: "max peak displacement, raw" = the live Pd value the detector
  uses to estimate Mw. Stays at 0 outside the 3-second post-trigger window
  and resets to 0 each time a new window opens.
- `sample_count`: wraps at 2¹⁶. For long captures, downstream consumers
  should treat it as a monotonic modular counter, not an absolute index.

## Canonical algorithm constants (locked)

All ports MUST use these exact values. Changing any one means recomputing
the F1/AUC against STEAD before re-tagging.

| Constant | Value | Source |
|---|---|---|
| `SAMPLE_RATE_HZ` | 100 | UNO Q LSM6DSOX target rate |
| `DT` | 0.01 s | 1 / SAMPLE_RATE_HZ |
| `ALPHA_STA` | 0.02 | 1 / (0.5 s · 100 Hz) |
| `ALPHA_LTA` | 0.000333 | 1 / (30 s · 100 Hz) |
| `ALPHA_DC` | 0.001 | DC tracker τ ≈ 10 s |
| `RATIO_TRIGGER` | 6.0 | STEAD grid-search optimum (F1=0.995) |
| `RATIO_DETRIGGER` | 1.5 | hysteresis |
| `MIN_TRIG_COUNT` | 3 | 30 ms sustained over threshold |
| `SPIKE_LIMIT` | 50.0 | × LTA — clamp to ceiling |
| `LTA_FLOOR` | 1e-9 | prevent div-by-zero |
| `MIN_TRIG_CF_ABS` | 2e-4 | reject sub-mg taps |
| `WINDOW_SAMPLES` | 300 | 3 s @ 100 Hz |
| `HPF_ALPHA` | 0.9901 | τ=1.0 s nominal, dt=0.01 → α = τ/(τ+dt) |
| `MW_PD_A` | 0.813 | Wu & Kanamori (2005) BSSA, Taiwan |
| `MW_PD_B` | 1.512 | " |
| `MW_PD_C` | 5.130 | " |
| `MW_R_KM_DEFAULT` | 10.0 | single-station fixed distance (preliminary) |

## State machine

```
   STANDBY ──ratio≥6.0 & cf≥2e-4 (×3)──▶ DETECTING
       ▲                                     │
       │                                     │ window of 300 samples completes
       │                                     ▼
   LOCKOUT  ◀── alarm timeout (15s) ── ALARMING ◀── Mw ≥ T2
       │                                     ▲
       │                                     │ Mw < T1
       └──── reseed LTA, 5s elapsed ─────────┘ (silent reset to STANDBY)
```

Each port implements this machine identically. Differences would invalidate
cross-port test parity.
