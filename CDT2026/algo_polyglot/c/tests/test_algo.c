/* test_algo.c — minimal in-process assertions. Exit 0 = pass. */
#include "seismoguard_algo.h"
#include <assert.h>
#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static int fails = 0;
static void check(const char *name, bool ok) {
    printf("%s %s\n", ok ? "[ok]  " : "[FAIL]", name);
    if (!ok) fails++;
}

static bool test_dc_no_trigger(void) {
    sg_algo_t a; sg_algo_init(&a, 3.5, 4.5, SG_MW_R_KM_DEFAULT);
    for (int i = 0; i < 500; i++) {
        sg_record_t r;
        sg_decision_t d = sg_algo_process(&a, 0, 0, 9.81, (uint32_t)i * 10, &r);
        if (d.valid) return false;
    }
    return a.state == SG_STATE_STANDBY;
}

static bool test_mw_formula(void) {
    sg_algo_t a; sg_algo_init(&a, 3.5, 4.5, SG_MW_R_KM_DEFAULT);
    double mw = SG_MW_PD_A * log10(1e-3) + SG_MW_PD_B * log10(10.0) + SG_MW_PD_C;
    return fabs(sg_algo_estimate_mw(&a, 1e-3) - mw) < 1e-9;
}

static bool test_json_schema(void) {
    sg_algo_t a; sg_algo_init(&a, 3.5, 4.5, SG_MW_R_KM_DEFAULT);
    sg_record_t r;
    sg_algo_process(&a, 0, 0, 9.81, 0, &r);
    char buf[256];
    sg_record_to_json(&r, buf, sizeof(buf));
    return strstr(buf, "timestamp_ms")
        && strstr(buf, "sta_lta_ratio")
        && strstr(buf, "cf_z")
        && strstr(buf, "mpd_raw")
        && strstr(buf, "sample_count");
}

static bool test_sample_wrap(void) {
    sg_algo_t a; sg_algo_init(&a, 3.5, 4.5, SG_MW_R_KM_DEFAULT);
    sg_record_t r;
    for (uint32_t i = 0; i < 65540; i++) sg_algo_process(&a, 0, 0, 9.81, i * 10, &r);
    sg_algo_process(&a, 0, 0, 9.81, 65540 * 10, &r);
    return r.sample_count == 4;
}

static bool test_synthetic_fires(void) {
    sg_algo_t a; sg_algo_init(&a, 3.5, 4.5, SG_MW_R_KM_DEFAULT);
    sg_record_t r;
    for (int i = 0; i < 100; i++) sg_algo_process(&a, 0, 0, 9.81, (uint32_t)i * 10, &r);
    for (int i = 0; i < SG_WINDOW_SAMPLES + 100; i++) {
        double t = i * SG_DT;
        double env = exp(-1.5 * t);
        double v = 2.0 * sin(2 * M_PI * 3 * t) * env;
        sg_decision_t d = sg_algo_process(&a, 0, 0, 9.81 + v,
                                          (uint32_t)(100 + i) * 10, &r);
        if (d.valid) return true;
    }
    return false;
}

int main(void) {
    check("dc_no_trigger",   test_dc_no_trigger());
    check("mw_formula",      test_mw_formula());
    check("json_schema",     test_json_schema());
    check("sample_wrap",     test_sample_wrap());
    check("synthetic_fires", test_synthetic_fires());
    printf(fails == 0 ? "ALL TESTS OK\n" : "%d FAILURE(S)\n", fails);
    return fails == 0 ? 0 : 1;
}
