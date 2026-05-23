"""
parity_check.py — numerically-aware diff between polyglot port outputs.

Runs the same input CSV through any pair of ports (Python is the
reference) and compares the SampleRecord JSONL output field-by-field
within a float tolerance. Pass = all fields match within tol.

Usage:
    python3 tools/parity_check.py --reference python --compare c
    python3 tools/parity_check.py --reference python --compare rust --tol 1e-9
    python3 tools/parity_check.py --reference python --compare all
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
EXE = ".exe" if os.name == "nt" else ""
PY  = "python" if (os.name == "nt" and not shutil.which("python3")) else "python3"

# How to invoke each port's CLI (must read CSV from stdin, write JSONL to stdout)
PORTS = {
    "python": [PY, str(ROOT / "python" / "seismoguard_algo.py")],
    "c":      [str(ROOT / "c" / ("seismoguard_algo" + EXE))],
    "rust":   [str(ROOT / "rust" / "target" / "release" / ("seismoguard_algo" + EXE))],
    "java":   ["java", "-cp", str(ROOT / "java"), "SeismoGuardAlgo"],
}


def generate_input(n: int = 500) -> str:
    """Synthetic input: 100 quiet samples + 400 samples of damped 3 Hz P-wave."""
    lines = []
    for i in range(100):
        lines.append("0,0,9.81")
    for i in range(400):
        t = i * 0.01
        env = math.exp(-1.5 * t)
        v = 2.0 * math.sin(2 * math.pi * 3 * t) * env
        lines.append(f"0,0,{9.81 + v}")
    return "\n".join(lines) + "\n"


def run_port(name: str, csv_in: str) -> list[dict] | None:
    cmd = PORTS[name]
    try:
        r = subprocess.run(cmd, input=csv_in, capture_output=True,
                           text=True, timeout=30)
    except FileNotFoundError:
        print(f"[skip] {name}: binary/script not found ({cmd[0]})")
        return None
    except subprocess.TimeoutExpired:
        print(f"[fail] {name}: timed out")
        return None
    if r.returncode != 0:
        print(f"[fail] {name}: exit {r.returncode}\n  stderr: {r.stderr.strip()[:200]}")
        return None
    rows = []
    for line in r.stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            o = json.loads(line)
            # ignore decision lines (no sample_count field)
            if "sample_count" in o:
                rows.append(o)
        except json.JSONDecodeError:
            continue
    return rows


def compare(ref: list[dict], cmp: list[dict], tol: float) -> tuple[int, int]:
    n = min(len(ref), len(cmp))
    diffs = 0
    worst = 0.0                              # absolute worst delta seen, regardless of tol
    shown = 0
    for i in range(n):
        for k in ("timestamp_ms", "sta_lta_ratio", "cf_z", "mpd_raw", "sample_count"):
            rv, cv = ref[i][k], cmp[i][k]
            if isinstance(rv, (int, float)) and isinstance(cv, (int, float)):
                d = abs(float(rv) - float(cv))
                if d > worst:
                    worst = d
                if d > tol:
                    diffs += 1
                    if shown < 5:
                        print(f"  diff @ i={i} field={k}: ref={rv} cmp={cv} (delta={d:g})")
                        shown += 1
            elif rv != cv:
                diffs += 1
    print(f"  worst delta (any field) = {worst:g}, diffs > tol = {diffs} / {n*5}, ref samples = {len(ref)}, cmp samples = {len(cmp)}")
    return diffs, n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", default="python", choices=PORTS.keys())
    ap.add_argument("--compare", default="all",
                    help="port name or 'all'")
    ap.add_argument("--tol", type=float, default=1e-3,
                    help="numeric tolerance per field. Default 1e-3 absorbs "
                         "print-precision drift between ports (C printf vs "
                         "Python round-to-6). Drop to 1e-9 for algo-only check "
                         "if all ports use identical print precision.")
    args = ap.parse_args()

    csv_in = generate_input()
    print(f"[gen] {csv_in.count(chr(10))} input samples")

    ref_rows = run_port(args.reference, csv_in)
    if ref_rows is None:
        print(f"reference {args.reference} failed to run")
        return 2
    print(f"[ref] {args.reference}: {len(ref_rows)} sample records")

    targets: Iterable[str]
    if args.compare == "all":
        targets = [p for p in PORTS if p != args.reference]
    else:
        targets = [args.compare]

    overall_fail = 0
    for t in targets:
        print(f"\n--- compare {t} vs {args.reference} (tol={args.tol:g}) ---")
        cmp_rows = run_port(t, csv_in)
        if cmp_rows is None:
            overall_fail += 1
            continue
        diffs, _ = compare(ref_rows, cmp_rows, args.tol)
        if diffs == 0:
            print(f"[ok] {t}: matches {args.reference} within {args.tol:g}")
        else:
            print(f"[FAIL] {t}: {diffs} fields exceed tolerance")
            overall_fail += 1

    return 0 if overall_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
