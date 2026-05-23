# CDT2026 — Post-competition roadmap

Items deferred from the competition scope to keep the build tractable
under the 12-hour day + <1-month prep budget. Listed in roughly
impact-÷-effort order. If a future maintainer picks this up, start at
the top.

## Tier 0 — credibility (do these first to make the F1=0.995 number real on this hardware)

- [ ] **Real-hardware noise dataset.** Capture ≥500 categorised
      Modulino Movement noise samples (vehicle pass, jump near sensor,
      door slam, washing machine, foot traffic, HVAC, dropped object,
      drilling). Replace the STEAD-only validation with hybrid
      STEAD+real-noise → re-run grid search → publish honest TPR/FPR.
- [ ] **Field test.** Deploy ≥3 nodes in a seismically active area
      (Chiang Rai, or near the Sagaing fault if logistics permit) for
      ≥30 continuous days. Log raw 100 Hz traces to USB flash. Cross-
      reference with TMD + USGS catalogue. Measure FA rate per week.
- [ ] **End-to-end latency benchmark on real hardware.** Run
      `scripts/latency_probe.py` against the actual Modulino chain
      (not the synthetic self-test). Logic analyser on the buzzer
      line for ground truth. Publish median + p95 for T1 and T2.

## Tier 1 — Mw accuracy (Thailand calibration)

- [ ] **Recalibrate Wu & Kanamori coefficients for Thailand.** Pull
      TMD historical waveform catalogue, fit (a, b, c) on a Thai
      training set, hold out a test set. Target Mw RMSE < 0.5.
      Document the new coefficients in `algo_polyglot/spec/SAMPLE_RECORD.md`.
- [ ] **GPS time sync + S–P time estimate.** Add NEO-6M GPS module
      (~฿200), use S-arrival detection to estimate hypocentral
      distance R per event instead of the fixed R=10 km. Should
      collapse most of the current Mw uncertainty.
- [ ] **3-axis CF.** Re-run the grid search using
      `cf = dx² + dy² + dz²` (or a PCA-picked highest-energy axis)
      instead of Z-only. The original SeismoGuard wiki noted this
      catches S/surface waves too — needs revalidation against the
      hybrid noise dataset.

## Tier 2 — multi-station mesh (closes the single-station limits)

- [ ] **ESP-NOW / MQTT vote protocol.** "≥2 nodes within 5 s of each
      other → confirmed event" rule. Each node still runs the local
      pipeline; the mesh just adds a confirmation gate before T2.
      Drops single-station FPR by an order of magnitude in literature.
- [ ] **Network protocol spec.** Heartbeat schema, alert vote message
      format, dedup window, replay-attack defence (monotonic event
      counter + HMAC). Document in `algo_polyglot/spec/`.
- [ ] **Localisation.** With 3+ nodes + GPS-synced clocks, you can do
      simple triangulation on first-pick times. Even ±50 km is useful
      for narrowing Mw via known fault distances.

## Tier 3 — algorithm + ML

- [ ] **TFLite Micro classifier** on the post-trigger window.
      Earthquake vs. human-activity (footsteps, doors, HVAC). Runs
      after STA/LTA opens the window (compute budget is fine since
      we only run it at ≤ 1 Hz). Could push FPR below 0.1 %.
- [ ] **Adaptive STA/LTA threshold v3.** The original wiki noted that
      PAT v2 dropped TPR to 82 % despite holding FPR at 0 %. Tune the
      adaptation buffer + PK, or ensemble fixed+adaptive thresholds.
- [ ] **AIC picker baseline.** Add the AIC picker as a baseline in the
      ROC comparison alongside STA/LTA — gives a more honest "vs
      classic methods" story.

## Tier 4 — hardware paths

- [ ] **ADXL355 / ADXL345 swap path.** Document BOM substitution and
      expected SNR gain (~16×). Pin-compatible adapter PCB design.
- [ ] **Li-ion 18650 backup.** TP4056 charger + MT3608 boost. Target
      ≥ 4 hour runtime without mains. Brown-out push alert when grid
      drops.
- [ ] **Temperature stress test.** MEMS zero-g drift vs T sweep
      across 0–50 °C. Document the failure mode + drift correction.

## Tier 5 — productisation

- [ ] **Public dashboard** (web). Map of all deployed nodes with
      privacy-preserving jittered GPS. Live alert feed.
- [ ] **Self-host ntfy.sh + auth.** The current setup uses public
      topics which are readable by anyone with the topic name. Self-
      hosting with token auth fixes the privacy gap.
- [ ] **TLS pinning + signed firmware updates.** OTA via signed
      bundles, ISRG Root X1 cert pinning, replay-attack defence.
- [ ] **Citizen-science integration.** Compare against MyShake +
      Earthquake Network smartphone apps in real time; publish a
      complementarity report.

## Tier 6 — research outputs

- [ ] **Conference paper.** AGU, SSA Annual, or IEEE Sensors. Need
      real-event field data first.
- [ ] **Open dataset release.** The Modulino noise dataset from Tier 0,
      released under CC-BY. Becomes a community resource for other
      MEMS-based EEW prototypes.
- [ ] **Federated update protocol.** Nodes share model weights via
      mesh, no central server. Personalised FPR per deployment site.

## How to pick what to work on next

If you have **one weekend** → Tier 0 #1 (noise dataset capture in your home/office).

If you have **one month** → Tier 0 (#1 + #3) + Tier 2 #1 (ESP-NOW prototype).

If you have **a semester** → Tier 0 all + Tier 1 #1 (Thailand recalibration). Submit to a regional conference.

If you have **a year** → everything in Tier 0–3, plus Tier 6 #1 paper draft.
