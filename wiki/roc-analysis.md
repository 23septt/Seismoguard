# ROC Analysis

**Category:** Evaluation  
**Source:** `roc_analysis.js`, `roc_data.csv`  
**Related:** [[STA/LTA Recursive Algorithm]], [[Grid Search Optimization]]

---

## Overview

ROC (Receiver Operating Characteristic) analysis evaluates the SeismoGuard STA/LTA detector across all possible threshold settings. By sweeping the `RATIO_TRIGGER` parameter from 10.0 down to 1.5, each operating point's trade-off between sensitivity (TPR) and false alarm rate (FPR) is mapped.

---

## Method

| Parameter | Value | Notes |
|-----------|-------|-------|
| Fixed τ_STA | 0.5 s | Best from grid search |
| Fixed MIN_TRIG | 3 | Best from grid search |
| Fixed SPIKE | 50 | Best from grid search |
| RATIO sweep | 10.0 → 1.5 (step 0.1) | 86 operating points |
| Dataset | STEAD (stratified) | 439 P-wave + 250 noise |

**Dataset stratification (aligned to 2-tier alert thresholds):**

| Bin | Mw range | Count | Role |
|-----|----------|-------|------|
| sub | 3.0–4.5 | 100 | ต่ำกว่า threshold → ห้ามแจ้งเตือน |
| T1 | 4.5–5.0 | 100 | Tier-1 buzzer only |
| T2 | 5.0–6.5 | 200 | Tier-2 buzzer + LINE |
| crit | 6.5+ | 39 | critical (STEAD limited) |

250 noise samples → 95% CI upper bound for FPR ≤ 3.2% when FPR=1%.

**Metrics at each point:**

- **TPR (True Positive Rate / Sensitivity)** = TP / N_pwave
- **FPR (False Positive Rate)** = FP / N_noise
- **Precision** = TP / (TP + FP)
- **F1** = 2·Precision·TPR / (Precision + TPR)
- **AUC** — trapezoidal rule over sorted FPR points; area from last point to (1,1) included

---

## Results

**AUC = 0.9919**  (1.0 = perfect classifier, 0.5 = random)

### Key Operating Points

| RATIO | TPR | FPR | Precision | F1 | Avg Delay (samples) |
|-------|-----|-----|-----------|----|---------------------|
| 2.0 | 100% | 29% | 86% | 0.923 | 10.2 |
| 3.0 | 100% | 10% | 94% | 0.971 | 13.0 |
| 4.0 | 100% |  6% | 97% | 0.983 | 14.6 |
| 5.0 | 100% |  3% | 98% | 0.991 | 15.9 |
| **6.0** | **100%** | **1%** | **99%** | **0.994** | **17.4** ← deployed |
| 7.0 |  99% |  1% | 99% | 0.991 | 17.8 |
| 8.0 |  98% |  1% | 100% | 0.990 | 18.3 |

**Best F1 = 0.995 at RATIO = 6.0, MIN = 3** (TPR=100%, FPR=1%, delay=11.6 smp — grid search)  
**Deployed operating point: RATIO = 6.0** (TPR=100%, FPR=1%, F1=0.994)

### Interpretation

- AUC=0.9919 indicates near-perfect rank-ordering of P-waves vs noise.
- RATIO=6.0 achieves TPR=100% (all 439 P-waves detected) with only 1% FPR (≈2–3 false alarms per 250 noise segments).
- Combining with grid-search MIN_TRIG=3 yields detection delay of only 11.6 samples (0.23 s) after P-onset — faster than MIN_TRIG=10 (15.9 smp) while maintaining the same TPR/FPR.
- RATIO=5.0 previously deployed gives 3% FPR — upgrading to RATIO=6.0 halves false alarm rate at no TPR cost on this dataset.

---

## Comparison: All Dataset Versions

| | v1 (77P+38N) | v2 (200P+100N) | v3 (439P+250N) |
|---|---|---|---|
| AUC | 0.9737 | 0.9689 | **0.9919** |
| TPR @ RATIO=5.0 | 100% | 94% | **100%** |
| FPR @ RATIO=5.0 | 3% (1/38) | 1% (1/100) | **3% (7/250)** |
| Best F1 | 0.994 | 0.972 | **0.995** |
| Best RATIO | 5.0 | 4.0 | **6.0** |
| Avg delay (best) | 11.1 smp | 9.6 smp | **11.6 smp** |

The v3 improvement (AUC 0.9689→0.9919) reflects the larger, more representative dataset covering the full Mw range including Tier-1 and Tier-2 alert bins, giving a more statistically robust FPR estimate (250 vs 100 noise samples).

---

## Output Files

- `roc_data.csv` — all 86 operating points: `ratio, tpr, fpr, precision, f1, tp, fp, avg_delay_samples`

---

## Limitations

- Dataset: 439 P-wave + 250 noise from STEAD (North American broadband seismometers, not MEMS). Only 39 Mw 6.5+ events available in STEAD (target was 100).
- Detection delay (11.6 samples = 0.23 s) + MIN_TRIG latency (60 ms) → total alert latency ≈ 0.29 s after P-arrival.
- Mw 3–4.5 events (sub-threshold bin) are detected but should NOT trigger alerts — this is validated separately via 2-tier alert logic.

---

## References

- Fawcett, T. (2006). An introduction to ROC analysis. *Pattern Recognition Letters*, 27(8), 861–874.
- [[Grid Search Optimization]]
- [[STA/LTA Recursive Algorithm]]
