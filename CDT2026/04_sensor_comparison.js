'use strict';
/**
 * CDT2026 / 04_sensor_comparison.js
 *
 * Sensor noise floor comparison: STEAD baseline vs LSM6DSOX vs MPU6050
 *
 * Noise density (datasheet typical, normal mode):
 *   STEAD broadband seismometer   ~  25 µg/√Hz  (reference)
 *   ST LSM6DSOX (accelerometer)   ~  70 µg/√Hz  → K = 70/25 ≈ 2.80
 *   InvenSense MPU6050             ~ 400 µg/√Hz  → K = 400/25 = 16.00
 *
 * K = σ_inject / σ_ref   where σ_ref = per-trace pre-onset std (STEAD noise floor)
 * SNR degradation = 1/√(1 + K²)
 *
 * 30 MC trials per sensor. Canonical params: RATIO=5.0  STA=0.5s  MIN=3  SPIKE=50.
 *
 * References:
 *   ST LSM6DSOX Datasheet Rev.8 §4.1  (noise density 70 µg/√Hz)
 *   InvenSense MPU-6050 PS Rev.3.4 §6.1 (noise density 400 µg/√Hz)
 */

const data = require('./dataset_clean.json');

const SAMPLE_RATE     = 50;
const ONSET           = 50;
const WINDOW          = 250;
const NOISE_WARMUP    = 1750;
const ALPHA_LTA_BLEED = 0.0001;
const RATIO_DETRIGGER = 1.5;
const CANON_RATIO     = 5.0;
const MIN_TRIG        = 3;
const SPIKE           = 50;
const alphaSTA        = 1 / (0.5 * SAMPLE_RATE);
const alphaLTA        = 1 / (30  * SAMPLE_RATE);

const N_TRIALS = 30;

// ── Sensor profiles ───────────────────────────────────────────────────────────
const SENSORS = [
  {
    name:      'STEAD broadband (baseline)',
    short:     'STEAD',
    noiseUg:   25,
    K:         0,
    note:      'Reference — theoretical upper bound (not achievable on MEMS)'
  },
  {
    name:      'ST LSM6DSOX (Normal mode)',
    short:     'LSM6DSOX',
    noiseUg:   70,
    K:         70 / 25,      // 2.80
    note:      'Datasheet Rev.8 §4.1  70 µg/√Hz typical'
  },
  {
    name:      'InvenSense MPU6050 (current)',
    short:     'MPU6050',
    noiseUg:   400,
    K:         400 / 25,     // 16.00
    note:      'Datasheet Rev.3.4 §6.1  400 µg/√Hz'
  },
];

// ── PRNG + Box-Muller ─────────────────────────────────────────────────────────
function makePrng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randNorm(rng) {
  const u1 = Math.max(makePrng(rng() * 1e9 | 0)(), 1e-10);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ── Simulate ──────────────────────────────────────────────────────────────────
function simulate(samples, warmupCount = 0) {
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
        if (ratio >= CANON_RATIO) { trigCount++; state = 'DETECTING'; }
        break;
      case 'DETECTING':
        lta = ALPHA_LTA_BLEED * cf + (1 - ALPHA_LTA_BLEED) * lta;
        if (ratio >= CANON_RATIO) {
          trigCount++;
          if (trigCount >= MIN_TRIG) { state = 'ALARMING'; if (!detectedAt) detectedAt = i - warmupCount; }
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

// ── Pre-compute per-trace σ_ref ───────────────────────────────────────────────
function preOnsetStd(arr, start, len) {
  const seg = arr.slice(start, start + len);
  const mean = seg.reduce((a, b) => a + b, 0) / seg.length;
  return Math.sqrt(seg.reduce((a, v) => a + (v - mean) ** 2, 0) / seg.length);
}

const pSigRef = data.pwave.map(p => preOnsetStd(p.data, 0, ONSET));
const nSigRef = data.noises.map(n => preOnsetStd(n, 0, 200));

// ── Inject noise ──────────────────────────────────────────────────────────────
function inject(original, sigma, rng) {
  if (sigma === 0) return original;
  return original.map(v => v + sigma * randNorm(rng));
}

// ── Run one trial ─────────────────────────────────────────────────────────────
function runTrial(K, trialIdx) {
  const rng = makePrng(trialIdx * 1009 + Math.round(K * 100) * 7919);
  let tp = 0, fn = 0, fp = 0, tn = 0, delays = [];

  for (let i = 0; i < data.pwave.length; i++) {
    const noisy = inject(data.pwave[i].data, K * pSigRef[i], rng);
    const det   = simulate(noisy);
    if (det !== null) { tp++; delays.push(Math.max(0, det - ONSET)); }
    else fn++;
  }
  for (let i = 0; i < data.noises.length; i++) {
    const noisy = inject(data.noises[i], K * nSigRef[i], rng);
    if (simulate(noisy, NOISE_WARMUP) !== null) fp++; else tn++;
  }

  const prec = (tp + fp) > 0 ? tp / (tp + fp) : 1;
  const rec  = (tp + fn) > 0 ? tp / (tp + fn) : 0;
  const f1   = (prec + rec) > 0 ? 2 * prec * rec / (prec + rec) : 0;
  const acc  = (tp + tn) / (tp + tn + fp + fn);
  const fpr  = (fp + tn) > 0 ? fp / (fp + tn) : 0;
  const avgDelay = delays.length > 0 ? delays.reduce((a,b)=>a+b,0)/delays.length : 999;
  return { tp, fn, fp, tn, f1, acc, rec, fpr, avgDelay };
}

// ── Run all sensors ───────────────────────────────────────────────────────────
const sensorResults = SENSORS.map(sensor => {
  const trials = Array.from({ length: N_TRIALS }, (_, t) => runTrial(sensor.K, t));
  const mean = key => trials.reduce((a, r) => a + r[key], 0) / N_TRIALS;
  const std  = (key, m) => Math.sqrt(trials.reduce((a, r) => a + (r[key] - m) ** 2, 0) / N_TRIALS);

  const mF1  = mean('f1');      const sF1  = std('f1', mF1);
  const mAcc = mean('acc');     const sAcc = std('acc', mAcc);
  const mRec = mean('rec');     const sRec = std('rec', mRec);
  const mFPR = mean('fpr');     const sFPR = std('fpr', mFPR);
  const mDelay = mean('avgDelay');
  const mTP  = mean('tp');
  const mFN  = mean('fn');
  const mFP  = mean('fp');
  const snrFactor = sensor.K === 0 ? 1 : 1 / Math.sqrt(1 + sensor.K ** 2);

  return { sensor, mF1, sF1, mAcc, sAcc, mRec, sRec, mFPR, sFPR, mDelay, mTP, mFN, mFP, snrFactor };
});

// ── Print ─────────────────────────────────────────────────────────────────────
const NP = data.pwave.length, NN = data.noises.length;

console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log('║  CDT2026 / 04_sensor_comparison.js  —  Sensor Performance Comparison   ║');
console.log(`║  Dataset: ${NP}P + ${NN}N  |  RATIO=5.0  |  ${N_TRIALS} MC trials per sensor          ║`);
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

console.log('  Sensor noise model:  σ_inject = K × σ_pre-onset(per trace)');
console.log('  SNR factor         = 1 / √(1 + K²)\n');

// Sensor spec table
console.log('  ── Sensor Specifications ─────────────────────────────────────────────');
console.log('  Sensor              Noise (µg/√Hz)   K      SNR factor   Source');
console.log('  ───────────────────────────────────────────────────────────────────────');
for (const r of sensorResults) {
  const s = r.sensor;
  console.log(
    `  ${s.short.padEnd(20)}${String(s.noiseUg).padStart(6)} µg/√Hz` +
    `   ${s.K.toFixed(2).padStart(5)}   ${r.snrFactor.toFixed(4).padStart(8)}×   ${s.note}`
  );
}

// Performance comparison table
console.log('\n  ── Performance Results (mean ± std, 30 MC trials) ───────────────────');
console.log('  Sensor               F1              Accuracy        TPR             FPR             AvgDelay');
console.log('  ──────────────────────────────────────────────────────────────────────────────────────────────');
for (const r of sensorResults) {
  console.log(
    `  ${r.sensor.short.padEnd(20)}` +
    ` ${(r.mF1*100).toFixed(3)}%±${(r.sF1*100).toFixed(3)}%` +
    `  ${(r.mAcc*100).toFixed(3)}%±${(r.sAcc*100).toFixed(3)}%` +
    `  ${(r.mRec*100).toFixed(2)}%±${(r.sRec*100).toFixed(3)}%` +
    `  ${(r.mFPR*100).toFixed(2)}%±${(r.sFPR*100).toFixed(3)}%` +
    `  ${r.mDelay.toFixed(1)} smp`
  );
}

// Confusion matrix per sensor
console.log('\n  ── Confusion Matrix (mean over 30 trials) ────────────────────────────');
for (const r of sensorResults) {
  const tp = Math.round(r.mTP), fn = Math.round(r.mFN);
  const fp = Math.round(r.mFP), tn = NN - fp;
  console.log(`\n  ${r.sensor.name}`);
  console.log(`    K=${r.sensor.K.toFixed(2)}  noise=${r.sensor.noiseUg} µg/√Hz  SNR×${r.snrFactor.toFixed(3)}`);
  console.log(`    ┌──────────────────────────────────┐`);
  console.log(`    │ Actual vs Predicted               │`);
  console.log(`    │   TP=${String(tp).padStart(4)}   FN=${String(fn).padStart(3)}  (P-wave n=${NP}) │`);
  console.log(`    │   FP=${String(fp).padStart(4)}   TN=${String(tn).padStart(3)}  (Noise  n=${NN}) │`);
  console.log(`    └──────────────────────────────────┘`);
  console.log(`    F1=${(r.mF1).toFixed(4)}  Acc=${(r.mAcc*100).toFixed(2)}%  FPR=${(r.mFPR*100).toFixed(2)}%  AvgDelay=${r.mDelay.toFixed(1)} smp`);
}

// Per-Mw-bin breakdown for each sensor
const mwBins = [
  ['sub  Mw 3–4.5', 3.0, 4.5],
  ['T1   Mw 4.5–5 ', 4.5, 5.0],
  ['T2   Mw 5–6.5 ', 5.0, 6.5],
  ['crit Mw 6.5+  ', 6.5, 99],
];

console.log('\n  ── Per-Mw-bin Recall by Sensor ───────────────────────────────────────');
const header = '  Bin               N  │' + SENSORS.map(s => `  ${s.short.padEnd(12)}`).join('│');
console.log(header);
console.log('  ─'.repeat(header.length / 2));

for (const [label, lo, hi] of mwBins) {
  const subset = data.pwave.filter(p => p.magnitude >= lo && p.magnitude < hi);
  const subSigRef = subset.map(p => preOnsetStd(p.data, 0, ONSET));
  let row = `  ${label}${String(subset.length).padStart(3)}  │`;

  for (const sensor of SENSORS) {
    // Average recall over N_TRIALS
    let totalTPR = 0;
    for (let t = 0; t < N_TRIALS; t++) {
      const rng = makePrng(t * 1009 + Math.round(sensor.K * 100) * 7919 + lo * 100);
      let tp = 0;
      for (let i = 0; i < subset.length; i++) {
        const noisy = inject(subset[i].data, sensor.K * subSigRef[i], rng);
        if (simulate(noisy) !== null) tp++;
      }
      totalTPR += tp / subset.length;
    }
    const mTPR = totalTPR / N_TRIALS;
    row += `  ${(mTPR * 100).toFixed(1).padStart(5)}%      │`;
  }
  console.log(row);
}

// Delta between sensors
const [rSTEAD, rLSM, rMPU] = sensorResults;
console.log('\n  ── Gap Analysis ──────────────────────────────────────────────────────');
console.log(`  LSM6DSOX vs MPU6050  :  ΔF1 = +${((rLSM.mF1 - rMPU.mF1)*100).toFixed(3)}%   ΔAcc = +${((rLSM.mAcc - rMPU.mAcc)*100).toFixed(2)}%`);
console.log(`  LSM6DSOX vs STEAD    :  ΔF1 = ${((rLSM.mF1 - rSTEAD.mF1)*100).toFixed(3)}%   ΔAcc = ${((rLSM.mAcc - rSTEAD.mAcc)*100).toFixed(2)}%`);
console.log(`  MPU6050  vs STEAD    :  ΔF1 = ${((rMPU.mF1 - rSTEAD.mF1)*100).toFixed(3)}%   ΔAcc = ${((rMPU.mAcc - rSTEAD.mAcc)*100).toFixed(2)}%`);
console.log('\n  Pass threshold: F1 ≥ 90%  Acc ≥ 90%');
for (const r of sensorResults) {
  const pass = r.mF1 >= 0.90 && r.mAcc >= 0.90;
  console.log(`  ${r.sensor.short.padEnd(12)}  ${pass ? '✓ PASS' : '✗ FAIL'}  (F1=${(r.mF1*100).toFixed(2)}%  Acc=${(r.mAcc*100).toFixed(2)}%)`);
}
console.log('');
