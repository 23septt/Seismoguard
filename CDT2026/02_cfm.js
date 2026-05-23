'use strict';
/**
 * CDT2026 / 02_cfm.js
 * Compute Confusion Matrix from dataset_clean.json
 *
 * Canonical operating point (from roc_analysis.js):
 *   STA = 0.5 s, LTA = 30 s, RATIO = 5.0, MIN = 3, SPIKE = 50
 *
 * Outputs:
 *   - Confusion matrix (TP / FP / FN / TN)
 *   - Precision, Recall, Specificity, F1, Accuracy
 *   - Per-Mw-bin breakdown of TP / FN
 *   - Full CFM at key RATIO sweep points
 */

const path = require('path');
const data = require('./dataset_clean.json');

const SAMPLE_RATE     = 50;
const ONSET           = 50;
const WINDOW          = 250;
const NOISE_WARMUP    = 1750;
const ALPHA_LTA_BLEED = 0.0001;
const RATIO_DETRIGGER = 1.5;

// ── Canonical params ──────────────────────────────────────────────────────────
const STA_W    = 0.5;
const MIN_TRIG = 3;
const SPIKE    = 50;
const alphaSTA = 1 / (STA_W * SAMPLE_RATE);
const alphaLTA = 1 / (30 * SAMPLE_RATE);

// ── Simulate one waveform ─────────────────────────────────────────────────────
function simulate(samples, ratioTrig, warmupCount = 0) {
  let sta = 0, lta = 0, trigCount = 0;
  let state = 'STANDBY';

  const firstCF = samples[0] * samples[0];
  sta = firstCF; lta = firstCF;

  for (let i = 0; i < warmupCount; i++) {
    const cf = samples[i] * samples[i];
    lta = alphaLTA * cf + (1 - alphaLTA) * lta;
    sta = alphaSTA * cf + (1 - alphaSTA) * sta;
  }

  let detectedAt = null;

  for (let i = warmupCount; i < warmupCount + WINDOW; i++) {
    let cf = samples[i] * samples[i];
    const ltaRef = Math.max(lta, 1e-9);
    if (cf > SPIKE * ltaRef) cf = SPIKE * ltaRef;

    sta = alphaSTA * cf + (1 - alphaSTA) * sta;
    const ratio = lta > 1e-9 ? sta / lta : 0;

    switch (state) {
      case 'STANDBY':
        lta = alphaLTA * cf + (1 - alphaLTA) * lta;
        if (ratio >= ratioTrig) { trigCount++; state = 'DETECTING'; }
        break;
      case 'DETECTING':
        lta = ALPHA_LTA_BLEED * cf + (1 - ALPHA_LTA_BLEED) * lta;
        if (ratio >= ratioTrig) {
          trigCount++;
          if (trigCount >= MIN_TRIG) {
            state = 'ALARMING';
            if (detectedAt === null) detectedAt = i - warmupCount;
          }
        } else { trigCount = 0; state = 'STANDBY'; }
        break;
      case 'ALARMING':
        lta = ALPHA_LTA_BLEED * cf + (1 - ALPHA_LTA_BLEED) * lta;
        if (ratio < RATIO_DETRIGGER) state = 'LOCKOUT';
        break;
      case 'LOCKOUT':
        lta = alphaLTA * cf + (1 - alphaLTA) * lta;
        break;
    }
  }
  return detectedAt;
}

// ── CFM at one operating point ────────────────────────────────────────────────
function computeCFM(ratioTrig) {
  let tp = 0, fn = 0, delays = [];
  for (const pw of data.pwave) {
    const det = simulate(pw.data, ratioTrig);
    if (det !== null) { tp++; delays.push(Math.max(0, det - ONSET)); }
    else fn++;
  }

  let fp = 0, tn = 0;
  for (const ns of data.noises) {
    if (simulate(ns, ratioTrig, NOISE_WARMUP) !== null) fp++;
    else tn++;
  }

  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 1;
  const recall    = (tp + fn) > 0 ? tp / (tp + fn) : 0;
  const f1        = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const accuracy  = (tp + tn + fp + fn) > 0 ? (tp + tn) / (tp + tn + fp + fn) : 0;
  const spec      = (tn + fp) > 0 ? tn / (tn + fp) : 1;
  const avgDelay  = delays.length > 0 ? delays.reduce((a,b) => a+b, 0) / delays.length : 999;

  return { tp, fn, fp, tn, precision, recall, f1, accuracy, spec, avgDelay };
}

// ── Main: canonical operating point ──────────────────────────────────────────
const CANON_RATIO = 5.0;
const c = computeCFM(CANON_RATIO);
const N_P = data.pwave.length;
const N_N = data.noises.length;

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║   CDT2026 / 02_cfm.js  —  Confusion Matrix               ║');
console.log(`║   Dataset: ${N_P}P + ${N_N}N  |  RATIO=${CANON_RATIO}  STA=${STA_W}s  MIN=${MIN_TRIG}  SPIKE=${SPIKE}  ║`);
console.log('╚══════════════════════════════════════════════════════════╝');

console.log('\n  ┌─────────────────────────────────────────────────────┐');
console.log('  │              Predicted                               │');
console.log('  │         ALARM         NO-ALARM                      │');
console.log(`  │ Actual  TP=${String(c.tp).padStart(4)}  │  FN=${String(c.fn).padStart(3)}   (P-wave, n=${N_P}) │`);
console.log(`  │         FP=${String(c.fp).padStart(4)}  │  TN=${String(c.tn).padStart(3)}   (Noise,  n=${N_N}) │`);
console.log('  └─────────────────────────────────────────────────────┘');

console.log('\n  ── Metrics ────────────────────────────────────────────────');
console.log(`  Precision   (PPV)  : ${(c.precision*100).toFixed(2)}%   TP/(TP+FP)`);
console.log(`  Recall      (TPR)  : ${(c.recall*100).toFixed(2)}%   TP/(TP+FN)`);
console.log(`  Specificity (TNR)  : ${(c.spec*100).toFixed(2)}%   TN/(TN+FP)`);
console.log(`  F1-score           : ${c.f1.toFixed(4)}`);
console.log(`  Accuracy           : ${(c.accuracy*100).toFixed(2)}%`);
console.log(`  Avg detect delay   : ${c.avgDelay.toFixed(1)} samples  (${(c.avgDelay/SAMPLE_RATE*1000).toFixed(0)} ms @ ${SAMPLE_RATE} Hz)`);
console.log(`  False Alarm Rate   : ${(c.fp/N_N*100).toFixed(2)}%  (${c.fp}/${N_N})`);

// ── Per-Mw breakdown ──────────────────────────────────────────────────────────
const mwBins = [
  ['sub  Mw 3–4.5', 3.0, 4.5],
  ['T1   Mw 4.5–5 ', 4.5, 5.0],
  ['T2   Mw 5–6.5 ', 5.0, 6.5],
  ['crit Mw 6.5+  ', 6.5, 99],
];

console.log('\n  ── Detection by Mw bin (RATIO=5.0) ───────────────────────');
console.log('  Bin               N    TP    FN   Recall  AvgDelay');
console.log('  ──────────────────────────────────────────────────────');

for (const [label, lo, hi] of mwBins) {
  const subset = data.pwave.filter(p => p.magnitude >= lo && p.magnitude < hi);
  let bTP = 0, bFN = 0, bDelays = [];
  for (const pw of subset) {
    const det = simulate(pw.data, CANON_RATIO);
    if (det !== null) { bTP++; bDelays.push(Math.max(0, det - ONSET)); }
    else bFN++;
  }
  const bRecall = subset.length > 0 ? bTP / subset.length : 0;
  const bDelay  = bDelays.length > 0 ? bDelays.reduce((a,b) => a+b, 0) / bDelays.length : NaN;
  const delayStr = isNaN(bDelay) ? '  N/A' : bDelay.toFixed(1).padStart(5);
  console.log(
    `  ${label}  ${String(subset.length).padStart(3)}   ${String(bTP).padStart(3)}   ${String(bFN).padStart(3)}` +
    `   ${(bRecall*100).toFixed(0).padStart(3)}%    ${delayStr} smp`
  );
}

// ── RATIO sweep summary ───────────────────────────────────────────────────────
const sweepRatios = [3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
console.log('\n  ── RATIO sweep (STA=0.5s  MIN=3  SPIKE=50) ───────────────');
console.log('  RATIO │  TP    FN    FP    TN  │ Precision  Recall    F1     Acc');
console.log('  ──────┼───────────────────────┼─────────────────────────────────');
for (const r of sweepRatios) {
  const m = computeCFM(r);
  console.log(
    `   ${r.toFixed(1)}  │ ${String(m.tp).padStart(3)}   ${String(m.fn).padStart(3)}   ${String(m.fp).padStart(3)}   ${String(m.tn).padStart(3)}  │` +
    `  ${(m.precision*100).toFixed(1).padStart(5)}%  ${(m.recall*100).toFixed(1).padStart(5)}%  ${m.f1.toFixed(4)}  ${(m.accuracy*100).toFixed(1).padStart(5)}%`
  );
}

console.log('\n  ★  = operating point used in firmware (RATIO=5.0)\n');
