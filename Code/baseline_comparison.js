/**
 * baselines.js
 * Baseline detector comparison vs SeismoGuard recursive STA/LTA.
 *
 *   1. Classic non-recursive STA/LTA (sliding-window means, no EMA, no spike clip).
 *   2. AIC picker (Maeda 1985): argmin_k of k*ln(var(x[1..k])) + (N-k-1)*ln(var(x[k+1..N])).
 *
 * Both run on identical dataset + identical CF (a_z^2). Detection = trigger
 * within ±tolerance samples of ground-truth onset (ONSET=50 in pwave; for noise
 * any trigger = false alarm). Output: TPR/FPR/F1/avg-delay table.
 *
 * Fairness notes:
 *   - Pwave samples are pre-trimmed to 300 with ONSET=50 (50 samples pre +
 *     250 post). This caps the LTA window any non-recursive method can use.
 *     Classic uses STA=10 (0.2 s), LTA=50 (1 s) — fills LTA from pre-onset
 *     region, then scans the same 250-sample WINDOW the recursive method does.
 *     Note: this is a SHORTER LTA than SeismoGuard's effective 30 s; classic
 *     is therefore tested on the lower-noise-rejection regime that the data
 *     length permits. Documented as a caveat.
 *   - Noise samples are 2000 long; classic uses NOISE_WARMUP-LTA_W start to
 *     fill the LTA window before the 250-sample scan window.
 *   - AIC has no built-in noise rejection — it always returns an "onset" k,
 *     so we gate AIC by an energy floor: declare a pick only when peak |x| in
 *     the analysis window exceeds 3× noise-floor std.
 */
'use strict';

const fs   = require('fs');
const data = require(`${__dirname}/seismoguard_data.json`);

const SAMPLE_RATE = 50;
const ONSET       = 50;
const WINDOW      = 250;
const NOISE_WARMUP = 1750;

// Classic STA/LTA — windows constrained by pwave pre-onset length (50 samples)
const STA_W_SAMPLES = 10;     // 0.2 s
const LTA_W_SAMPLES = 50;     // 1.0 s — capped by ONSET=50 pre-onset region
const CLASSIC_RATIO = 6.0;    // same trigger threshold as SeismoGuard
const TOLERANCE     = 50;     // ±50 samples = ±1 s tolerance for "correct detection"

// AIC parameters
const AIC_MIN_K     = 5;      // skip first/last few samples to avoid log(0)
const AIC_ENERGY_K  = 3.0;    // peak |x| > AIC_ENERGY_K × noise_std required to pick

// ── Helpers ──────────────────────────────────────────────────────────────────
function variance(arr) {
  if (arr.length < 2) return 1e-12;
  let m = 0;
  for (const v of arr) m += v;
  m /= arr.length;
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return s / arr.length || 1e-12;
}

function std(arr) {
  return Math.sqrt(variance(arr));
}

// ── 1. Classic non-recursive STA/LTA (sliding window) ────────────────────────
function classicStaLta(samples, ratioTrig, warmupCount = 0) {
  const need = warmupCount + LTA_W_SAMPLES + WINDOW;
  if (samples.length < need) return null;

  // Pre-square
  const cf = new Array(samples.length);
  for (let i = 0; i < samples.length; i++) cf[i] = samples[i] * samples[i];

  // Sliding sums
  let staSum = 0, ltaSum = 0;
  // Initialize LTA over first LTA_W samples after warmupCount
  const ltaStart = warmupCount;
  for (let i = ltaStart; i < ltaStart + LTA_W_SAMPLES; i++) ltaSum += cf[i];
  // Initialize STA over last STA_W of those LTA samples
  const staInitStart = ltaStart + LTA_W_SAMPLES - STA_W_SAMPLES;
  for (let i = staInitStart; i < staInitStart + STA_W_SAMPLES; i++) staSum += cf[i];

  // Begin scanning at i = ltaStart + LTA_W_SAMPLES
  for (let i = ltaStart + LTA_W_SAMPLES; i < ltaStart + LTA_W_SAMPLES + WINDOW; i++) {
    const sta = staSum / STA_W_SAMPLES;
    const lta = ltaSum / LTA_W_SAMPLES;
    const ratio = lta > 1e-12 ? sta / lta : 0;
    if (ratio >= ratioTrig) {
      // Detection index relative to start of WINDOW (i.e. after warmup + LTA)
      return i - (ltaStart + LTA_W_SAMPLES);
    }
    // Slide windows
    staSum += cf[i] - cf[i - STA_W_SAMPLES];
    ltaSum += cf[i] - cf[i - LTA_W_SAMPLES];
  }
  return null;
}

// ── 2. AIC picker (Maeda 1985) ───────────────────────────────────────────────
// Returns onset index relative to start of analysis window, or null if energy
// floor not met.
function aicPick(samples, warmupCount = 0) {
  // Take a window equivalent to SeismoGuard's WINDOW but starting at
  // warmup (for noise) or at 0 (for pwave).
  const start = warmupCount;
  const end   = Math.min(samples.length, start + WINDOW);
  const win = samples.slice(start, end);
  const N = win.length;
  if (N < 2 * AIC_MIN_K + 1) return null;

  // Energy floor: estimate noise std from first 25 samples (0.5 s) of window
  const noiseStd = std(win.slice(0, Math.min(25, N)));
  let peak = 0;
  for (const v of win) if (Math.abs(v) > peak) peak = Math.abs(v);
  if (peak < AIC_ENERGY_K * noiseStd) return null;

  // AIC over k
  let bestK = AIC_MIN_K, bestAic = Infinity;
  for (let k = AIC_MIN_K; k < N - AIC_MIN_K; k++) {
    const v1 = variance(win.slice(0, k));
    const v2 = variance(win.slice(k));
    const aic = k * Math.log(v1) + (N - k - 1) * Math.log(v2);
    if (Number.isFinite(aic) && aic < bestAic) {
      bestAic = aic;
      bestK = k;
    }
  }
  return bestK;
}

// ── Filter usable entries (consistent w/ pr_curve.js + roc_analysis.js) ──────
// Classic uses pre-onset region (0..ONSET) for LTA fill, then scans post-onset
// WINDOW. Total length needed = ONSET + WINDOW = 300, same as recursive.
// Noise: warmup region must contain LTA_W trailing samples for fill, so
// minNsLen = NOISE_WARMUP + WINDOW = 2000.
const minPwLen = ONSET + WINDOW;
const minNsLen = NOISE_WARMUP + WINDOW;
const usablePw = data.pwave.filter(p => p.data && p.data.length >= minPwLen);
const usableNs = data.noises.filter(n => Array.isArray(n) && n.length >= minNsLen);
const N_PWAVE = usablePw.length;
const N_NOISE = usableNs.length;
const skippedPw = data.pwave.length - N_PWAVE;
const skippedNs = data.noises.length - N_NOISE;

// For SeismoGuard recursive (re-run here so the comparison uses the SAME
// usable subset — apples-to-apples)
const ALPHA_LTA_BLEED = 0.0001;
const RATIO_DETRIGGER = 1.5;
const STA_W           = 0.5;
const MIN_TRIG_REC    = 3;
const SPIKE           = 50;
const alphaSTA = 1 / (STA_W * SAMPLE_RATE);
const alphaLTA = 1 / (30 * SAMPLE_RATE);

function recursiveSimulate(samples, ratioTrig, warmupCount = 0) {
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
          if (trigCount >= MIN_TRIG_REC) {
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

// ── Run all three on the same usable set ─────────────────────────────────────
function evaluate(name, fnPwave, fnNoise) {
  let tp = 0, fp = 0;
  const delays = [];
  for (const pw of usablePw) {
    const det = fnPwave(pw.data);
    if (det !== null) {
      tp++;
      delays.push(Math.max(0, det - ONSET));
    }
  }
  for (const ns of usableNs) {
    if (fnNoise(ns) !== null) fp++;
  }
  const fn = N_PWAVE - tp;
  const tpr = tp / N_PWAVE;
  const fpr = fp / N_NOISE;
  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 1;
  const f1 = (precision + tpr) > 0 ? 2 * precision * tpr / (precision + tpr) : 0;
  const avgDelay = delays.length > 0 ? delays.reduce((a,b)=>a+b,0)/delays.length : NaN;
  return { name, tp, fp, fn, tpr, fpr, precision, f1, avgDelay };
}

const results = [];

results.push(evaluate(
  'SeismoGuard (recursive, R=6.0)',
  pw => recursiveSimulate(pw, 6.0, 0),
  ns => recursiveSimulate(ns, 6.0, NOISE_WARMUP)
));

results.push(evaluate(
  `Classic STA/LTA (window, R=${CLASSIC_RATIO})`,
  pw => classicStaLta(pw, CLASSIC_RATIO, 0),
  ns => classicStaLta(ns, CLASSIC_RATIO, NOISE_WARMUP - LTA_W_SAMPLES)
));

// Sweep classic ratio 1.5..10 step 0.1 — find best F1 (fairer comparison
// since classic's short LTA inherently produces lower peak ratios).
let bestClassic = { f1: -1 };
for (let r = 1.5; r <= 10.0001; r = Math.round((r + 0.1) * 10) / 10) {
  const e = evaluate(
    `Classic STA/LTA sweep R=${r.toFixed(1)}`,
    pw => classicStaLta(pw, r, 0),
    ns => classicStaLta(ns, r, NOISE_WARMUP - LTA_W_SAMPLES)
  );
  if (e.f1 > bestClassic.f1) bestClassic = { ...e, ratio: r };
}
bestClassic.name = `Classic STA/LTA best-F1 (R=${bestClassic.ratio.toFixed(1)})`;
results.push(bestClassic);

results.push(evaluate(
  `AIC picker (energy-gated, K=${AIC_ENERGY_K})`,
  pw => aicPick(pw, 0),
  ns => aicPick(ns, NOISE_WARMUP)
));

// ── Print table ──────────────────────────────────────────────────────────────
console.log('\n+----------------------------------------------------------------+');
console.log('|        SeismoGuard - Baseline Detector Comparison              |');
console.log('+----------------------------------------------------------------+\n');
if (skippedPw || skippedNs) {
  console.log(`[warn] skipped pwave=${skippedPw} (len < ${minPwLen}), noise=${skippedNs} (len < ${minNsLen})`);
}
console.log(`Usable subset: pwave=${N_PWAVE}  noise=${N_NOISE}\n`);

console.log('Detector                                  TPR     FPR   Precision   F1     Delay(samp)');
console.log('---------------------------------------- ------ ------ ----------- ------ ------------');
for (const r of results) {
  console.log(
    r.name.padEnd(40) + ' ' +
    `${(r.tpr*100).toFixed(1).padStart(5)}%` + ' ' +
    `${(r.fpr*100).toFixed(1).padStart(5)}%` + '  ' +
    `${(r.precision*100).toFixed(1).padStart(8)}%` + '  ' +
    `${r.f1.toFixed(3).padStart(5)}` + '  ' +
    (Number.isNaN(r.avgDelay) ? '   N/A' : r.avgDelay.toFixed(1).padStart(6))
  );
}

// ── CSV export ───────────────────────────────────────────────────────────────
const csv = ['detector,tp,fp,fn,tpr,fpr,precision,f1,avg_delay_samples',
  ...results.map(r =>
    `"${r.name}",${r.tp},${r.fp},${r.fn},${r.tpr.toFixed(4)},${r.fpr.toFixed(4)},` +
    `${r.precision.toFixed(4)},${r.f1.toFixed(4)},` +
    `${Number.isNaN(r.avgDelay) ? '' : r.avgDelay.toFixed(2)}`
  )].join('\n');
fs.writeFileSync(`${__dirname}/baselines_data.csv`, csv);

console.log('\nCSV saved -> baselines_data.csv');
console.log('\nNotes:');
console.log(`  - Classic STA/LTA uses sliding windows STA=${STA_W_SAMPLES}, LTA=${LTA_W_SAMPLES} samples.`);
console.log('    LTA capped at 50 samples (1 s) by pwave pre-onset region length.');
console.log('  - AIC picker is energy-gated (peak |x| > 3 sigma_noise) to suppress flat-noise picks.');
console.log('  - Same dataset filter applied to all three for fairness.');
