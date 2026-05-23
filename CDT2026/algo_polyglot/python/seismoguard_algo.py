"""
seismoguard_algo.py — reference Python port of the SeismoGuard EEW algorithm.

This is the canonical implementation. Rust/Java/C ports MUST produce
bit-identical (within float-eps) SampleRecord output for the same input.

Run as CLI: pipe `ax,ay,az` triples on stdin, get SampleRecord JSON lines:
    python3 seismoguard_algo.py < accel.csv
"""
from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass, asdict
from enum import IntEnum
from typing import Iterator, Optional, TextIO

# ─── Canonical constants (see spec/SAMPLE_RECORD.md) ─────────────────────
SAMPLE_RATE_HZ   = 100
DT               = 1.0 / SAMPLE_RATE_HZ
ALPHA_STA        = 0.02
ALPHA_LTA        = 0.000333
ALPHA_DC         = 0.001
RATIO_TRIGGER    = 6.0
RATIO_DETRIGGER  = 1.5
MIN_TRIG_COUNT   = 3
SPIKE_LIMIT      = 50.0
LTA_FLOOR        = 1e-9
MIN_TRIG_CF_ABS  = 2e-4
WINDOW_SAMPLES   = 300
HPF_ALPHA        = 0.9901
MW_PD_A          = 0.813
MW_PD_B          = 1.512
MW_PD_C          = 5.130
MW_R_KM_DEFAULT  = 10.0

ALARM_MAX_MS     = 15000
LOCKOUT_MAX_MS   = 5000

G = 9.80665


class State(IntEnum):
    STANDBY   = 0
    DETECTING = 1
    ALARMING  = 2
    LOCKOUT   = 3


@dataclass
class SampleRecord:
    timestamp_ms: int     # uint32
    sta_lta_ratio: float
    cf_z: float
    mpd_raw: float        # running Pd (m)
    sample_count: int     # uint16, wraps

    def to_json(self) -> str:
        return json.dumps({
            "timestamp_ms":   self.timestamp_ms & 0xFFFFFFFF,
            "sta_lta_ratio":  round(self.sta_lta_ratio, 6),
            "cf_z":           self.cf_z,
            "mpd_raw":        self.mpd_raw,
            "sample_count":   self.sample_count & 0xFFFF,
        }, separators=(",", ":"))


@dataclass
class Decision:
    fire_t1: bool
    fire_t2: bool
    mw_est: float
    pd_m: float
    tau_c: float
    reason: str


class SeismoGuardAlgo:
    """Stateful per-sample detector. Feed accel in m/s², get a SampleRecord.

    Decision(fire_t1/fire_t2, Mw, Pd, τc) returned when the 3 s post-trigger
    window closes (or None on every other sample).
    """

    def __init__(self,
                 mw_t1: float = 3.5,
                 mw_t2: float = 4.5,
                 r_km: float  = MW_R_KM_DEFAULT) -> None:
        self.mw_t1 = mw_t1
        self.mw_t2 = mw_t2
        self.r_km  = r_km
        self.reset()

    def reset(self) -> None:
        self.state = State.STANDBY
        # STA/LTA seeded at LTA_FLOOR — caller may overwrite via seed_lta()
        # after collecting a noise sample on the deployment site.
        self.sta   = LTA_FLOOR
        self.lta   = LTA_FLOOR
        self.lta_quiet = LTA_FLOOR
        self.baseline_z = 0.0
        self.baseline_init = False
        self.trig_count   = 0
        self.peak_ratio   = 0.0
        self.alarm_start_ms   = 0
        self.lockout_start_ms = 0

        # HPF→∫→HPF→∫→HPF state
        self.hpf_a_in = self.hpf_a_out = 0.0
        self.vel       = 0.0
        self.hpf_v_in = self.hpf_v_out = 0.0
        self.disp      = 0.0
        self.hpf_d_in = self.hpf_d_out = 0.0

        # Pd window accumulators
        self.win_n    = 0
        self.pd_max   = 0.0
        self.tc_num   = 0.0
        self.tc_den   = 0.0
        self.window_open = False

        self.sample_count = 0
        self.start_ms     = 0

    # ─── Per-sample processing ──────────────────────────────────────────
    def process(self, ax: float, ay: float, az: float,
                t_ms: int) -> tuple[SampleRecord, Optional[Decision]]:
        if self.sample_count == 0:
            self.start_ms = t_ms

        # 1. DC tracker (Z only — matches S3 firmware)
        if not self.baseline_init:
            self.baseline_z = az
            self.baseline_init = True
        if self.state in (State.STANDBY, State.DETECTING):
            self.baseline_z = ALPHA_DC * az + (1.0 - ALPHA_DC) * self.baseline_z
        dz = az - self.baseline_z

        # 2. CF = dz²; spike clamp applied for STA/LTA filter input only.
        # Raw cf retained for the MIN_TRIG_CF_ABS anti-tap gate (deliberate
        # divergence from S3 firmware: in quiet environments the clamp would
        # squash cf below the anti-tap threshold and block all triggers).
        lta_ref = self.lta if self.lta > LTA_FLOOR else LTA_FLOOR
        cf_raw = dz * dz
        cf = cf_raw if cf_raw <= SPIKE_LIMIT * lta_ref else SPIKE_LIMIT * lta_ref

        # 3. STA/LTA recursive
        self.sta = ALPHA_STA * cf + (1.0 - ALPHA_STA) * self.sta
        if self.state == State.STANDBY:
            self.lta = ALPHA_LTA * cf + (1.0 - ALPHA_LTA) * self.lta
        ratio = (self.sta / self.lta) if self.lta > LTA_FLOOR else 0.0

        # 4. HPF→∫→HPF→∫→HPF (runs every sample so filters stay settled)
        a_hpf = HPF_ALPHA * (self.hpf_a_out + dz - self.hpf_a_in)
        self.hpf_a_in, self.hpf_a_out = dz, a_hpf
        self.vel += a_hpf * DT
        v_hpf = HPF_ALPHA * (self.hpf_v_out + self.vel - self.hpf_v_in)
        self.hpf_v_in, self.hpf_v_out = self.vel, v_hpf
        self.disp += v_hpf * DT
        d_hpf = HPF_ALPHA * (self.hpf_d_out + self.disp - self.hpf_d_in)
        self.hpf_d_in, self.hpf_d_out = self.disp, d_hpf

        # 5. Pd window accumulation
        decision: Optional[Decision] = None
        if self.window_open:
            ad = abs(d_hpf)
            if ad > self.pd_max:
                self.pd_max = ad
            self.tc_num += d_hpf * d_hpf
            self.tc_den += self.vel * self.vel
            self.win_n += 1
            if self.win_n >= WINDOW_SAMPLES:
                decision = self._close_window()

        # 6. State machine + window control (uses RAW cf for anti-tap gate)
        self._step_state(ratio, cf_raw, t_ms)

        rec = SampleRecord(
            timestamp_ms = (t_ms - self.start_ms) & 0xFFFFFFFF,
            sta_lta_ratio = ratio,
            cf_z          = cf,
            mpd_raw       = self.pd_max if self.window_open else 0.0,
            sample_count  = self.sample_count & 0xFFFF,
        )
        self.sample_count += 1
        return rec, decision

    # ─── Helpers ─────────────────────────────────────────────────────────
    def _open_window(self) -> None:
        self.win_n  = 0
        self.pd_max = 0.0
        self.tc_num = 0.0
        self.tc_den = 0.0
        self.window_open = True
        # Reset integrators per event (matches S3 firmware behaviour)
        self.hpf_a_in = self.hpf_a_out = 0.0
        self.vel       = 0.0
        self.hpf_v_in = self.hpf_v_out = 0.0
        self.disp      = 0.0
        self.hpf_d_in = self.hpf_d_out = 0.0

    def _close_window(self) -> Decision:
        pd = self.pd_max
        tc = (2.0 * math.pi * math.sqrt(self.tc_num / self.tc_den)
              if self.tc_den > 0 else 0.0)
        mw = self._estimate_mw(pd)
        self.window_open = False
        if mw >= self.mw_t2:
            return Decision(True, True, mw, pd, tc, "Mw_ge_T2")
        if mw >= self.mw_t1:
            return Decision(True, False, mw, pd, tc, "Mw_ge_T1")
        return Decision(False, False, mw, pd, tc, "below_threshold")

    def _estimate_mw(self, pd_m: float) -> float:
        if pd_m <= 0.0:
            return -99.0
        return MW_PD_A * math.log10(pd_m) + MW_PD_B * math.log10(self.r_km) + MW_PD_C

    def _step_state(self, ratio: float, cf_raw: float, t_ms: int) -> None:
        if self.state == State.STANDBY:
            if ratio >= RATIO_TRIGGER and cf_raw >= MIN_TRIG_CF_ABS:
                self.trig_count += 1
                if self.trig_count >= MIN_TRIG_COUNT:
                    self.state = State.DETECTING
                    self.peak_ratio = ratio
                    self._open_window()
            else:
                self.trig_count = 0

        elif self.state == State.DETECTING:
            if ratio > self.peak_ratio:
                self.peak_ratio = ratio
            if ratio < RATIO_DETRIGGER:
                self.state = State.STANDBY
                self.trig_count = 0
                self.peak_ratio = 0.0

        elif self.state == State.ALARMING:
            if t_ms - self.alarm_start_ms > ALARM_MAX_MS:
                self.state = State.LOCKOUT
                self.lockout_start_ms = t_ms

        elif self.state == State.LOCKOUT:
            if t_ms - self.lockout_start_ms > LOCKOUT_MAX_MS:
                self.state = State.STANDBY
                self.lta = self.lta_quiet
                self.sta = self.lta_quiet

    def seed_lta(self, noise_floor_cf: float) -> None:
        """Seed STA/LTA from an externally-measured noise floor (m²/s⁴)."""
        v = max(noise_floor_cf, LTA_FLOOR)
        self.sta = v
        self.lta = v
        self.lta_quiet = v

    # External hooks the orchestrator can call
    def force_alarm(self, t_ms: int) -> None:
        self.state = State.ALARMING
        self.alarm_start_ms = t_ms

    def reset_alarm(self, t_ms: int) -> None:
        self.state = State.STANDBY
        self.trig_count = 0
        self.peak_ratio = 0.0


# ─── CLI entrypoint: stdin CSV → stdout JSONL ────────────────────────────
def run_cli(in_stream: TextIO = sys.stdin, out_stream: TextIO = sys.stdout) -> int:
    algo = SeismoGuardAlgo()
    t = 0
    for raw in in_stream:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(",")
        if len(parts) < 3:
            continue
        try:
            ax = float(parts[0]); ay = float(parts[1]); az = float(parts[2])
        except ValueError:
            continue
        rec, decision = algo.process(ax, ay, az, t)
        out_stream.write(rec.to_json() + "\n")
        if decision is not None:
            out_stream.write(
                json.dumps({"decision": decision.reason,
                            "mw": round(decision.mw_est, 3),
                            "pd_m": decision.pd_m,
                            "tau_c": decision.tau_c}) + "\n")
        t += int(DT * 1000)
    return 0


if __name__ == "__main__":
    sys.exit(run_cli())
