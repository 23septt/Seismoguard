/* seismoguard_algo.c — implementation matching Python reference. */
#include "seismoguard_algo.h"
#include <math.h>
#include <stdio.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static void open_window(sg_algo_t *a) {
    a->win_n = 0; a->pd_max = 0.0; a->tc_num = 0.0; a->tc_den = 0.0;
    a->window_open = true;
    a->hpf_a_in = a->hpf_a_out = 0.0;
    a->vel = 0.0;
    a->hpf_v_in = a->hpf_v_out = 0.0;
    a->disp = 0.0;
    a->hpf_d_in = a->hpf_d_out = 0.0;
}

double sg_algo_estimate_mw(const sg_algo_t *a, double pd_m) {
    if (pd_m <= 0.0) return -99.0;
    return SG_MW_PD_A * log10(pd_m) + SG_MW_PD_B * log10(a->r_km) + SG_MW_PD_C;
}

static sg_decision_t close_window(sg_algo_t *a) {
    sg_decision_t d = {0};
    d.valid = true;
    d.pd_m  = a->pd_max;
    d.tau_c = (a->tc_den > 0.0)
            ? 2.0 * M_PI * sqrt(a->tc_num / a->tc_den)
            : 0.0;
    d.mw_est = sg_algo_estimate_mw(a, d.pd_m);
    a->window_open = false;
    if (d.mw_est >= a->mw_t2) {
        d.fire_t1 = true; d.fire_t2 = true; d.reason = "Mw_ge_T2";
    } else if (d.mw_est >= a->mw_t1) {
        d.fire_t1 = true; d.fire_t2 = false; d.reason = "Mw_ge_T1";
    } else {
        d.fire_t1 = false; d.fire_t2 = false; d.reason = "below_threshold";
    }
    return d;
}

static void step_state(sg_algo_t *a, double ratio, double cf_raw, uint32_t t_ms) {
    switch (a->state) {
    case SG_STATE_STANDBY:
        if (ratio >= SG_RATIO_TRIGGER && cf_raw >= SG_MIN_TRIG_CF_ABS) {
            a->trig_count++;
            if (a->trig_count >= SG_MIN_TRIG_COUNT) {
                a->state = SG_STATE_DETECTING;
                a->peak_ratio = ratio;
                open_window(a);
            }
        } else {
            a->trig_count = 0;
        }
        break;
    case SG_STATE_DETECTING:
        if (ratio > a->peak_ratio) a->peak_ratio = ratio;
        if (ratio < SG_RATIO_DETRIGGER) {
            a->state = SG_STATE_STANDBY;
            a->trig_count = 0;
            a->peak_ratio = 0.0;
        }
        break;
    case SG_STATE_ALARMING:
        if ((t_ms - a->alarm_start_ms) > SG_ALARM_MAX_MS) {
            a->state = SG_STATE_LOCKOUT;
            a->lockout_start_ms = t_ms;
        }
        break;
    case SG_STATE_LOCKOUT:
        if ((t_ms - a->lockout_start_ms) > SG_LOCKOUT_MAX_MS) {
            a->state = SG_STATE_STANDBY;
            a->lta = a->lta_quiet;
            a->sta = a->lta_quiet;
        }
        break;
    }
}

void sg_algo_init(sg_algo_t *a, double mw_t1, double mw_t2, double r_km) {
    a->mw_t1 = mw_t1; a->mw_t2 = mw_t2; a->r_km = r_km;
    sg_algo_reset(a);
}

void sg_algo_reset(sg_algo_t *a) {
    a->state = SG_STATE_STANDBY;
    a->sta = SG_LTA_FLOOR; a->lta = SG_LTA_FLOOR; a->lta_quiet = SG_LTA_FLOOR;
    a->baseline_z = 0.0; a->baseline_init = false;
    a->trig_count = 0; a->peak_ratio = 0.0;
    a->alarm_start_ms = 0; a->lockout_start_ms = 0;
    a->hpf_a_in = a->hpf_a_out = 0.0;
    a->vel = 0.0;
    a->hpf_v_in = a->hpf_v_out = 0.0;
    a->disp = 0.0;
    a->hpf_d_in = a->hpf_d_out = 0.0;
    a->win_n = 0; a->pd_max = 0.0; a->tc_num = 0.0; a->tc_den = 0.0;
    a->window_open = false;
    a->sample_count = 0; a->start_ms = 0;
}

void sg_algo_seed_lta(sg_algo_t *a, double noise_floor_cf) {
    double v = noise_floor_cf > SG_LTA_FLOOR ? noise_floor_cf : SG_LTA_FLOOR;
    a->sta = v; a->lta = v; a->lta_quiet = v;
}

sg_decision_t sg_algo_process(sg_algo_t *a, double ax, double ay, double az,
                              uint32_t t_ms, sg_record_t *out_record) {
    (void)ax; (void)ay;
    if (a->sample_count == 0) a->start_ms = t_ms;

    /* 1. DC tracker (Z only) */
    if (!a->baseline_init) {
        a->baseline_z = az;
        a->baseline_init = true;
    }
    if (a->state == SG_STATE_STANDBY || a->state == SG_STATE_DETECTING) {
        a->baseline_z = SG_ALPHA_DC * az + (1.0 - SG_ALPHA_DC) * a->baseline_z;
    }
    double dz = az - a->baseline_z;

    /* 2. CF + spike clamp (raw retained for anti-tap) */
    double lta_ref = a->lta > SG_LTA_FLOOR ? a->lta : SG_LTA_FLOOR;
    double cf_raw  = dz * dz;
    double cf      = (cf_raw <= SG_SPIKE_LIMIT * lta_ref) ? cf_raw
                                                          : SG_SPIKE_LIMIT * lta_ref;

    /* 3. STA/LTA */
    a->sta = SG_ALPHA_STA * cf + (1.0 - SG_ALPHA_STA) * a->sta;
    if (a->state == SG_STATE_STANDBY) {
        a->lta = SG_ALPHA_LTA * cf + (1.0 - SG_ALPHA_LTA) * a->lta;
    }
    double ratio = (a->lta > SG_LTA_FLOOR) ? (a->sta / a->lta) : 0.0;

    /* 4. HPF -> int -> HPF -> int -> HPF */
    double a_hpf = SG_HPF_ALPHA * (a->hpf_a_out + dz - a->hpf_a_in);
    a->hpf_a_in = dz; a->hpf_a_out = a_hpf;
    a->vel += a_hpf * SG_DT;
    double v_hpf = SG_HPF_ALPHA * (a->hpf_v_out + a->vel - a->hpf_v_in);
    a->hpf_v_in = a->vel; a->hpf_v_out = v_hpf;
    a->disp += v_hpf * SG_DT;
    double d_hpf = SG_HPF_ALPHA * (a->hpf_d_out + a->disp - a->hpf_d_in);
    a->hpf_d_in = a->disp; a->hpf_d_out = d_hpf;

    /* 5. Pd window */
    sg_decision_t decision = {0};
    if (a->window_open) {
        double ad = fabs(d_hpf);
        if (ad > a->pd_max) a->pd_max = ad;
        a->tc_num += d_hpf * d_hpf;
        a->tc_den += a->vel * a->vel;
        a->win_n++;
        if (a->win_n >= SG_WINDOW_SAMPLES) decision = close_window(a);
    }

    /* 6. State machine */
    step_state(a, ratio, cf_raw, t_ms);

    if (out_record) {
        out_record->timestamp_ms  = (uint32_t)(t_ms - a->start_ms);
        out_record->sta_lta_ratio = ratio;
        out_record->cf_z          = cf;
        out_record->mpd_raw       = a->window_open ? a->pd_max : 0.0;
        out_record->sample_count  = (uint16_t)(a->sample_count & 0xFFFF);
    }
    a->sample_count++;
    return decision;
}

size_t sg_record_to_json(const sg_record_t *r, char *buf, size_t buf_len) {
    /* sta_lta_ratio matches Python's round-to-6 (%.6f); cf_z + mpd_raw keep
     * full double precision (%.17g) so parity_check.py can hit 1e-9 tol. */
    int n = snprintf(buf, buf_len,
        "{\"timestamp_ms\":%u,\"sta_lta_ratio\":%.6f,\"cf_z\":%.17g,"
        "\"mpd_raw\":%.17g,\"sample_count\":%u}",
        (unsigned)r->timestamp_ms,
        r->sta_lta_ratio, r->cf_z, r->mpd_raw,
        (unsigned)r->sample_count);
    return (n > 0) ? (size_t)n : 0;
}
