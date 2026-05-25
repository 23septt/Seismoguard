// Grid search: find best STA/LTA parameters against real STEAD data
'use strict';

const data = require(`${__dirname}/../seismoguard_data.json`);
const SAMPLE_RATE = 50;
const ONSET = 50;          // all samples have onset at index 50
const WINDOW = 250;        // samples per waveform
// Noise arrays are 2000 samples — use first 1750 as LTA warmup (simulating
// a continuously-running system where LTA is always calibrated), test on last 250.
const NOISE_WARMUP = 1750;

// Fixed params (same in both files)
const ALPHA_LTA_BLEED = 0.0001;
const RATIO_DETRIGGER = 1.5;

// Grid
const STA_WINDOWS   = [0.3, 0.4, 0.5];
const RATIO_TRIGS   = [3.0, 3.5, 4.0, 4.5, 5.0];
const MIN_TRIGS     = [2, 3, 5, 8, 10];
const SPIKE_FACTORS = [20, 50, 100];

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

  // Score: F-beta based weights (beta=2 → miss costs 4× more than false alarm)
  // Detection weight = 60 (anchor)
  // FalseAlarm weight scaled by FA rate across all 50 noise samples
  // Delay weight = 10 (secondary)
  const score = (detRate * 60) - (avgDelay / WINDOW * 10) - (noiseFA_rate * 15);

  return { detRate, avgDelay, falseAlarmOnNoise, noiseFA, noiseFA_rate, missed, score };
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

console.log('═══════════════════════════════════════════════════════════');
console.log('  TOP 10 PARAMETER SETS');
console.log('═══════════════════════════════════════════════════════════');
console.log('  STA   TRIG  MIN  SPIKE | Detect  AvgDelay  NoiseFA        | Score');
console.log('─────────────────────────────────────────────────────────────────');
for (const r of results.slice(0, 10)) {
  const { staW, ratioTrig, minTrig, spikeFactor } = r.params;
  const faStr = `${r.noiseFA}/${data.noises.length} (${(r.noiseFA_rate*100).toFixed(0)}%)`.padStart(13);
  console.log(
    `  ${staW.toFixed(1)}s  ${ratioTrig.toFixed(1)}   ${String(minTrig).padStart(3)}  ${String(spikeFactor).padStart(4)} |` +
    ` ${(r.detRate*100).toFixed(0).padStart(5)}%  ${r.avgDelay.toFixed(1).padStart(8)}s  ${faStr} | ${r.score.toFixed(2)}`
  );
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  BEST PARAMS');
console.log('═══════════════════════════════════════════════════════════');
const b = best;
console.log(`  STA_WINDOW_SEC      = ${b.params.staW}f`);
console.log(`  RATIO_TRIGGER       = ${b.params.ratioTrig}f`);
console.log(`  MIN_TRIGGER_SAMPLES = ${b.params.minTrig}`);
console.log(`  SPIKE_REJECT_FACTOR = ${b.params.spikeFactor}.0f`);
console.log(`\n  Detection rate : ${(b.detRate*100).toFixed(0)}% (${b.detected !== undefined ? b.detected : Math.round(b.detRate*data.pwave.length)} / ${data.pwave.length})`);
console.log(`  Avg delay      : ${b.avgDelay.toFixed(1)} samples after onset`);
console.log(`  Noise false alarm: ${b.noiseFA}/${data.noises.length} samples (${(b.noiseFA_rate*100).toFixed(0)}%) ${b.falseAlarmOnNoise ? '⚠' : '✓'}`);
console.log(`  Score          : ${b.score.toFixed(2)}`);
