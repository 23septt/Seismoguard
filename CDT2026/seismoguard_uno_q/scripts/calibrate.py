"""
calibrate.py — on-venue noise floor + threshold tune helper.

Connects to MCU over serial, collects 60 s of sample lines while the device
sits still, then prints recommended RATIO_TRIGGER + MIN_TRIG_CF_ABS.

Run:
    python3 scripts/calibrate.py --port /dev/ttyACM0 --secs 60
"""
from __future__ import annotations

import argparse
import statistics
import time

import serial


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", required=True)
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--secs", type=int, default=60)
    args = ap.parse_args()

    ratios = []
    cf_proxy = []                            # use az·9.80665 as rough dz proxy
    print(f"[calib] keep device still for {args.secs}s …")
    ser = serial.Serial(args.port, args.baud, timeout=1)
    time.sleep(2)
    ser.reset_input_buffer()

    t0 = time.time()
    while time.time() - t0 < args.secs:
        raw = ser.readline().decode("ascii", errors="ignore").strip()
        if not raw.startswith("S,"):
            continue
        parts = raw.split(",")
        if len(parts) != 7:
            continue
        try:
            az = float(parts[4])
            ratio = float(parts[5])
        except ValueError:
            continue
        ratios.append(ratio)
        cf_proxy.append(az * az)

    if not ratios:
        print("[calib] no samples received — check serial port / MCU firmware")
        return

    p95 = sorted(ratios)[int(len(ratios) * 0.95)]
    p99 = sorted(ratios)[int(len(ratios) * 0.99)]
    rmax = max(ratios)
    cf_mean = statistics.mean(cf_proxy)

    print(f"[calib] samples={len(ratios)}  ratio: mean={statistics.mean(ratios):.2f}  p95={p95:.2f}  p99={p99:.2f}  max={rmax:.2f}")
    print(f"[calib] cf_proxy mean={cf_mean:.6f}")
    rec_trig = max(6.0, round(rmax * 1.5, 1))
    print()
    print(f"  Recommended RATIO_TRIGGER  = {rec_trig:.1f}  (1.5× observed max @ idle)")
    print(f"  Recommended MIN_TRIG_CF_ABS ≈ {cf_mean*10:.6f}  (10× noise floor)")
    print()
    print("If recommended ratio > 6.0, edit arduino/config.h and re-flash.")


if __name__ == "__main__":
    main()
