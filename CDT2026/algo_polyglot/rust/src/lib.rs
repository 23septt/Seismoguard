//! SeismoGuard EEW algorithm — Rust port.
//!
//! Matches the Python reference in `../../python/seismoguard_algo.py` to the
//! last decimal place (float64 throughout). The JSON SampleRecord schema is
//! pinned in `../../spec/SAMPLE_RECORD.md`.

#![forbid(unsafe_code)]

use std::fmt::Write as _;

// ── Canonical constants (see spec/SAMPLE_RECORD.md) ─────────────────────
pub const SAMPLE_RATE_HZ:   u32 = 100;
pub const DT:               f64 = 1.0 / SAMPLE_RATE_HZ as f64;
pub const ALPHA_STA:        f64 = 0.02;
pub const ALPHA_LTA:        f64 = 0.000333;
pub const ALPHA_DC:         f64 = 0.001;
pub const RATIO_TRIGGER:    f64 = 6.0;
pub const RATIO_DETRIGGER:  f64 = 1.5;
pub const MIN_TRIG_COUNT:   u32 = 3;
pub const SPIKE_LIMIT:      f64 = 50.0;
pub const LTA_FLOOR:        f64 = 1e-9;
pub const MIN_TRIG_CF_ABS:  f64 = 2e-4;
pub const WINDOW_SAMPLES:   u32 = 300;
pub const HPF_ALPHA:        f64 = 0.9901;
pub const MW_PD_A:          f64 = 0.813;
pub const MW_PD_B:          f64 = 1.512;
pub const MW_PD_C:          f64 = 5.130;
pub const MW_R_KM_DEFAULT:  f64 = 10.0;
pub const ALARM_MAX_MS:     u32 = 15_000;
pub const LOCKOUT_MAX_MS:   u32 =  5_000;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum State { Standby = 0, Detecting = 1, Alarming = 2, Lockout = 3 }

#[derive(Copy, Clone, Debug)]
pub struct SampleRecord {
    pub timestamp_ms:  u32,
    pub sta_lta_ratio: f64,
    pub cf_z:          f64,
    pub mpd_raw:       f64,
    pub sample_count:  u16,
}

impl SampleRecord {
    /// Emit a single-line JSON matching `spec/SAMPLE_RECORD.md`.
    /// Precision pinned to match Python/C: sta_lta_ratio at 6 decimals,
    /// cf_z + mpd_raw at full f64 precision (~17 significant digits).
    pub fn to_json(&self) -> String {
        let mut s = String::with_capacity(160);
        let _ = write!(
            s,
            "{{\"timestamp_ms\":{},\"sta_lta_ratio\":{:.6},\"cf_z\":{},\"mpd_raw\":{},\"sample_count\":{}}}",
            self.timestamp_ms,
            self.sta_lta_ratio,
            f64_full(self.cf_z),
            f64_full(self.mpd_raw),
            self.sample_count
        );
        s
    }
}

/// Render an f64 with enough precision to round-trip exactly (17 sig digits).
fn f64_full(x: f64) -> String {
    if x == 0.0 { return "0.0".to_string(); }
    format!("{:.17e}", x)
}

#[derive(Copy, Clone, Debug)]
pub struct Decision {
    pub fire_t1: bool,
    pub fire_t2: bool,
    pub mw_est:  f64,
    pub pd_m:    f64,
    pub tau_c:   f64,
    pub reason:  &'static str,
}

pub struct SeismoGuardAlgo {
    mw_t1: f64,
    mw_t2: f64,
    r_km:  f64,
    pub state: State,
    sta: f64,
    lta: f64,
    lta_quiet: f64,
    baseline_z: f64,
    baseline_init: bool,
    trig_count: u32,
    peak_ratio: f64,
    alarm_start_ms: u32,
    lockout_start_ms: u32,
    hpf_a_in: f64, hpf_a_out: f64,
    vel: f64,
    hpf_v_in: f64, hpf_v_out: f64,
    disp: f64,
    hpf_d_in: f64, hpf_d_out: f64,
    win_n: u32, pd_max: f64,
    tc_num: f64, tc_den: f64,
    window_open: bool,
    sample_count: u32,
    start_ms: u32,
}

impl Default for SeismoGuardAlgo {
    fn default() -> Self { Self::new(3.5, 4.5, MW_R_KM_DEFAULT) }
}

impl SeismoGuardAlgo {
    pub fn new(mw_t1: f64, mw_t2: f64, r_km: f64) -> Self {
        let mut a = Self {
            mw_t1, mw_t2, r_km,
            state: State::Standby,
            sta: LTA_FLOOR, lta: LTA_FLOOR, lta_quiet: LTA_FLOOR,
            baseline_z: 0.0, baseline_init: false,
            trig_count: 0, peak_ratio: 0.0,
            alarm_start_ms: 0, lockout_start_ms: 0,
            hpf_a_in: 0.0, hpf_a_out: 0.0,
            vel: 0.0,
            hpf_v_in: 0.0, hpf_v_out: 0.0,
            disp: 0.0,
            hpf_d_in: 0.0, hpf_d_out: 0.0,
            win_n: 0, pd_max: 0.0,
            tc_num: 0.0, tc_den: 0.0,
            window_open: false,
            sample_count: 0, start_ms: 0,
        };
        a.reset();
        a
    }

    pub fn reset(&mut self) {
        self.state = State::Standby;
        self.sta = LTA_FLOOR; self.lta = LTA_FLOOR; self.lta_quiet = LTA_FLOOR;
        self.baseline_z = 0.0; self.baseline_init = false;
        self.trig_count = 0; self.peak_ratio = 0.0;
        self.alarm_start_ms = 0; self.lockout_start_ms = 0;
        self.hpf_a_in = 0.0; self.hpf_a_out = 0.0;
        self.vel = 0.0;
        self.hpf_v_in = 0.0; self.hpf_v_out = 0.0;
        self.disp = 0.0;
        self.hpf_d_in = 0.0; self.hpf_d_out = 0.0;
        self.win_n = 0; self.pd_max = 0.0;
        self.tc_num = 0.0; self.tc_den = 0.0;
        self.window_open = false;
        self.sample_count = 0; self.start_ms = 0;
    }

    pub fn seed_lta(&mut self, noise_floor_cf: f64) {
        let v = noise_floor_cf.max(LTA_FLOOR);
        self.sta = v; self.lta = v; self.lta_quiet = v;
    }

    pub fn process(&mut self, _ax: f64, _ay: f64, az: f64, t_ms: u32)
        -> (SampleRecord, Option<Decision>)
    {
        if self.sample_count == 0 { self.start_ms = t_ms; }

        // 1. DC tracker (Z only)
        if !self.baseline_init {
            self.baseline_z = az;
            self.baseline_init = true;
        }
        if matches!(self.state, State::Standby | State::Detecting) {
            self.baseline_z = ALPHA_DC * az + (1.0 - ALPHA_DC) * self.baseline_z;
        }
        let dz = az - self.baseline_z;

        // 2. CF + spike clamp (raw retained for anti-tap gate)
        let lta_ref = if self.lta > LTA_FLOOR { self.lta } else { LTA_FLOOR };
        let cf_raw  = dz * dz;
        let cf      = if cf_raw <= SPIKE_LIMIT * lta_ref { cf_raw }
                      else { SPIKE_LIMIT * lta_ref };

        // 3. STA/LTA recursive
        self.sta = ALPHA_STA * cf + (1.0 - ALPHA_STA) * self.sta;
        if matches!(self.state, State::Standby) {
            self.lta = ALPHA_LTA * cf + (1.0 - ALPHA_LTA) * self.lta;
        }
        let ratio = if self.lta > LTA_FLOOR { self.sta / self.lta } else { 0.0 };

        // 4. HPF→∫→HPF→∫→HPF
        let a_hpf = HPF_ALPHA * (self.hpf_a_out + dz - self.hpf_a_in);
        self.hpf_a_in = dz; self.hpf_a_out = a_hpf;
        self.vel += a_hpf * DT;
        let v_hpf = HPF_ALPHA * (self.hpf_v_out + self.vel - self.hpf_v_in);
        self.hpf_v_in = self.vel; self.hpf_v_out = v_hpf;
        self.disp += v_hpf * DT;
        let d_hpf = HPF_ALPHA * (self.hpf_d_out + self.disp - self.hpf_d_in);
        self.hpf_d_in = self.disp; self.hpf_d_out = d_hpf;

        // 5. Pd window accumulation
        let mut decision: Option<Decision> = None;
        if self.window_open {
            let ad = d_hpf.abs();
            if ad > self.pd_max { self.pd_max = ad; }
            self.tc_num += d_hpf * d_hpf;
            self.tc_den += self.vel * self.vel;
            self.win_n += 1;
            if self.win_n >= WINDOW_SAMPLES { decision = Some(self.close_window()); }
        }

        // 6. State machine
        self.step_state(ratio, cf_raw, t_ms);

        let rec = SampleRecord {
            timestamp_ms:  t_ms.wrapping_sub(self.start_ms),
            sta_lta_ratio: ratio,
            cf_z:          cf,
            mpd_raw:       if self.window_open { self.pd_max } else { 0.0 },
            sample_count:  (self.sample_count & 0xFFFF) as u16,
        };
        self.sample_count = self.sample_count.wrapping_add(1);
        (rec, decision)
    }

    fn open_window(&mut self) {
        self.win_n = 0; self.pd_max = 0.0; self.tc_num = 0.0; self.tc_den = 0.0;
        self.window_open = true;
        self.hpf_a_in = 0.0; self.hpf_a_out = 0.0;
        self.vel = 0.0;
        self.hpf_v_in = 0.0; self.hpf_v_out = 0.0;
        self.disp = 0.0;
        self.hpf_d_in = 0.0; self.hpf_d_out = 0.0;
    }

    fn close_window(&mut self) -> Decision {
        let pd = self.pd_max;
        let tc = if self.tc_den > 0.0 {
            2.0 * std::f64::consts::PI * (self.tc_num / self.tc_den).sqrt()
        } else { 0.0 };
        let mw = self.estimate_mw(pd);
        self.window_open = false;
        if mw >= self.mw_t2 {
            return Decision { fire_t1: true, fire_t2: true, mw_est: mw,
                              pd_m: pd, tau_c: tc, reason: "Mw_ge_T2" };
        }
        if mw >= self.mw_t1 {
            return Decision { fire_t1: true, fire_t2: false, mw_est: mw,
                              pd_m: pd, tau_c: tc, reason: "Mw_ge_T1" };
        }
        Decision { fire_t1: false, fire_t2: false, mw_est: mw,
                   pd_m: pd, tau_c: tc, reason: "below_threshold" }
    }

    fn estimate_mw(&self, pd_m: f64) -> f64 {
        if pd_m <= 0.0 { return -99.0; }
        MW_PD_A * pd_m.log10() + MW_PD_B * self.r_km.log10() + MW_PD_C
    }

    fn step_state(&mut self, ratio: f64, cf_raw: f64, t_ms: u32) {
        match self.state {
            State::Standby => {
                if ratio >= RATIO_TRIGGER && cf_raw >= MIN_TRIG_CF_ABS {
                    self.trig_count += 1;
                    if self.trig_count >= MIN_TRIG_COUNT {
                        self.state = State::Detecting;
                        self.peak_ratio = ratio;
                        self.open_window();
                    }
                } else {
                    self.trig_count = 0;
                }
            }
            State::Detecting => {
                if ratio > self.peak_ratio { self.peak_ratio = ratio; }
                if ratio < RATIO_DETRIGGER {
                    self.state = State::Standby;
                    self.trig_count = 0; self.peak_ratio = 0.0;
                }
            }
            State::Alarming => {
                if t_ms.wrapping_sub(self.alarm_start_ms) > ALARM_MAX_MS {
                    self.state = State::Lockout;
                    self.lockout_start_ms = t_ms;
                }
            }
            State::Lockout => {
                if t_ms.wrapping_sub(self.lockout_start_ms) > LOCKOUT_MAX_MS {
                    self.state = State::Standby;
                    self.lta = self.lta_quiet;
                    self.sta = self.lta_quiet;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dc_input_no_trigger() {
        let mut a = SeismoGuardAlgo::default();
        for i in 0..500 {
            let (_, d) = a.process(0.0, 0.0, 9.81, i * 10);
            assert!(d.is_none());
        }
        assert_eq!(a.state, State::Standby);
    }

    #[test]
    fn sample_count_wraps() {
        let mut a = SeismoGuardAlgo::default();
        for i in 0..65540u32 {
            a.process(0.0, 0.0, 9.81, i * 10);
        }
        let (rec, _) = a.process(0.0, 0.0, 9.81, 65540 * 10);
        // After the 65541st process() call: pre-increment counter is 65540,
        // which wraps to 4 in u16.
        assert_eq!(rec.sample_count, 4);
    }

    #[test]
    fn mw_formula() {
        let a = SeismoGuardAlgo::default();
        let mw = MW_PD_A * (1e-3f64).log10() + MW_PD_B * 10.0f64.log10() + MW_PD_C;
        assert!((a.estimate_mw(1e-3) - mw).abs() < 1e-9);
    }

    #[test]
    fn json_schema() {
        let mut a = SeismoGuardAlgo::default();
        let (rec, _) = a.process(0.0, 0.0, 9.81, 0);
        let s = rec.to_json();
        for f in ["timestamp_ms", "sta_lta_ratio", "cf_z", "mpd_raw", "sample_count"] {
            assert!(s.contains(f), "missing field: {f} in {s}");
        }
    }

    #[test]
    fn synthetic_pwave_fires_decision() {
        let mut a = SeismoGuardAlgo::default();
        for i in 0..100u32 { a.process(0.0, 0.0, 9.81, i * 10); }
        let mut decision = None;
        for i in 0..(WINDOW_SAMPLES + 100) {
            let t = i as f64 * DT;
            let env = (-1.5 * t).exp();
            let v = 2.0 * (2.0 * std::f64::consts::PI * 3.0 * t).sin() * env;
            let (_, d) = a.process(0.0, 0.0, 9.81 + v, (100 + i) * 10);
            if d.is_some() { decision = d; break; }
        }
        assert!(decision.is_some(), "synthetic P-wave should fire decision");
    }
}
