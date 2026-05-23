'use strict';
/**
 * CDT2026 / 03_sensor_degradation.js
 *
 * Hypothesis: STEAD broadband seismometer data over-estimates real-world
 * MPU6050 MEMS performance. MPU6050 noise floor ≈16× worse than broadband
 * (400 µg/√Hz vs ~25 µg/√Hz — per critique doc).
 *
 * Model:
 *   For each trace, compute σ_ref = std(pre-onset window [0:50]).
 *   Inject additive white Gaussian noise with σ_inject = K × σ_ref.
 *   SNR degrades by factor 1/√(1 + K²).
 *
 * Degradation levels (K):
 *   K=0   → clean STEAD (baseline, no injection)
 *   K=1   → SNR ÷ √2  ≈ 0.71× (mild MEMS sensor)
 *   K=2   → SNR ÷ √5  ≈ 0.45× (moderate real-world vibration)
 *   K=4   → SNR ÷ √17 ≈ 0.24× (heavy building vibration)
 *   K=8   → SNR ÷ √65 ≈ 0.12× (MPU6050 + environmental noise)
 *   K=16  → SNR ÷ √257 ≈ 0.06× (worst-case MEMS spec vs broadband)
 *
 * 30 Monte Carlo trials per level → stable mean ± std estimates.
 * Canonical params: STA=0.5s, RATIO=5.0, MIN=3, SPIKE=50.
 */

const data = require('./dataset_clean.json');

const SAMPLE_RATE     = 50;
const ONSET           = 50;
const WINDOW          = 250;
const NOISE_WARMUP    = 1750;
const ALPHA_LTA_BLEED = 0.0001;
const RATIO_DETRIGGER = 1.5;
const STA_W           = 0.5;
const MIN_TRIG        = 3;
const SPIKE           = 50;
const CANON_RATIO     = 5.0;
const alphaSTA        = 1 / (STA_W * SAMPLE_RATE);
const alphaLTA        = 1 / (30 * SAMPLE_RATE);

const N_TRIALS = 30;
const K_LEVELS = [0, 1, 2, 4, 8, 16];   // noise multiplier

// ── Deterministic PRNG (mulberry32) ──────────────────────────────────────────
function makePrng(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller: two uniform → two standard normals
function randNorm(rng) {
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ── Simulate one waveform ─────────────────────────────────────────────────────
function simulate(samples, ratioTrig, warmupCount = 0) {
  let sta = 0, lta = 0, trigCount = 0, state = 'STANDBY';
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
          if (trigCount >= MIN_TRIG) { state = 'ALARMING'; if (detectedAt === null) detectedAt = i - warmupCount; }
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

// ── Pre-compute per-trace noise reference σ ───────────────────────────────────
function preOnsetStd(arr, start, len) {
  const seg = arr.slice(start, start + len);
  const mean = seg.reduce((a, b) => a + b, 0) / seg.length;
  const v = seg.reduce((a, x) => a + (x - mean) ** 2, 0) / seg.length;
  return Math.sqrt(v);
}

const pSigmaRef  = data.pwave.map(p  => preOnsetStd(p.data, 0, ONSET));
const nSigmaRef  = data.noises.map(n => preOnsetStd(n, 0, 200));

// ── Inject noise into a copy of a trace ──────────────────────────────────────
function injectNoise(original, sigma, rng) {
  if (sigma === 0) return original;
  return original.map(v => v + sigma * randNorm(rng));
}

// ── Run one trial at noise level K ───────────────────────────────────────────
function runTrial(K, trialIdx) {
  const rng = makePrng(trialIdx * 997 + K * 31337);

  let tp = 0, fn = 0, fp = 0, tn = 0;

  for (let i = 0; i < data.pwave.length; i++) {
    const sigma   = K * pSigmaRef[i];
    const noisy   = injectNoise(data.pwave[i].data, sigma, rng);
    const det     = simulate(noisy, CANON_RATIO);
    if (det !== null) tp++; else fn++;
  }

  for (let i = 0; i < data.noises.length; i++) {
    const sigma  = K * nSigmaRef[i];
    const noisy  = injectNoise(data.noises[i], sigma, rng);
    const det    = simulate(noisy, CANON_RATIO, NOISE_WARMUP);
    if (det !== null) fp++; else tn++;
  }

  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 1;
  const recall    = (tp + fn) > 0 ? tp / (tp + fn) : 0;
  const f1        = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const accuracy  = (tp + tn + fp + fn) > 0 ? (tp + tn) / (tp + tn + fp + fn) : 0;
  const fpr       = (fp + tn) > 0 ? fp / (fp + tn) : 0;
  return { tp, fn, fp, tn, f1, accuracy, recall, fpr };
}

// ── Run all levels × trials ───────────────────────────────────────────────────
const results = {};

for (const K of K_LEVELS) {
  const trials = [];
  for (let t = 0; t < N_TRIALS; t++) {
    trials.push(runTrial(K, t));
  }
  const mean = key => trials.reduce((a, r) => a + r[key], 0) / N_TRIALS;
  const std  = (key, m) => Math.sqrt(trials.reduce((a, r) => a + (r[key] - m) ** 2, 0) / N_TRIALS);

  const mF1  = mean('f1');      const sF1  = std('f1',  mF1);
  const mAcc = mean('accuracy'); const sAcc = std('accuracy', mAcc);
  const mTPR = mean('recall');   const sTPR = std('recall', mTPR);
  const mFPR = mean('fpr');      const sFPR = std('fpr', mFPR);
  const mFN  = mean('fn');
  const mFP  = mean('fp');

  // SNR degradation factor  1/√(1+K²)
  const snrFactor = 1 / Math.sqrt(1 + K * K);

  results[K] = { mF1, sF1, mAcc, sAcc, mTPR, sTPR, mFPR, sFPR, mFN, mFP, snrFactor };
}

// ── Print results ─────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║  CDT2026 / 03_sensor_degradation.js  —  MEMS Noise Hypothesis               ║');
console.log(`║  Dataset: ${data.pwave.length}P + ${data.noises.length}N  |  RATIO=5.0  |  ${N_TRIALS} MC trials per level          ║`);
console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

console.log('  Assumption: σ_inject = K × σ_pre-onset(per trace)');
console.log('  K=0  = clean STEAD (broadband seismometer)');
console.log('  K=16 = worst-case MEMS spec (MPU6050 ~16× broadband noise floor)\n');

console.log('  K  │ SNR factor │   F1 (mean±std)    │  Accuracy (mean±std) │ TPR (mean±std)  │ FPR (mean±std)  │ ΔF1 from K=0');
console.log('  ───┼────────────┼────────────────────┼──────────────────────┼─────────────────┼─────────────────┼──────────────');

const baseF1  = results[0].mF1;
const baseAcc = results[0].mAcc;

for (const K of K_LEVELS) {
  const r = results[K];
  const deltaF1 = r.mF1 - baseF1;
  const snrStr  = K === 0 ? '   1.000×  ' : ` 1/√${(1 + K * K).toString().padStart(3)} ≈ ${r.snrFactor.toFixed(3)}`;
  console.log(
    ` ${String(K).padStart(2)}  │ ${snrStr} │` +
    ` ${(r.mF1*100).toFixed(3).padStart(7)}% ± ${(r.sF1*100).toFixed(3)}% │` +
    `  ${(r.mAcc*100).toFixed(3).padStart(7)}% ± ${(r.sAcc*100).toFixed(3)}% │` +
    ` ${(r.mTPR*100).toFixed(2).padStart(6)}% ± ${(r.sTPR*100).toFixed(3)}% │` +
    ` ${(r.mFPR*100).toFixed(2).padStart(6)}% ± ${(r.sFPR*100).toFixed(3)}% │` +
    ` ${deltaF1 >= 0 ? ' +' : '  '}${(deltaF1*100).toFixed(3)}%`
  );
}

// ── CFM at K=0, K=4, K=16 (snapshot) ─────────────────────────────────────────
console.log('\n  ── Confusion Matrix snapshots (mean over 30 trials) ──────────────────────');
for (const K of [0, 4, 16]) {
  const r = results[K];
  const tp = Math.round(data.pwave.length * r.mTPR);
  const fn = Math.round(r.mFN);
  const fp = Math.round(r.mFP);
  const tn = data.noises.length - fp;
  console.log(`\n  K=${K}  (SNR×${r.snrFactor.toFixed(3)})`);
  console.log(`    TP=${tp}  FN=${fn}  FP=${fp}  TN=${tn}`);
  console.log(`    F1=${(r.mF1).toFixed(4)}  Acc=${(r.mAcc*100).toFixed(2)}%  FPR=${(r.mFPR*100).toFixed(2)}%`);
}

// ── Alert thresholds ──────────────────────────────────────────────────────────
console.log('\n  ── Performance thresholds ────────────────────────────────────────────────');
const acceptableF1  = 0.90;
const acceptableAcc = 0.90;
for (const K of K_LEVELS) {
  const r = results[K];
  const pass = r.mF1 >= acceptableF1 && r.mAcc >= acceptableAcc;
  const label = K === 0 ? '(STEAD clean)' : K === 16 ? '(MPU6050 spec)' : '';
  console.log(`  K=${String(K).padStart(2)}  F1=${(r.mF1*100).toFixed(2).padStart(6)}%  Acc=${(r.mAcc*100).toFixed(2).padStart(6)}%  ${pass ? '✓ PASS' : '✗ FAIL'} (threshold F1≥90%,Acc≥90%)  ${label}`);
}

console.log('\n  ── Committee-facing summary ──────────────────────────────────────────────');
console.log('  STEAD over-estimates real-world performance because:');
console.log('  1. STEAD uses broadband seismometer (noise floor ~25 µg/√Hz)');
console.log('  2. MPU6050 noise floor ~400 µg/√Hz  →  K≈16 represents hardware reality');
console.log('  3. At K=16: see F1 and Accuracy above vs K=0 baseline');
console.log('  F1 degradation across 5 noise levels quantifies this gap for honest disclosure.\n');
