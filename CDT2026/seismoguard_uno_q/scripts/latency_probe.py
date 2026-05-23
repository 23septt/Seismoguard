"""
latency_probe.py — measure end-to-end EEW alert latency.

Connects to MCU, triggers self-test (T command), records timestamps for:
  T0: command sent (Linux clock)
  T1: MCU receives + injects synthetic impulse
  T2: MCU emits E,trigger
  T3: Linux orchestrator receives trigger
  T4: Linux fires alert (T1 or T2)
  T5: MCU receives + acknowledges alert command

Reports each delta + total wall-clock latency.

Run:
    python3 scripts/latency_probe.py --port /dev/ttyACM0 --runs 5
"""
from __future__ import annotations

import argparse
import statistics
import sys
import time

try:
    import serial
except ImportError:
    print("pyserial missing — pip install pyserial", file=sys.stderr)
    sys.exit(2)


def now_ms() -> int:
    return int(time.monotonic() * 1000)


def run_one(ser: serial.Serial) -> dict | None:
    """Return timing dict or None on protocol error."""
    t0 = now_ms()
    ser.write(b"T\n")

    stages: dict[str, int] = {"T0_cmd_sent": t0}
    deadline = time.monotonic() + 8.0
    saw_trigger = False
    saw_decision = False
    while time.monotonic() < deadline:
        raw = ser.readline()
        if not raw:
            continue
        line = raw.decode("ascii", errors="ignore").strip()
        if not line:
            continue
        ts = now_ms()
        if line.startswith("E,ack,selftest"):
            stages["T1_mcu_ack_selftest"] = ts
        elif line.startswith("D,selftest_end"):
            stages["T1b_mcu_inject_end"] = ts
        elif line.startswith("E,trigger"):
            stages["T2_mcu_emit_trigger"] = ts
            saw_trigger = True
        elif line.startswith("D,trigger,"):
            stages["T2b_mcu_d_trigger"] = ts
        elif line.startswith("D,cmd_t"):
            stages["T5_mcu_ack_alert"] = ts
            saw_decision = True
            break
    if not saw_trigger:
        return None

    out = {k: v - t0 for k, v in stages.items()}
    out["total_round_trip"] = stages.get("T5_mcu_ack_alert", now_ms()) - t0
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", required=True)
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--runs", type=int, default=5)
    ap.add_argument("--wait", type=float, default=8.0,
                    help="seconds between runs (let cooldown elapse)")
    args = ap.parse_args()

    ser = serial.Serial(args.port, args.baud, timeout=0.3)
    time.sleep(2)
    ser.reset_input_buffer()

    runs = []
    for i in range(args.runs):
        print(f"[run {i+1}/{args.runs}] firing self-test...")
        r = run_one(ser)
        if r is None:
            print("  ABORT: no trigger received")
        else:
            for k, v in r.items():
                print(f"  {k:30s} = {v:6d} ms")
            runs.append(r)
        time.sleep(args.wait)

    if not runs:
        print("no successful runs")
        return 1

    print("\n=== aggregate over", len(runs), "runs ===")
    keys = sorted({k for r in runs for k in r})
    for k in keys:
        vals = [r[k] for r in runs if k in r]
        if not vals:
            continue
        print(f"  {k:30s} median={statistics.median(vals):6.1f} ms  "
              f"mean={statistics.mean(vals):6.1f}  "
              f"min={min(vals)}  max={max(vals)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
