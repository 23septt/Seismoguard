/**
 * pr_curve.js
 * Precision-Recall analysis + Mw stratification for SeismoGuard STA/LTA detector.
 *
 * Sweeps RATIO_TRIGGER like roc_analysis.js but emits PR curve + Average
 * Precision (AP) + per-Mw-bin TPR table at deployed operating points.
 *
 * Same simulate() as roc_analysis.js (verified copy — must stay in sync).
 */
'use strict';

const fs   = require('fs');
const data = require(`${__dirname}/seismoguard_data.json`);

const SAMPLE_RATE      = 50;
const ONSET            = 50;
const WINDOW           = 250;
const NOISE_WARMUP     = 1750;
const ALPHA_LTA_BLEED  = 0.0001;
const RATIO_DETRIGGER  = 1.5;

const STA_W    = 0.5;
const MIN_TRIG = 3;
const SPIKE    = 50;
const alphaSTA = 1 / (STA_W * SAMPLE_RATE);
const alphaLTA = 1 / (30  * SAMPLE_RATE);

function simulate(samples, ratioTrig, warmupCount = 0) {
  let sta = 0, lta = 0;
  let trigCount = 0;
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

// ── Filter usable entries ────────────────────────────────────────────────────
const minPwLen = ONSET + WINDOW;
const minNsLen = NOISE_WARMUP + WINDOW;
const usablePw = data.pwave.filter(p => p.data && p.data.length >= minPwLen);
const usableNs = data.noises.filter(n => Array.isArray(n) && n.length >= minNsLen);
const skippedPw = data.pwave.length - usablePw.length;
const skippedNs = data.noises.length - usableNs.length;

const N_PWAVE = usablePw.length;
const N_NOISE = usableNs.length;

// ── Sweep RATIO ──────────────────────────────────────────────────────────────
const points = [];
for (let r = 10.0; r >= 1.4; r = Math.round((r - 0.1) * 10) / 10) {
  let tp = 0;
  for (const pw of usablePw) {
    if (simulate(pw.data, r) !== null) tp++;
  }
  let fp = 0;
  for (const ns of usableNs) {
    if (simulate(ns, r, NOISE_WARMUP) !== null) fp++;
  }
  const fn        = N_PWAVE - tp;
  const tpr       = tp / N_PWAVE;
  const fpr       = fp / N_NOISE;
  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 1;
  const f1        = (precision + tpr) > 0 ? 2 * precision * tpr / (precision + tpr) : 0;
  points.push({ ratio: r, tp, fp, fn, tpr, fpr, precision, f1 });
}

// ── AP via trapezoidal integration over PR curve ─────────────────────────────
// Sort by recall ascending; integrate precision dRecall.
// Add (R=0, P=1) closure so the integral covers the full [0,1] recall axis
// (sklearn average_precision_score convention).
const prSorted = [...points].sort((a, b) => a.tpr - b.tpr);
const prClosed = [{ tpr: 0, precision: 1 }, ...prSorted];
let ap = 0;
for (let i = 1; i < prClosed.length; i++) {
  const dR = prClosed[i].tpr - prClosed[i-1].tpr;
  if (dR <= 0) continue;
  const avgP = (prClosed[i].precision + prClosed[i-1].precision) / 2;
  ap += dR * avgP;
}

const bestF1 = points.reduce((a, b) => b.f1 > a.f1 ? b : a);
const op50   = points.find(p => Math.abs(p.ratio - 5.0) < 0.05);
const op60   = points.find(p => Math.abs(p.ratio - 6.0) < 0.05);

// ── Mw stratification ────────────────────────────────────────────────────────
const bins = [
  { label: '[3.0,4.0)', lo: 3.0, hi: 4.0 },
  { label: '[4.0,5.0)', lo: 4.0, hi: 5.0 },
  { label: '[5.0,6.0)', lo: 5.0, hi: 6.0 },
  { label: '[6.0,inf)', lo: 6.0, hi: Infinity }
];
for (const b of bins) {
  b.subset = usablePw.filter(p => p.magnitude >= b.lo && p.magnitude < b.hi);
  b.n = b.subset.length;
  b.tpr_r5 = b.n > 0 ? b.subset.filter(p => simulate(p.data, 5.0) !== null).length / b.n : 0;
  b.tpr_r6 = b.n > 0 ? b.subset.filter(p => simulate(p.data, 6.0) !== null).length / b.n : 0;
}

// ── ASCII PR plot 50x20 ──────────────────────────────────────────────────────
const W = 50, H = 20;
const grid = Array.from({length: H}, () => Array(W).fill(' '));
for (let i = 0; i < H; i++) grid[i][0] = '│';
for (let j = 0; j < W; j++) grid[H-1][j] = '─';
grid[H-1][0] = '└';

for (const p of points) {
  const col = Math.round(p.tpr * (W-1));
  const row = H - 1 - Math.round(p.precision * (H-1));
  if (row >= 0 && row < H && col >= 0 && col < W) grid[row][col] = '●';
}
if (op60) {
  const col = Math.round(op60.tpr * (W-1));
  const row = H - 1 - Math.round(op60.precision * (H-1));
  if (row >= 0 && row < H && col >= 0 && col < W) grid[row][col] = '★';
}

// ── Output ───────────────────────────────────────────────────────────────────
console.log('\n+--------------------------------------------------------------+');
console.log('|         SeismoGuard - Precision-Recall + Mw Stratification   |');
console.log('+--------------------------------------------------------------+\n');
if (skippedPw || skippedNs) {
  console.log(`[warn] skipped pwave=${skippedPw} (len < ${minPwLen}), noise=${skippedNs} (len < ${minNsLen})`);
}
console.log(`Usable: pwave=${N_PWAVE}  noise=${N_NOISE}\n`);

console.log('Precision');
console.log(' 1.0|');
for (let i = 0; i < H; i++) {
  const lbl = i === 0 ? '    ' : i === Math.floor(H/2) ? '0.5 ' : '    ';
  console.log(lbl + grid[i].join(''));
}
console.log('     0.0' + ' '.repeat(Math.max(0,W/2-4)) + '0.5' + ' '.repeat(Math.max(0,W/2-3)) + '1.0  -> Recall');
console.log(`     * = operating point (RATIO=6.0)\n`);

console.log(`AP  = ${ap.toFixed(4)}   (Average Precision via trapezoidal PR integration)`);
console.log(`Best F1 = ${bestF1.f1.toFixed(3)} at RATIO=${bestF1.ratio.toFixed(1)}` +
            ` (Precision=${(bestF1.precision*100).toFixed(0)}%, Recall=${(bestF1.tpr*100).toFixed(0)}%)`);
if (op60) console.log(`RATIO=6.0  Precision=${(op60.precision*100).toFixed(1)}%  Recall=${(op60.tpr*100).toFixed(1)}%  F1=${op60.f1.toFixed(3)}`);
if (op50) console.log(`RATIO=5.0  Precision=${(op50.precision*100).toFixed(1)}%  Recall=${(op50.tpr*100).toFixed(1)}%  F1=${op50.f1.toFixed(3)}`);

console.log('\nMw bin       n    TPR@R=5.0    TPR@R=6.0');
console.log('---------- ---- ----------- -----------');
for (const b of bins) {
  console.log(
    b.label.padEnd(11) +
    String(b.n).padStart(4) + '  ' +
    `${(b.tpr_r5*100).toFixed(1).padStart(8)}%   ` +
    `${(b.tpr_r6*100).toFixed(1).padStart(8)}%`
  );
}

// ── CSV exports ──────────────────────────────────────────────────────────────
const prCsv = ['ratio,tpr,fpr,precision,f1,tp,fp,fn',
  ...points.map(p =>
    `${p.ratio.toFixed(1)},${p.tpr.toFixed(4)},${p.fpr.toFixed(4)},` +
    `${p.precision.toFixed(4)},${p.f1.toFixed(4)},${p.tp},${p.fp},${p.fn}`
  )].join('\n');
fs.writeFileSync(`${__dirname}/pr_data.csv`, prCsv);

const mwCsv = ['mw_bin,n,tpr_r5,tpr_r6',
  ...bins.map(b => `${b.label},${b.n},${b.tpr_r5.toFixed(4)},${b.tpr_r6.toFixed(4)}`)
  ].join('\n');
fs.writeFileSync(`${__dirname}/mw_strat.csv`, mwCsv);

console.log('\nCSV saved -> pr_data.csv, mw_strat.csv');
