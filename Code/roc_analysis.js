/**
 * roc_analysis.js
 * ROC (Receiver Operating Characteristic) analysis for SeismoGuard STA/LTA detector.
 *
 * Method:
 *   Fix best params (τ_STA=0.5s, MIN=10, SPIKE=100) from grid search.
 *   Sweep RATIO_TRIGGER from 1.5 → 10.0 in 0.1 steps → 86 operating points.
 *   At each point compute TPR (Detection Rate) and FPR (False Alarm Rate).
 *   Plot ASCII ROC curve + calculate AUC via trapezoidal rule.
 *   Also output a CSV for external plotting.
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

// ── Best fixed params from grid search ─────────────────────────────────────
const STA_W    = 0.5;
const MIN_TRIG = 3;
const SPIKE    = 50;
const alphaSTA = 1 / (STA_W * SAMPLE_RATE);   // 0.04
const alphaLTA = 1 / (30  * SAMPLE_RATE);      // 0.000667

// ── Simulate one waveform ────────────────────────────────────────────────────
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

// ── Sweep RATIO ──────────────────────────────────────────────────────────────
const N_PWAVE = data.pwave.length;   // 439 (stratified: sub 3–4.5×100, T1 4.5–5×100, T2 5–6.5×200, crit 6.5+×39)
const N_NOISE = data.noises.length;  // 250

const rocPoints = [];  // { ratio, tpr, fpr, f1, precision, recall }

for (let r = 10.0; r >= 1.4; r = Math.round((r - 0.1) * 10) / 10) {
  // P-wave detection (TP)
  let tp = 0, delays = [];
  for (const pw of data.pwave) {
    const det = simulate(pw.data, r);
    if (det !== null) {
      tp++;
      if (det >= ONSET) delays.push(det - ONSET);
      else              delays.push(0);
    }
  }

  // Noise false alarms (FP)
  let fp = 0;
  for (const ns of data.noises) {
    if (simulate(ns, r, NOISE_WARMUP) !== null) fp++;
  }

  const tpr       = tp / N_PWAVE;                // sensitivity / recall
  const fpr       = fp / N_NOISE;                // false alarm rate
  const precision = tp > 0 ? tp / (tp + fp) : 1;
  const f1        = (precision + tpr) > 0 ? 2 * precision * tpr / (precision + tpr) : 0;
  const avgDelay  = delays.length > 0 ? delays.reduce((a,b)=>a+b,0)/delays.length : 999;

  rocPoints.push({ ratio: r, tpr, fpr, precision, f1, tp, fp, avgDelay });
}

// Sort by FPR ascending for AUC calculation
rocPoints.sort((a, b) => a.fpr - b.fpr);

// ── AUC (trapezoidal) ────────────────────────────────────────────────────────
let auc = 0;
for (let i = 1; i < rocPoints.length; i++) {
  const dx = rocPoints[i].fpr - rocPoints[i-1].fpr;
  const avgY = (rocPoints[i].tpr + rocPoints[i-1].tpr) / 2;
  auc += dx * avgY;
}
// Add area from last point to (1,1)
const last = rocPoints[rocPoints.length - 1];
auc += (1 - last.fpr) * last.tpr;

// ── Best F1 operating point ──────────────────────────────────────────────────
const bestF1 = rocPoints.reduce((a, b) => b.f1 > a.f1 ? b : a);

// ── ASCII ROC plot (20×20) ───────────────────────────────────────────────────
const W = 50, H = 20;
const grid = Array.from({length: H}, () => Array(W).fill(' '));

// Axes
for (let i = 0; i < H; i++) grid[i][0] = '│';
for (let j = 0; j < W; j++) grid[H-1][j] = '─';
grid[H-1][0] = '└';

// Diagonal (random classifier)
for (let j = 1; j < W; j++) {
  const i = H - 1 - Math.round((j / (W-1)) * (H-1));
  if (i >= 0 && i < H) grid[i][j] = '·';
}

// Plot ROC curve
for (const pt of rocPoints) {
  const col = Math.round(pt.fpr * (W-1));
  const row = H - 1 - Math.round(pt.tpr * (H-1));
  if (row >= 0 && row < H && col >= 0 && col < W)
    grid[row][col] = '●';
}

// Mark operating point (RATIO=5.0)
const op50 = rocPoints.find(p => Math.abs(p.ratio - 5.0) < 0.05);
if (op50) {
  const col = Math.round(op50.fpr * (W-1));
  const row = H - 1 - Math.round(op50.tpr * (H-1));
  if (row >= 0 && row < H) grid[row][col] = '★';
}

// ── Print results ────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║            SeismoGuard — ROC Analysis                       ║');
console.log('║  Fixed: τ_STA=0.5s  MIN=3   SPIKE=50   |  Sweep: RATIO     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('TPR\n 1.0┤');
for (let i = 0; i < H; i++) {
  const label = i === 0 ? '    ' : i === H/2 ? '0.5 ' : '    ';
  console.log(label + grid[i].join(''));
}
console.log('       0.0' + ' '.repeat(W/2-4) + '0.5' + ' '.repeat(W/2-3) + '1.0  → FPR');
console.log('       ★ = operating point (RATIO=5.0)\n');

console.log(`AUC = ${auc.toFixed(4)}  (1.0 = perfect, 0.5 = random)\n`);

// Table: key operating points
const keyRatios = [2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
console.log('RATIO │  TPR     FPR    Precision   F1    AvgDelay(samples)');
console.log('──────┼──────────────────────────────────────────────────────');
for (const kr of keyRatios) {
  const pt = rocPoints.find(p => Math.abs(p.ratio - kr) < 0.05);
  if (!pt) continue;
  console.log(
    `${kr.toFixed(1).padStart(5)} │` +
    ` ${(pt.tpr*100).toFixed(0).padStart(5)}%` +
    `  ${(pt.fpr*100).toFixed(0).padStart(4)}%` +
    `   ${(pt.precision*100).toFixed(0).padStart(6)}%` +
    `  ${pt.f1.toFixed(3)}` +
    `  ${pt.avgDelay < 900 ? pt.avgDelay.toFixed(1) : 'N/A'}`
  );
}
console.log(`\nBest F1 = ${bestF1.f1.toFixed(3)} at RATIO = ${bestF1.ratio.toFixed(1)}` +
            ` (TPR=${(bestF1.tpr*100).toFixed(0)}%, FPR=${(bestF1.fpr*100).toFixed(0)}%)`);

// ── CSV export ───────────────────────────────────────────────────────────────
const csvPath = `${__dirname}/roc_data.csv`;
const csv = ['ratio,tpr,fpr,precision,f1,tp,fp,avg_delay_samples',
  ...rocPoints.map(p =>
    `${p.ratio.toFixed(1)},${p.tpr.toFixed(4)},${p.fpr.toFixed(4)},` +
    `${p.precision.toFixed(4)},${p.f1.toFixed(4)},${p.tp},${p.fp},` +
    `${p.avgDelay < 900 ? p.avgDelay.toFixed(2) : ''}`
  )].join('\n');
fs.writeFileSync(csvPath, csv);
console.log(`\nCSV saved → roc_data.csv`);
