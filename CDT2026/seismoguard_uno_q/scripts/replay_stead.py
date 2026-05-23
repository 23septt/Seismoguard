"""
replay_stead.py — replay a STEAD waveform CSV through the detector pipeline
or stream it to the live MCU over serial to exercise the full alert chain
without a real shake.

Usage:
    # Replay through Python detector only (no hardware)
    python3 scripts/replay_stead.py --csv pwave.csv --sim

    # Replay to live MCU (overrides IMU readings — needs sketch mod or
    # the sketch's self-test mode for now)
    python3 scripts/replay_stead.py --csv pwave.csv --port /dev/ttyACM0

CSV format (per the polyglot SampleRecord schema):
    one line per sample, "ax,ay,az" in m/s² (or single "az" column).
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "linux"))

from detector import DT, Detector, WINDOW_SAMPLES


def load_csv(path: Path) -> list[tuple[float, float, float]]:
    rows = []
    with path.open(encoding="utf-8") as f:
        reader = csv.reader(f)
        for raw in reader:
            row = [c.strip() for c in raw if c.strip() and not c.strip().startswith("#")]
            if not row:
                continue
            try:
                if len(row) == 1:
                    rows.append((0.0, 0.0, float(row[0])))
                elif len(row) >= 3:
                    rows.append((float(row[0]), float(row[1]), float(row[2])))
            except ValueError:
                continue
    return rows


def simulate(rows: list[tuple[float, float, float]]) -> int:
    det = Detector()
    det.on_trigger()                       # open window immediately for replay
    decisions = []
    for i, (ax, ay, az) in enumerate(rows):
        d = det.on_sample(ax, ay, az)
        if d is not None:
            decisions.append((i, d))
            print(f"[sim] sample {i}: decision = {d}")
    if not decisions:
        print("[sim] no decision fired — pipeline absorbed signal as silent reset")
    return 0 if decisions else 1


def stream_to_mcu(rows: list[tuple[float, float, float]], port: str, baud: int) -> int:
    try:
        import serial
    except ImportError:
        print("pyserial missing — pip install pyserial", file=sys.stderr)
        return 2
    ser = serial.Serial(port, baud, timeout=0.5)
    time.sleep(2)
    ser.reset_input_buffer()
    print(f"[stream] sending {len(rows)} samples @ 100 Hz to {port}")
    print("[stream] NOTE: this requires a sketch with a streaming-injection cmd")
    print("[stream] current sketch only supports T (single-impulse self-test).")
    print("[stream] sending one T per second for the first 10 seconds as a smoke test.")
    for _ in range(10):
        ser.write(b"T\n")
        time.sleep(1)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True, help="STEAD CSV file path")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--sim", action="store_true", help="run through Python detector only")
    g.add_argument("--port", help="stream to MCU on this serial port")
    ap.add_argument("--baud", type=int, default=115200)
    args = ap.parse_args()

    rows = load_csv(Path(args.csv))
    if not rows:
        print(f"empty or unparseable CSV: {args.csv}", file=sys.stderr)
        return 2
    print(f"loaded {len(rows)} samples ({len(rows) * DT:.2f} s @ 100 Hz)")

    if args.sim:
        return simulate(rows)
    return stream_to_mcu(rows, args.port, args.baud)


if __name__ == "__main__":
    sys.exit(main())
