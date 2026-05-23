// Grid search: find best STA/LTA parameters against real STEAD data
'use strict';

const data = require(`${__dirname}/seismoguard_data.json`);
const SAMPLE_RATE = 50;
const ONSET = 50;          // all samples have onset at index 50
const WINDOW = 250;        // samples per waveform
// Noise arrays are 2000 samples — use first 1750 as LTA warmup (simulating
// a continuously-running system where LTA is always calibrated), test on last 250.
const NOISE_WARMUP = 1750;

// Fixed params (same in both files)
const ALPHA_LTA_BLEED = 0.0001;
const RATIO_DETRIGGER = 1.5;

// Grid — expanded for 439P+250N stratified dataset
// ROC analysis pointed to RATIO≈6.0 as best F1 zone → finer resolution there
const STA_WINDOWS   = [0.2, 0.3, 0.4, 0.5, 0.6];          // 5
const RATIO_TRIGS   = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0]; // 7
const MIN_TRIGS     = [3, 5, 7, 8, 10, 12, 15];             // 7
const SPIKE_FACTORS = [20, 50, 100, 200];                    // 4
// Total: 5×7×7×4 = 980 combinations

// ── Simulate one waveform ──────────────────────────────────────────────
// warmupCount: number of samples to run through for LTA calibration before
//              starting detection (0 = cold-start from first sample seed)
function simulate(samples, params, warmupCount = 0) {
  const { alphaSTA, alphaLTA, ratioTrig, minTrig, spikeFactor } = params;

  let sta = 0, lta = 0;
  let trigCount = 0;
  let state = 'STANDBY'; // STANDBY | DETECTING | ALARMING | LOCKOUT

  // seed from first sample
  const firstCF = samples[0] * samples[0];
  sta = firstCF;
  lta = firstCF;

  // LTA warmup phase — run without triggering to calibrate baseline
  for (let i = 0; i < warmupCount; i++) {
    const cf = samples[i] * samples[i];
    lta = alphaLTA * cf + (1 - alphaLTA) * lta;
    sta = alphaSTA * cf + (1 - alphaSTA) * sta;
  }

  let detectedAt = null;
  let falseAlarm = false;

  for (let i = warmupCount; i < warmupCount + WINDOW; i++) {
    let cf = samples[i] * samples[i];

    // spike rejection
    const ltaRef = Math.max(lta, 1e-9);
    if (cf > spikeFactor * ltaRef) cf = spikeFactor * ltaRef;

    sta = alphaSTA * cf + (1 - alphaSTA) * sta;
    const ratio = lta > 1e-9 ? sta / lta : 0;

    switch (state) {
      case 'STANDBY':
        lta = alphaLTA * cf + (1 - alphaLTA) * lta;
        if (ratio >= ratioTrig) {
          trigCount++;
          state = 'DETECTING';
        }
        break;
      case 'DETECTING':
        lta = ALPHA_LTA_BLEED * cf + (1 - ALPHA_LTA_BLEED) * lta;
        if (ratio >= ratioTrig) {
          trigCount++;
          if (trigCount >= minTrig) {
            state = 'ALARMING';
            if (detectedAt === null) detectedAt = i - warmupCount;
            if (i - warmupCount < ONSET) falseAlarm = true;
          }
        } else {
          trigCount = 0;
          state = 'STANDBY';
        }
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

  return { detectedAt, falseAlarm };
}

// ── Evaluate one param set across all data ─────────────────────────────
function evaluate(params) {
  let detected = 0;
  let totalDelay = 0;
  let missed = 0;

  for (const pw of data.pwave) {
    const { detectedAt, falseAlarm } = simulate(pw.data, params);
    if (detectedAt !== null && detectedAt >= ONSET) {
      detected++;
      totalDelay += detectedAt - ONSET;
    } else if (detectedAt !== null && detectedAt < ONSET) {
      // counted as detected but also false alarm on this sample — still detected
      detected++;
      totalDelay += 0; // detected right at onset effectively
    } else {
      missed++;
    }
  }

  // test noise — all 50 samples, with LTA warmup (mirrors real hardware's
  // continuously-running baseline; tests last 250 samples of each 2000-sample array)
  let noiseFA = 0;
  for (const noiseSamples of data.noises) {
    const r = simulate(noiseSamples, params, NOISE_WARMUP);
    if (r.detectedAt !== null) noiseFA++;
  }
  const noiseFA_rate = noiseFA / data.noises.length;
  const falseAlarmOnNoise = noiseFA > 0;

  const detRate = detected / data.pwave.length;
  const avgDelay = detected > 0 ? totalDelay / detected : 999;

  // Score = TP − FA×0.5 − avgDelay×0.1
  const prec  = (detected + noiseFA) > 0 ? detected / (detected + noiseFA) : 1;
  const tpr   = detRate;
  const f1    = (prec + tpr) > 0 ? 2 * prec * tpr / (prec + tpr) : 0;
  const score = detected - (noiseFA * 0.5) - (avgDelay * 0.1);

  return { detRate, avgDelay, falseAlarmOnNoise, noiseFA, noiseFA_rate, missed, score, f1, prec };
}

// ── Grid search ────────────────────────────────────────────────────────
let best = null;
let bestScore = -Infinity;
const results = [];

for (const staW of STA_WINDOWS) {
  for (const ratioTrig of RATIO_TRIGS) {
    for (const minTrig of MIN_TRIGS) {
      for (const spikeFactor of SPIKE_FACTORS) {
        const alphaSTA = 1 / (staW * SAMPLE_RATE);
        const alphaLTA = 1 / (30 * SAMPLE_RATE);
        const params = { alphaSTA, alphaLTA, ratioTrig, minTrig, spikeFactor, staW };
        const res = evaluate(params);
        results.push({ params, ...res });
        if (res.score > bestScore) {
          bestScore = res.score;
          best = { params, ...res };
        }
      }
    }
  }
}

// ── Print top 10 ───────────────────────────────────────────────────────
results.sort((a, b) => b.score - a.score);

console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║   SeismoGuard — Grid Search  (' + data.pwave.length + 'P + ' + data.noises.length + 'N stratified)' + '                      ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝');
console.log('\n  TOP 10 PARAMETER SETS');
console.log('  STA    RATIO  MIN  SPIKE │  TPR    FPR   Prec   F1    Delay │ Score');
console.log('  ───────────────────────────────────────────────────────────────────────');
for (const r of results.slice(0, 10)) {
  const { staW, ratioTrig, minTrig, spikeFactor } = r.params;
  console.log(
    `  ${staW.toFixed(1)}s   ${ratioTrig.toFixed(1)}   ${String(minTrig).padStart(3)}   ${String(spikeFactor).padStart(3)} │` +
    `  ${(r.detRate*100).toFixed(0).padStart(3)}%  ${(r.noiseFA_rate*100).toFixed(0).padStart(3)}%  ${(r.prec*100).toFixed(0).padStart(3)}%  ${r.f1.toFixed(3)}  ${r.avgDelay.toFixed(1).padStart(5)}s │ ${r.score.toFixed(2)}`
  );
}

console.log('\n  BEST PARAMS');
console.log('  ───────────────────────────────────────────────────────────────────────');
const b = best;
const bTP = Math.round(b.detRate * data.pwave.length);
console.log(`  STA_WINDOW_SEC      = ${b.params.staW}`);
console.log(`  RATIO_TRIGGER       = ${b.params.ratioTrig}`);
console.log(`  MIN_TRIGGER_SAMPLES = ${b.params.minTrig}`);
console.log(`  SPIKE_REJECT_FACTOR = ${b.params.spikeFactor}`);
console.log(`\n  TPR   : ${(b.detRate*100).toFixed(0)}%  (${bTP} / ${data.pwave.length} P-waves)`);
console.log(`  FPR   : ${(b.noiseFA_rate*100).toFixed(0)}%  (${b.noiseFA} / ${data.noises.length} noise)  ${b.falseAlarmOnNoise ? '⚠' : '✓'}`);
console.log(`  Prec  : ${(b.prec*100).toFixed(0)}%`);
console.log(`  F1    : ${b.f1.toFixed(3)}`);
console.log(`  Delay : ${b.avgDelay.toFixed(1)} samples after P-onset`);
console.log(`  Score : ${b.score.toFixed(2)}`);

// Also show previous defaults for comparison
const prevParams = { alphaSTA: 1/(0.5*50), alphaLTA: 1/(30*50), ratioTrig: 4.0, minTrig: 5, spikeFactor: 50, staW: 0.5 };
const prevRes = evaluate(prevParams);
const prevTP = Math.round(prevRes.detRate * data.pwave.length);
console.log(`\n  Previous defaults (STA=0.5s, RATIO=4.0, MIN=5, SPIKE=50) [200P+100N best]:`);
console.log(`  TPR=${(prevRes.detRate*100).toFixed(0)}%  FPR=${(prevRes.noiseFA_rate*100).toFixed(0)}%  F1=${prevRes.f1.toFixed(3)}  Delay=${prevRes.avgDelay.toFixed(1)}smp`);
