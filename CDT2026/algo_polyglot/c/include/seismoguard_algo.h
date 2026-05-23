/*
 * seismoguard_algo.h — SeismoGuard EEW algorithm, C99 port.
 * See ../spec/SAMPLE_RECORD.md for the canonical schema + constants.
 */
#ifndef SEISMOGUARD_ALGO_H
#define SEISMOGUARD_ALGO_H

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

/* ── Canonical constants ─────────────────────────────────────────────── */
#define SG_SAMPLE_RATE_HZ   100
#define SG_DT               (1.0 / (double)SG_SAMPLE_RATE_HZ)
#define SG_ALPHA_STA        0.02
#define SG_ALPHA_LTA        0.000333
#define SG_ALPHA_DC         0.001
#define SG_RATIO_TRIGGER    6.0
#define SG_RATIO_DETRIGGER  1.5
#define SG_MIN_TRIG_COUNT   3
#define SG_SPIKE_LIMIT      50.0
#define SG_LTA_FLOOR        1e-9
#define SG_MIN_TRIG_CF_ABS  2e-4
#define SG_WINDOW_SAMPLES   300
#define SG_HPF_ALPHA        0.9901
#define SG_MW_PD_A          0.813
#define SG_MW_PD_B          1.512
#define SG_MW_PD_C          5.130
#define SG_MW_R_KM_DEFAULT  10.0
#define SG_ALARM_MAX_MS     15000
#define SG_LOCKOUT_MAX_MS   5000

typedef enum {
    SG_STATE_STANDBY   = 0,
    SG_STATE_DETECTING = 1,
    SG_STATE_ALARMING  = 2,
    SG_STATE_LOCKOUT   = 3
} sg_state_t;

typedef struct {
    uint32_t timestamp_ms;
    double   sta_lta_ratio;
    double   cf_z;
    double   mpd_raw;
    uint16_t sample_count;
} sg_record_t;

typedef struct {
    bool        fire_t1;
    bool        fire_t2;
    bool        valid;          /* false when no decision this sample */
    double      mw_est;
    double      pd_m;
    double      tau_c;
    const char *reason;
} sg_decision_t;

typedef struct {
    double mw_t1;
    double mw_t2;
    double r_km;

    sg_state_t state;
    double sta, lta, lta_quiet;
    double baseline_z;
    bool   baseline_init;
    uint32_t trig_count;
    double peak_ratio;
    uint32_t alarm_start_ms;
    uint32_t lockout_start_ms;

    double hpf_a_in, hpf_a_out;
    double vel;
    double hpf_v_in, hpf_v_out;
    double disp;
    double hpf_d_in, hpf_d_out;

    uint32_t win_n;
    double   pd_max;
    double   tc_num, tc_den;
    bool     window_open;

    uint32_t sample_count;
    uint32_t start_ms;
} sg_algo_t;

void          sg_algo_init     (sg_algo_t *a, double mw_t1, double mw_t2, double r_km);
void          sg_algo_reset    (sg_algo_t *a);
void          sg_algo_seed_lta (sg_algo_t *a, double noise_floor_cf);
sg_decision_t sg_algo_process  (sg_algo_t *a, double ax, double ay, double az,
                                uint32_t t_ms, sg_record_t *out_record);
double        sg_algo_estimate_mw(const sg_algo_t *a, double pd_m);

/* JSON serialize (writes up to buf_len bytes, returns chars written excluding NUL) */
size_t sg_record_to_json(const sg_record_t *rec, char *buf, size_t buf_len);

#endif /* SEISMOGUARD_ALGO_H */
