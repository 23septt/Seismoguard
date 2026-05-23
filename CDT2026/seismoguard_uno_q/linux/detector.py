"""
detector.py — Pd / τc / Mw pipeline + decision gate.

Mirrors the S3 firmware's magnitude-gated alert (Wu & Kanamori 2005 BSSA
Taiwan coefficients, PRELIMINARY for Thailand) but runs on Linux side so we
can use float64 + numpy and iterate without reflashing.

Pipeline per sample (100 Hz, dt=0.01 s):
    dz_g  → (×9.80665) → m/s²
    HPF 1 Hz on accel
    integrate → velocity
    HPF 1 Hz on velocity
    integrate → displacement
    HPF 1 Hz on displacement

Trigger window (3 s = 300 samples) accumulates:
    Pd  = max(|disp|)
    τc  = 2π · sqrt(Σ disp² / Σ vel²)
    Mw  = MW_PD_A · log10(Pd) + MW_PD_B · log10(R_km) + MW_PD_C

Decision:
    Mw >= MW_T2 → fire T2 alert (siren + ntfy + TTS)
    Mw >= MW_T1 → fire T1 heads-up (short tone, no ntfy)
    else        → silent reset
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

G = 9.80665

# Wu & Kanamori (2005) Taiwan coefficients — recalibrate for Thailand
MW_PD_A = 0.813
MW_PD_B = 1.512
MW_PD_C = 5.130
MW_R_KM_DEFAULT = 10.0

SAMPLE_RATE_HZ = 100
DT = 1.0 / SAMPLE_RATE_HZ
WINDOW_SAMPLES = 300                  # 3 s
HPF_TAU = 1.0 / (2.0 * math.pi * 1.0) # 1 Hz corner
HPF_ALPHA = HPF_TAU / (HPF_TAU + DT)


@dataclass
class IntegState:
    hpf_a_in: float = 0.0
    hpf_a_out: float = 0.0
    vel: float = 0.0
    hpf_v_in: float = 0.0
    hpf_v_out: float = 0.0
    disp: float = 0.0
    hpf_d_in: float = 0.0
    hpf_d_out: float = 0.0

    def step(self, dz_mss: float) -> float:
        a_hpf = HPF_ALPHA * (self.hpf_a_out + dz_mss - self.hpf_a_in)
        self.hpf_a_in, self.hpf_a_out = dz_mss, a_hpf
        self.vel += a_hpf * DT
        v_hpf = HPF_ALPHA * (self.hpf_v_out + self.vel - self.hpf_v_in)
        self.hpf_v_in, self.hpf_v_out = self.vel, v_hpf
        self.disp += v_hpf * DT
        d_hpf = HPF_ALPHA * (self.hpf_d_out + self.disp - self.hpf_d_in)
        self.hpf_d_in, self.hpf_d_out = self.disp, d_hpf
        return d_hpf


@dataclass
class PdWindow:
    n: int = 0
    pd_max: float = 0.0
    tc_num: float = 0.0
    tc_den: float = 0.0
    vel_at_step: float = 0.0
    disp_at_step: float = 0.0

    def reset(self) -> None:
        self.n = 0
        self.pd_max = 0.0
        self.tc_num = 0.0
        self.tc_den = 0.0

    def push(self, vel: float, disp_hpf: float) -> None:
        self.n += 1
        ad = abs(disp_hpf)
        if ad > self.pd_max:
            self.pd_max = ad
        self.tc_num += disp_hpf * disp_hpf
        self.tc_den += vel * vel

    def tau_c(self) -> float:
        if self.tc_den <= 0:
            return 0.0
        return 2.0 * math.pi * math.sqrt(self.tc_num / self.tc_den)


def estimate_mw(pd_m: float, r_km: float = MW_R_KM_DEFAULT) -> float:
    if pd_m <= 0:
        return -99.0
    return MW_PD_A * math.log10(pd_m) + MW_PD_B * math.log10(r_km) + MW_PD_C


@dataclass
class Decision:
    fire_t1: bool = False
    fire_t2: bool = False
    mw_est: float = -99.0
    pd_m: float = 0.0
    tau_c: float = 0.0
    reason: str = ""


@dataclass
class Detector:
    mw_t1: float = 3.5
    mw_t2: float = 4.5
    r_km: float = MW_R_KM_DEFAULT
    integ: IntegState = field(default_factory=IntegState)
    window: Optional[PdWindow] = None

    def on_trigger(self) -> None:
        """Called by serial_bridge when MCU emits 'E,trigger,...'."""
        self.window = PdWindow()
        self.integ = IntegState()             # fresh integrators per event

    def on_sample(self, ax_mss: float, ay_mss: float, az_mss: float,
                  baseline_z_mss: float = 0.0) -> Optional[Decision]:
        """Feed one accel sample. Returns Decision when window closes."""
        dz = az_mss - baseline_z_mss
        disp_hpf = self.integ.step(dz)
        if self.window is None:
            return None
        self.window.push(self.integ.vel, disp_hpf)
        if self.window.n < WINDOW_SAMPLES:
            return None
        # window closed — decide
        pd = self.window.pd_max
        tc = self.window.tau_c()
        mw = estimate_mw(pd, self.r_km)
        self.window = None
        if mw >= self.mw_t2:
            return Decision(True, True, mw, pd, tc, "Mw_ge_T2")
        if mw >= self.mw_t1:
            return Decision(True, False, mw, pd, tc, "Mw_ge_T1")
        return Decision(False, False, mw, pd, tc, "below_threshold")


if __name__ == "__main__":
    # smoke test: feed synthetic P-wave-like impulse
    det = Detector()
    det.on_trigger()
    decision = None
    for i in range(WINDOW_SAMPLES + 10):
        t = i * DT
        # 2 Hz damped sinusoid impulse, peak ~0.5 m/s²
        a = 0.5 * math.sin(2 * math.pi * 2 * t) * math.exp(-t * 0.8) if t < 1.5 else 0.0
        d = det.on_sample(0.0, 0.0, a)
        if d:
            decision = d
            break
    print(f"smoke test: {decision}")
