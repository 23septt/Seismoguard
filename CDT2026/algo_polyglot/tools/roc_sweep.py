"""
roc_sweep.py — sweep RATIO_TRIGGER on the Python reference detector and
emit a ROC table (CSV + optional Mermaid plot).

Generates a synthetic noise+P-wave evaluation set on the fly:
  - N_NOISE noise traces (Gaussian, sigma=NOISE_STD)
  - N_PWAVE damped sinusoid P-wave traces overlaid on the noise floor

For each trigger threshold, counts true positives + false positives over
the set and writes one CSV row per threshold.

Usage:
    python3 tools/roc_sweep.py --out roc.csv --thresholds 3,4,5,6,7,8,10,15
"""
from __future__ import annotations

import argparse
import csv
import math
import random
import sys
from pathlib import Path
from typing import Iterable, List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from seismoguard_algo import (DT, MIN_TRIG_CF_ABS, MIN_TRIG_COUNT,
                              RATIO_DETRIGGER, SeismoGuardAlgo, State)

NOISE_STD = 0.05               # m/s² Gaussian, ~5 mg RMS — realistic MEMS floor
NOISE_LEN = 500                # 5 s
PWAVE_LEN = 500
N_NOISE   = 50
N_PWAVE   = 50
G         = 9.80665


def make_noise(rng: random.Random) -> List[Tuple[float, float, float]]:
    return [(0.0, 0.0, G + rng.gauss(0, NOISE_STD)) for _ in range(NOISE_LEN)]


def make_pwave(rng: random.Random, peak_g: float = 0.3) -> List[Tuple[float, float, float]]:
    out = []
    for i in range(PWAVE_LEN):
        t = i * DT
        env = math.exp(-1.5 * max(t, 0.0))
        v = peak_g * math.sin(2 * math.pi * 3.0 * t) * env
        out.append((0.0, 0.0, G + v + rng.gauss(0, NOISE_STD)))
    return out


def run_trace(samples, ratio_trigger: float) -> bool:
    """Returns True iff the detector ever leaves STANDBY with this threshold."""
    algo = SeismoGuardAlgo()
    # Seed LTA from the known noise sigma (not the trace, which may already
    # contain signal energy in the prefix). NOISE_STD m/s² → variance.
    algo.seed_lta(NOISE_STD * NOISE_STD)
    trig = 0
    for ax, ay, az in samples:
        rec, _ = algo.process(ax, ay, az, int(algo.sample_count * 10))
        if rec.sta_lta_ratio >= ratio_trigger and rec.cf_z >= MIN_TRIG_CF_ABS:
            trig += 1
            if trig >= MIN_TRIG_COUNT:
                return True
        elif rec.sta_lta_ratio < RATIO_DETRIGGER:
            trig = 0
    return False


def sweep(thresholds: Iterable[float], seed: int = 0) -> List[dict]:
    rng = random.Random(seed)
    noise_set  = [make_noise(rng)  for _ in range(N_NOISE)]
    pwave_set  = [make_pwave(rng)  for _ in range(N_PWAVE)]
    rows = []
    for r in thresholds:
        fp = sum(1 for s in noise_set if run_trace(s, r))
        tp = sum(1 for s in pwave_set if run_trace(s, r))
        fpr = fp / max(1, N_NOISE)
        tpr = tp / max(1, N_PWAVE)
        f1  = (2 * tpr * (1 - fpr) / (tpr + (1 - fpr))) if (tpr + (1 - fpr)) > 0 else 0
        rows.append({"ratio_trigger": r, "tp": tp, "fp": fp,
                     "tpr": round(tpr, 4), "fpr": round(fpr, 4),
                     "f1": round(f1, 4)})
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="roc.csv")
    ap.add_argument("--thresholds", default="3,4,5,6,6.5,7,8,10,15",
                    help="comma-separated list")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    thresholds = [float(x) for x in args.thresholds.split(",")]
    rows = sweep(thresholds, seed=args.seed)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["ratio_trigger", "tp", "fp",
                                          "tpr", "fpr", "f1"])
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {args.out}")
    print("\nratio  tp  fp   tpr    fpr    f1")
    for r in rows:
        print(f"{r['ratio_trigger']:5}  {r['tp']:2}  {r['fp']:2}   "
              f"{r['tpr']:.3f}  {r['fpr']:.3f}  {r['f1']:.3f}")
    best = max(rows, key=lambda r: r["f1"])
    print(f"\nbest F1 = {best['f1']} at ratio_trigger = {best['ratio_trigger']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
