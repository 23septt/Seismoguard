"""Tests for the Python reference port."""
from __future__ import annotations

import json
import math
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from seismoguard_algo import (DT, WINDOW_SAMPLES, MW_PD_A, MW_PD_B, MW_PD_C,
                              SeismoGuardAlgo, SampleRecord, State)


class AlgoTests(unittest.TestCase):

    def test_json_schema_fields(self):
        algo = SeismoGuardAlgo()
        rec, _ = algo.process(0.0, 0.0, 9.81, 0)
        d = json.loads(rec.to_json())
        self.assertEqual(set(d.keys()),
                         {"timestamp_ms", "sta_lta_ratio", "cf_z",
                          "mpd_raw", "sample_count"})
        self.assertIsInstance(d["timestamp_ms"], int)
        self.assertIsInstance(d["sta_lta_ratio"], (int, float))
        self.assertIsInstance(d["cf_z"], (int, float))
        self.assertIsInstance(d["mpd_raw"], (int, float))
        self.assertIsInstance(d["sample_count"], int)
        self.assertGreaterEqual(d["timestamp_ms"], 0)
        self.assertLessEqual(d["timestamp_ms"], 0xFFFFFFFF)
        self.assertLessEqual(d["sample_count"], 0xFFFF)

    def test_dc_input_no_trigger(self):
        algo = SeismoGuardAlgo()
        decision = None
        for i in range(500):
            _, d = algo.process(0.0, 0.0, 9.81, i * 10)
            if d:
                decision = d
                break
        self.assertIsNone(decision, "constant input should not trigger")
        self.assertEqual(algo.state, State.STANDBY)

    def test_sample_count_wraps(self):
        algo = SeismoGuardAlgo()
        # Push 65540 samples — should wrap past 0xFFFF
        for i in range(65540):
            algo.process(0.0, 0.0, 9.81, i * 10)
        rec, _ = algo.process(0.0, 0.0, 9.81, 65540 * 10)
        self.assertLessEqual(rec.sample_count, 0xFFFF)

    def test_mw_formula(self):
        # Pd = 1 mm, R = 10 km → check against hand calc
        algo = SeismoGuardAlgo()
        mw = MW_PD_A * math.log10(1e-3) + MW_PD_B * math.log10(10.0) + MW_PD_C
        self.assertAlmostEqual(algo._estimate_mw(1e-3), mw, places=6)

    def test_synthetic_pwave_fires_decision(self):
        algo = SeismoGuardAlgo()
        # First push 100 quiet samples so LTA is seeded
        for i in range(100):
            algo.process(0.0, 0.0, 9.81, i * 10)
        # Then push synthetic 3 Hz envelope
        decision = None
        for i in range(WINDOW_SAMPLES + 50):
            t = i * DT
            envelope = math.exp(-1.5 * t) if t > 0 else 1.0
            a = 2.0 * math.sin(2 * math.pi * 3 * t) * envelope
            _, d = algo.process(0.0, 0.0, 9.81 + a, (100 + i) * 10)
            if d:
                decision = d
                break
        self.assertIsNotNone(decision, "synthetic P-wave should produce a decision")


if __name__ == "__main__":
    unittest.main()
