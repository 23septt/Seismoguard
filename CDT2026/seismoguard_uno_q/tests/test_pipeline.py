"""
test_pipeline.py — offline sanity checks for the detector pipeline.

Run:
    cd CDT2026/seismoguard_uno_q
    PYTHONPATH=linux python3 -m unittest tests.test_pipeline -v

Coverage:
  - HPF→∫→HPF→∫→HPF chain stable on DC input (drift bounded)
  - Tap-like impulse → low Pd → silent reset
  - Synthetic 4 Hz P-wave-like envelope → window closes with Pd > 0
  - Mw formula matches Wu & Kanamori (2005) hand calculation
"""
from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "linux"))

from detector import (DT, MW_PD_A, MW_PD_B, MW_PD_C, WINDOW_SAMPLES,
                      Detector, estimate_mw)


def synth_pwave(n: int, peak_mss: float = 1.0, f_hz: float = 4.0,
                decay: float = 1.2):
    for i in range(n):
        t = i * DT
        yield peak_mss * math.sin(2 * math.pi * f_hz * t) * math.exp(-decay * t)


class PipelineTests(unittest.TestCase):

    def test_dc_drift_bounded(self):
        det = Detector()
        det.on_trigger()
        last_disp = 0.0
        for _ in range(WINDOW_SAMPLES):
            d = det.on_sample(0.0, 0.0, 0.0)
            if d is None:
                last_disp = det.integ.hpf_d_out
        self.assertLess(abs(last_disp), 1e-3,
                        f"HPF chain drifted on DC: {last_disp}")

    def test_tap_low_pd(self):
        # Tiny 1-sample spike (0.3 m/s² ≈ a gentle bench tap on padded sensor).
        # Should produce Pd low enough that Mw is below T1.
        det = Detector()
        det.on_trigger()
        det.on_sample(0.0, 0.0, 0.3)
        for _ in range(WINDOW_SAMPLES - 1):
            d = det.on_sample(0.0, 0.0, 0.0)
            if d:
                self.assertLess(d.mw_est, 3.5,
                                f"tap should not fire T1: Mw={d.mw_est:.2f}, Pd={d.pd_m*1000:.2f}mm")
                return
        self.fail("window did not close")

    def test_synthetic_pwave_window_closes(self):
        det = Detector()
        det.on_trigger()
        decision = None
        for a in synth_pwave(WINDOW_SAMPLES, peak_mss=2.0, f_hz=3.0):
            decision = det.on_sample(0.0, 0.0, a)
            if decision:
                break
        self.assertIsNotNone(decision, "window must close")
        self.assertGreater(decision.pd_m, 0.0)
        self.assertGreater(decision.tau_c, 0.0)

    def test_mw_formula_matches_hand_calc(self):
        # Pd = 1 mm = 1e-3 m, R = 10 km → expected Mw via published coeffs
        pd = 1e-3
        r = 10.0
        expected = MW_PD_A * math.log10(pd) + MW_PD_B * math.log10(r) + MW_PD_C
        self.assertAlmostEqual(estimate_mw(pd, r), expected, places=6)

    def test_mw_invalid_pd_returns_sentinel(self):
        self.assertEqual(estimate_mw(0.0, 10.0), -99.0)
        self.assertEqual(estimate_mw(-1.0, 10.0), -99.0)


if __name__ == "__main__":
    unittest.main()
