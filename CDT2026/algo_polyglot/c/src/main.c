/* main.c — CLI: stdin CSV "ax,ay,az" -> stdout JSONL SampleRecord. */
#include "seismoguard_algo.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    sg_algo_t algo;
    sg_algo_init(&algo, 3.5, 4.5, SG_MW_R_KM_DEFAULT);

    char line[256];
    char jbuf[256];
    uint32_t t = 0;
    while (fgets(line, sizeof(line), stdin)) {
        if (line[0] == '#' || line[0] == '\n' || line[0] == '\0') continue;
        double ax = 0, ay = 0, az = 0;
        if (sscanf(line, "%lf,%lf,%lf", &ax, &ay, &az) != 3) continue;
        sg_record_t rec;
        sg_decision_t d = sg_algo_process(&algo, ax, ay, az, t, &rec);
        sg_record_to_json(&rec, jbuf, sizeof(jbuf));
        puts(jbuf);
        if (d.valid) {
            printf("{\"decision\":\"%s\",\"mw\":%.3f,\"pd_m\":%g,\"tau_c\":%g}\n",
                   d.reason, d.mw_est, d.pd_m, d.tau_c);
        }
        t += (uint32_t)(SG_DT * 1000);
    }
    return 0;
}
