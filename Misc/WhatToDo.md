# WhatToDo — SeismoGuard EEW Roadmap to "Perfect"

> Living checklist. Ordered ~by impact ÷ difficulty. Source synthesis: `raw/critique_future_work_2026-04-14.md`, `wiki/future-work-limitations.md`, current firmware (`seismoguard_esp32.ino`, `seismoguard_s3/seismoguard_s3.ino`), repo state.

---

## Tier 0★ — TOP PRIORITY: Magnitude-Gated Alert (3-second decision window) *(added 2026-05-02)*

> **Rule:** any conflict w/ items below → this design wins. Supersedes "alert-on-trigger-touch" model.

### Concept
- STA/LTA trigger → **does NOT alert**. Trigger only opens 3 s magnitude-estimation window.
- During window: compute τ_c (Allen & Kanamori) + P_d (Wu & Kanamori) on band-passed accel (1–10 Hz HPF/LPF, double-integrate w/ HPF after each step).
- At window end: estimate Mw. **Alert iff Mw ≥ threshold** (calibrate, default Mw≥4.5).
- Below threshold → silent reset, no buzzer/ntfy. Eliminates tap/foot-traffic false positives.

### Why
- Current model (Tier1 RATIO≥8 buzzes, Tier2 RATIO≥25 ntfys) fires on *amplitude*, not *seismic energy* → tiny tap @ close range = huge ratio = false alert (see Tier 0 stuck-alert bug).
- 3 s post-P window enough for τ_c + P_d convergence (Allen 2007). Latency budget: T1 ≤ 500 ms (pre-mag heads-up tone OK), T2 ≤ 3200 ms (confirmed alert + Mw).

### Pipeline (MUST DO, in order)
- [ ] **Signal cond:** DC removal → HPF 1 Hz (α≈0.9901 @ 100 Hz) → LPF 10 Hz. Cascaded biquad Butterworth, bilinear @ Fs=100 Hz. Replace existing 0.5 Hz HPF (drift on MEMS).
- [ ] **STA/LTA trigger** (window-opener only): EWMA α_s=1/5, α_l=1/1000. ON ≥3.0, OFF ≤1.5. **Freeze LTA while triggered** (kills stuck-alert hyp B).
- [ ] **Double integration:** a → v (HPF) → d (HPF). Same α as cond stage.
- [ ] **τ_c accumulator** (300 samples = 3 s @ 100 Hz):
  ```
  num += d[n]^2 ; den += v[n]^2
  tau_c = 2π · sqrt(num/den)
  ```
- [ ] **P_d:** `Pd = max(|d[n]|)` over same 300-sample window.
- [ ] **Mw estimate:** `Mw = a·log10(Pd) + b·log10(R) + c` — **calibrate a,b,c on TMD/USGS local catalog. Do NOT hardcode Italian/Cal coeffs.**
- [ ] **R (distance):** P–S time diff if detectable, else assume R=10 km default + flag estimate as "single-station, R-fixed" in alert payload.
- [ ] **Decision gate:**
  ```
  if Mw_est >= MW_ALERT_THRESHOLD: fire T2 (ntfy + buzzer)
  elif Mw_est >= MW_HEADSUP:        fire T1 (buzzer only, short tone)
  else:                              silent reset, log to FFat
  ```
- [ ] **Sample rate 50→100 Hz** (Nyquist for 30–40 Hz P-wave content). DLPF=21 Hz on MPU6050. *Promoted from Tier 2.*
- [ ] **Core pinning (S3):** Core 0 = acquisition + pipeline (ISR @ 100 Hz, prio 24). Core 1 = WiFi/MQTT/ntfy. Result queue Core 0 → Core 1.

### Conflict resolution (these items now superseded by above)
- ❌ **Tier 1 §3 option B (drop Pd)** — INVALID. MUST do option A (fix Pd w/ proper bandpass + double-integration). Pd is now load-bearing.
- ❌ **Tier 0 "Tier1/Tier2 thresholds UNTESTED" (RATIO_TIER1=8.0, RATIO_TIER2=25.0)** — *ratio thresholds no longer drive alerts*. Reframe: STA/LTA ratio only opens 3 s window. Calibrate `MW_ALERT_THRESHOLD` (Mw) + `MW_HEADSUP` instead.
- ❌ **Manuscript Ch 3.2.6 RATIO=6.0, MIN=3** — still valid for *trigger* (window-open), but Ch 4.7/5 must reframe alert criterion as Mw-gated, not ratio-gated. Update narrative when Pd path stabilizes.
- ⚠ **Tier 0 stuck-alert bug** — partly mitigated (no alert on tiny tap → no stuck alarm). Still fix LTA freeze + max-alarm-duration for trigger-state hygiene.

### Validation (before declaring done)
- [ ] Replay ≥50 STEAD events through pipeline → Mw_est vs catalog Mw → RMSE < 0.5.
- [ ] Replay ≥500 MPU6050 noise samples (Tier 1 §2) → 0 alerts above `MW_ALERT_THRESHOLD`.
- [ ] Bench: tap sensor 100× w/ varying force → 0 false alerts (only window opens, then silent reset).
- [ ] T2 wall-clock latency: P-onset → ntfy publish ≤ 3200 ms (logic analyzer + WiFi sniffer).

### Risk / open questions
- Single-station R unknown → Mw error dominated by R guess. Mitigation: fixed R=10 km + label as "preliminary". Multi-station mesh (Tier 1 §4) closes this later.
- 3 s window adds latency vs instant trigger. Acceptable if epicenter > ~25 km away (S-wave arrival > 7 s). Useless for <10 km. Document trade-off.
- Coeffs a,b,c uncalibrated for Thailand → initial deployment uses Wu & Kanamori (2005) Taiwan values + correction factor from first 5 local events.

---

## Manuscript Audit — รูปเล่มโครงงานเสด_new.docx (2026-04-27)

Source-of-truth = Ch 4 + Ch 5 new data (STEAD v3: 439 P-wave + 250 Noise = 689; Grid Search 677,220 sims; RATIO=6.0, MIN=3, F1=0.995, AUC=0.9919, delay 232 ms). Earlier chapters stale → must reconcile.

### Critical (Source-of-Truth conflicts)
- [x] **Ch 1.4 ขอบเขต #3** — fixed → "689 ชุดข้อมูล (P-wave 439 ตัวอย่าง Stratified Mw sub×100,T1×100,T2×200,crit×39 + Noise 250)" ✓ 2026-04-27
- [x] **Ch 3.2.7 step 1** — fixed → 439P (Stratified) + 250N = 689 ✓ 2026-04-27
- [x] **Ch 3.2.6 State Machine step 4** — fixed: `RATIO 5.0→6.0`, `MIN 10→3 (60 ms)` ✓ 2026-04-27

### High (scope/structure)
- [x] **Ch 1.2 วัตถุประสงค์** — added objectives 3–5: Grid Search optim, ROC/AUC evaluation, Pd + 2-tier alert ✓ 2026-04-27
- [x] **Ch 1.3 สมมติฐาน** — added hypothesis 4: Pd Tier-2 accuracy ≥90% ✓ 2026-04-27
- [x] **Ch 3.1.2 อุปกรณ์** — added ESP32 DevKit V1 as item 7 (อุปกรณ์รุ่นขยาย) ✓ 2026-04-27
- [x] **Ch 2.1 (new subsection 2.1.7)** — added Pd method + Wu & Kanamori (2005) lit review (2 body paragraphs) ✓ 2026-04-27
- [x] **Ch 3 (new 3.2.9)** — added "Pd estimation on ESP32" methodology (heading + body + 4 numbered steps) ✓ 2026-04-27
- [x] **Ch 1.1 fact error** — fixed: Mw 7.4→7.7, epicenter "ในจังหวัดกรุงเทพฯ"→"บริเวณเขตสะกาย ประเทศเมียนมา ซึ่งส่งผลกระทบต่อจังหวัดกรุงเทพฯ" ✓ 2026-04-27
- [ ] **TOC + สารบัญตาราง + สารบัญรูป** — outdated. Body has tables 4.1, 4.4–4.7 (no 4.2/4.3); body has figures 3.1–3.3, 4.1–4.3 (no 4.4 despite TOC listing). Regenerate via Word Update Field after fixes.
- [ ] **TOC Ch 4** — only 4 subsections; body has 4.1–4.7. Add 4.4 Grid Search, 4.5 ROC, 4.6 Pd, 4.7 2-tier alert.
- [ ] **TOC Ch 5** — single page entry; add 5.1/5.2/5.3.

### Medium
- [x] **Ch 1.4 freq scope** — added italic limitation note after scope item 2: actual 0.48–3.32 Hz, hardware constraint ✓ 2026-04-28
- [x] **Abstract** — added TPR=100% (439/439), FPR=1% (3/250), AUC=0.9919, delay 232 ms ✓ 2026-04-27
- [x] **Ch 2.2 intro** — "งานวิจัยต่างประเทศ 6 ฉบับ" → "5 ฉบับ" (matches body count #4–8); also updated 2.1 overview "6 หัวข้อ" → "7 หัวข้อ" ✓ 2026-04-27
- [ ] **Ch 2.3** — cites Withers (1998) + Kim (2021) without prior intro in 2.1/2.2. Either intro upstream or remove.
- [ ] **Eq 1–4** — equations rendered with missing operands ("STA = (α) + (1−α)STA" lacks `·CF(n)`). Re-render via Word Equation Editor.
- [x] **Ch 4.6/5.1 Pd formula** — added inline note "(สมมติให้ R คงที่ ไม่มี GPS → Mw เป็นค่าประมาณเบื้องต้น)" in Ch 4.6 body ✓ 2026-04-28
- [x] **Ch 5.2 96%→100% claim** — added caveat paragraph after comparison: Sianturi=real hardware vs SeismoGuard=STEAD sim, not directly comparable, field-test needed ✓ 2026-04-28
- [x] **Ch 5.3 #3** — reframed: "เพิ่มโมดูล ESP32" → "ต่อยอดจากระบบ ESP32 ที่มีอยู่ในอุปกรณ์รุ่นขยาย" ✓ 2026-04-27
- [ ] **Tables 4.4 + 4.5 layout** — exported as one-cell-per-row → unreadable. Rebuild as proper grid w/ header row.

### Low (typo / format)
- [x] **Ch 1.1** — "ฉันพลัน"→"ฉับพลัน" ✓ 2026-04-27
- [x] **Ch 1.5** — "ตัวเเปร"→"ตัวแปร" (4× replaced) ✓ 2026-04-27
- [ ] **Refs** — numbering jumps [1]–[9], [21]–[23]; [10]–[20] missing. Renumber sequentially.
- [ ] **Refs year format** — mixed BE (2567/2562) + CE (2020/2024). Unify (recommend CE in bibliography).
- [ ] **Terminology pass** — replace "รวดเร็ว/แม่นยำ/ต้นทุนต่ำ/เหมาะสม" w/ engineering metrics: "low-latency (≤250 ms post P-onset)", "high specificity (FPR≤1%)", "low-cost (BOM <฿1,000)", "memory-constrained (RAM≤2 KB)".

### Execution order
1. Reconcile Ch 1 + Ch 3 → Ch 4/5 source-of-truth (critical block).
2. Add missing lit review (Pd) + methodology (ESP32, Pd) sections.
3. Fix Ch 1.1 fact + typos.
4. Regenerate TOC/figures/tables index via Word Update Field.
5. Final terminology + ref-format sweep.

---

## Tier 0 — Blockers / Correctness

- [ ] **LINE Notify dead (EOL 2025-03-31).** Legacy `seismoguard_esp32.ino` still posts to `notify-api.line.me` → silent fail. Decide: delete legacy `.ino`, or port it to ntfy.sh / LINE Messaging API / Telegram. S3 build already on ntfy.sh — keep one path.
- [ ] **TLS cert verification disabled** (`client.setInsecure()` in legacy + likely S3). Token interceptable on rogue AP. Pin ISRG Root X1 (Let's Encrypt) via `setCACert()`. Document threat model in README.
- [ ] **Watchdog timer** — firmware can hang on I²C glitch / WiFi stack lockup w/ no recovery. Enable `esp_task_wdt` w/ 5 s timeout, feed in main loop. (S3 already includes header — verify wired.)
- [x] **`config.h` template parity check.** Both legacy + s3 ship matching `.template` (verified 2026-04-27). ✓
- [x] **Secret scan** — git history clean as of 2026-04-27; only template placeholders (`YOUR_WIFI_PASSWORD`, etc.) appear. ✓
- [ ] **Tier1/Tier2 thresholds UNTESTED** (RATIO_TIER1=8.0, RATIO_TIER2=25.0). Calibrate against real event recordings or shake-table — currently arbitrary.

---

## Tier 1 — Highest Impact (per priority ranking)

### 1. Remote alert path *(Easy / Very High)*
- [x] Wi-Fi notification working (ntfy.sh on S3). 
- [ ] Add Telegram Bot fallback (LINE Messaging API requires business acct).
- [ ] Add MQTT publisher → home-assistant integration.
- [ ] LoRa fallback for rural/no-WiFi sites (SX1276 module, ~$5).
- [ ] Cooldown logic review — current 30 s fixed; consider exponential back-off after detrigger.

### 2. MPU6050 noise dataset *(Medium / Very High)*
- [ ] Capture ≥500 categorized real-world MPU6050 noise samples:
  - vehicle pass, jump near sensor, door slam, washing machine, foot traffic, AC compressor, HVAC fan, dropped object.
- [ ] Overlay STEAD P-waves on MPU6050 noise → realistic synthetic test set.
- [ ] Re-run grid search + ROC on hybrid set. Likely degraded TPR/FPR — report honestly.
- [ ] Update `roc_data.csv`, `ch5_new.xml`, poster.

### 3. Pd magnitude — fix or remove *(Medium / High)*
- Current: Pd computed but logged-only ("unreliable on MEMS"). Two paths:
  - [ ] **A. Fix:** apply 0.075–3 Hz bandpass + DC-offset removal before double-integration; re-validate Pd↔Mw on STEAD.
  - [ ] **B. Drop:** remove Pd code, document tier-thresholds-only approach. Cleaner.
- [ ] Either way: stop printing "Estimated Mw" if unreliable — misleading log line.

### 4. Multi-station / mesh confirmation *(Hard / High)*
- [ ] ESP-NOW or MQTT-based "≥2 nodes within 5 s" rule.
- [ ] GPS time sync (NEO-6M, ~$5) → S–P time, rough localization.
- [ ] Define network protocol — heartbeat, alert vote, dedup window.

### 5. Real-quake field test *(Time-bound / High)*
- [ ] Deploy ≥3 nodes in seismically-active area (Chiang Rai? north TH?).
- [ ] Log raw 50 Hz traces continuously to SD card → ground truth set.
- [ ] Cross-reference w/ TMD / USGS feed.

---

## Tier 2 — Algorithm

- [ ] **3-axis CF** — current Z-only misses S/surface waves. Try `ax² + ay² + az²` or PCA-pick highest-energy axis. Re-grid-search.
- [ ] **Adaptive threshold v3** — wiki says PAT v2 = TPR 82%/FPR 0%. Investigate why TPR dropped vs fixed (94%) — tune buffer/PK or ensemble fixed+adaptive.
- [ ] **Rolling-median LTA bootstrap** — current arithmetic mean over 6 s corrupts on impulse during boot. Median + variance-validity check.
- [ ] **Sample rate 50→100 Hz** — Nyquist 25 Hz cuts P-wave 30–40 Hz content. DLPF 21 Hz, recheck STA window timing.
- [ ] **TFLite Micro classifier** — earthquake vs human-activity head. Features: dominant freq, envelope, duration. Run after STA/LTA trigger only (compute budget).
- [ ] **AIC picker comparison** — add as baseline in evaluation, not replacement.

---

## Tier 3 — Hardware

- [ ] **ADXL355 / ADXL345 swap path** — document BOM swap, expected SNR gain (~16×). Pinout adapter.
- [ ] **Battery backup** — Li-ion 18650 + TP4056 + MT3608 boost. ~4 hr autonomy target.
- [ ] **Brown-out / power-loss alert** — push ntfy on undervoltage detect, persist event count to FFat.
- [ ] **Temperature stress test** — MPU6050 zero-g drift vs T. Test 0–50 °C.
- [ ] **Enclosure** — vibration-coupling matters. 3D-print w/ rigid floor mount; document.

---

## Tier 4 — Evaluation & Documentation

- [ ] **End-to-end latency** — logic analyzer on I²C SDA + buzzer pin. Report sample→buzzer ms, not just detection delay.
- [x] **Baseline comparison done** (2026-04-27) — see Tier 5 entry; classic STA/LTA + AIC vs SeismoGuard. ✓
- [x] **PR curve + Mw stratification done** (2026-04-27) — `pr_curve.js`, AP=0.9976; per-Mw bins all 98–100% TPR @ R=6.0. CSVs: `pr_data.csv`, `mw_strat.csv`. ✓
- [x] **Baseline comparison done** (2026-04-27) — `baselines.js`: SeismoGuard F1=0.995 vs classic STA/LTA best-F1=0.962 (R=3.5) vs AIC F1=0.847. CSV: `baselines_data.csv`. ✓
- [ ] **Failure mode analysis** — sensor disconnect, I²C bus stuck, WiFi flapping, OOM.
- [ ] **Cost analysis vs commercial EEW** — ShakeAlert/JMA per-station cost vs SeismoGuard BOM.
- [ ] **Robustness section** in Ch 5 — temp, brownout, EMI.

---

## Tier 5 — Repo Hygiene / DX

- [x] **README.md added** (2026-04-27) — covers quickstart, BOM, algo summary, alert tiers, perf, repo layout, security. ✓
- [x] **`package.json` enhanced** (2026-04-27) — name=seismoguard, version=1.2.0, scripts: roc/grid/adaptive/pd/pptx/flowchart/stead-extract. ✓
- [x] **One-shot scripts archived** (2026-04-27) — 15 files moved to `scripts/oneshot/` (build_ch*, fix_*, splice_*, apply_format, extract_data, repack); active scripts kept at root. ✓
- [ ] **Two firmware copies** (`seismoguard_esp32.ino` legacy + `seismoguard_s3/`). Decide canonical. Archive other under `legacy/`.
- [x] **Backups archived** (2026-04-27) — 3 files moved to `archive/` (2× `_backup*.docx`, 1× `seismoguard_data_backup.json`). Git history preserved via `git mv`. ✓
- [ ] **Large binaries in repo** — `100samples.hdf5` (7.5 MB), `seismoguard_data.json` (6.7 MB), `noise_samples.png` (1.4 MB), `.docx` files. Consider git-lfs or release artifacts.
- [ ] **CI** — none. GitHub Action: lint `.ino` w/ `arduino-cli compile`, run `npm test`.
- [ ] **Tests folder skeletons only** (`test_01_serial`, etc.). Either populate w/ unit tests or rename to `examples/`.
- [ ] **`tests/` has no test runner**. Add minimal Node test for STA/LTA pure-JS reference impl vs known fixtures.
- [ ] **`POSTER_CONTENT.md` 26 KB** — split sections, reference figures by path not embed.

---

## Tier 6 — Security / Privacy

- [ ] ntfy.sh topics PUBLIC by default — anyone w/ topic name reads alerts. Either: self-host ntfy + auth, or accept + document.
- [ ] No OTA update — flash-only. Add ArduinoOTA w/ password OR sign-and-verify update path.
- [ ] No replay-attack defense on Tier-2 message. Add monotonic event counter + HMAC.
- [ ] FFat may persist event log w/ location-leaking timestamps. Document retention.

---

## Tier 7 — Stretch / Research

- [ ] **Edge-Impulse / TFLite anomaly model** trained on local noise → personalized FPR.
- [ ] **Federated update** — nodes share model weights via mesh, no central server.
- [ ] **Citizen-science map** — public dashboard plotting alerts (privacy-preserving: jittered GPS).
- [ ] **Comparison w/ MyShake / Earthquake Network** smartphone apps.
- [ ] **Paper submission** — conf options: AGU, SSA Annual, IEEE Sensors. Need real-event field data first.

---

## Honest Headline Weaknesses (from Ch 5)

1. STEAD is broadband-grade, MPU6050 is consumer MEMS — current 94% TPR / 1% FPR likely degrades in real deployment.
2. On-device-only alert (legacy) does not satisfy the EEW value prop. *S3 build addresses this w/ ntfy — verify reach < S-wave arrival.*
3. Real-world FA rate likely > 2.6%. CI on 38-sample noise set is wide.

---

## Definition of "Perfect" (closure criteria)

- [ ] ≥1 real local earthquake correctly alerted before S-wave by ≥2 mesh nodes.
- [ ] ≥30 days continuous deployment, FA rate ≤ 1/week measured.
- [ ] ROC + PR curves on hybrid STEAD+MPU6050-noise dataset, ≥500 noise samples.
- [ ] Watchdog + brownout + OTA + TLS-pinning all live.
- [ ] Public README, BOM, build guide, threat-model, calibration procedure.
- [ ] Single canonical firmware; archive removed.
- [ ] CI green; secret scan clean.
