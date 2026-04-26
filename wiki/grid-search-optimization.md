# Grid Search Optimization

**Status:** #stable  
**Category:** Algorithms & Methods  
**Related:** [[STA/LTA Recursive Algorithm]] · [[STEAD Dataset]] · [[Spike Rejection]] · [[ROC Analysis]]

---

## Purpose

Exhaustive sweep over the four tunable parameters of the [[STA/LTA Recursive Algorithm]] to find the operating point that maximises F1-score while keeping false alarm rate (FPR) low.

---

## Search Space (v3 — 439P+250N)

| Parameter | Values | Count |
|-----------|--------|-------|
| τ_STA window | 0.2, 0.3, 0.4, 0.5, 0.6 s | 5 |
| RATIO_TRIGGER | 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0 | 7 |
| MIN_TRIGGER_SAMPLES | 3, 5, 7, 8, 10, 12, 15 | 7 |
| SPIKE_REJECT_FACTOR | 20, 50, 100, 200 | 4 |
| **Total** | | **980 combinations** |

Each combination runs against **439 P-wave + 250 noise** = 689 traces → **677,220 simulations**.

---

## Scoring

```
score = TPR×100 − FPR×50 − delay×0.1
```

Penalises false alarms (×50) twice as much as delay (×0.1) to match alarm-system requirements.

---

## Top-10 Results (v3 — 439P+250N)

```
STA    RATIO  MIN  SPIKE │  TPR    FPR   Prec   F1    Delay │ Score
───────────────────────────────────────────────────────────────────────
0.5s   6.0     3    50 │  100%    1%   99%  0.995   11.6s │ 98.93  ← BEST
0.6s   6.0     3   200 │  100%    1%   99%  0.994   11.8s │ 98.81
0.6s   6.0     3   100 │  100%    1%   99%  0.994   11.9s │ 98.81
0.6s   6.0     3    50 │  100%    1%   99%  0.994   12.4s │ 98.80
0.5s   6.0     5   100 │  100%    1%   99%  0.994   12.8s │ 98.78
0.5s   6.0     5    50 │  100%    1%   99%  0.994   13.1s │ 98.77
0.6s   6.0     5   200 │  100%    1%   99%  0.994   13.6s │ 98.76
0.6s   6.0     5   100 │  100%    1%   99%  0.994   13.7s │ 98.75
0.5s   6.0     3   200 │  100%    2%   99%  0.994   11.3s │ 98.75
0.5s   6.0     3   100 │  100%    2%   99%  0.994   11.3s │ 98.75
```

---

## Selected Operating Point

| Parameter | Value | Notes |
|-----------|-------|-------|
| `STA_WINDOW_SEC` | **0.5 s** | τ_STA = 0.5 → ALPHA = 0.04 |
| `RATIO_TRIGGER` | **6.0** | Up from 4.0 (200P+100N best) |
| `MIN_TRIGGER_SAMPLES` | **3** | 3 × 20 ms = 60 ms latency |
| `SPIKE_REJECT_FACTOR` | **50** | |
| **TPR** | **100%** | 439/439 P-waves detected |
| **FPR** | **1%** | 3/250 noise false alarms |
| **F1** | **0.995** | |
| **Avg delay** | **11.6 samples** | 0.23 s after P-onset |

---

## Version History

| Version | Dataset | Best RATIO | MIN | F1 | FPR |
|---------|---------|-----------|-----|----|-----|
| v1 (2026-04-14) | 77P+38N | 5.0 | 10 | 0.994 | 3% |
| v2 (2026-04-19) | 200P+100N | 4.0 | 5 | 0.972 | 2% |
| **v3 (2026-04-20)** | **439P+250N** | **6.0** | **3** | **0.995** | **1%** |

---

## Caveats

- Score function does not include a real-world noise prior — STEAD noise may underestimate the [[MPU6050 Sensor]] noise floor in Thai urban environments.
- SPIKE=50 across all top-10 entries suggests SPIKE has limited discriminating power beyond a threshold; values 50–200 perform similarly.
- 3 persistent false alarms (noise[100], noise[145], noise[173]) — noise[100] is a high-amplitude outlier (rms=479, ~30× typical); the other two are transient spikes.
