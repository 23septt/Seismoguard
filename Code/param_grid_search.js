'use strict';
const data = require('./seismoguard_data.json');
const SAMPLE_RATE = 50, ONSET = 50, WINDOW = 250, NOISE_WARMUP = 1750;
const ALPHA_LTA_BLEED = 0.0001, RATIO_DETRIGGER = 1.5;
const STA_WINDOWS   = [0.2, 0.3, 0.4, 0.5, 0.6];
const RATIO_TRIGS   = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0];
const MIN_TRIGS     = [3, 5, 7, 8, 10, 12, 15];
const SPIKE_FACTORS = [20, 50, 100, 200];

function simulate(samples, params, warmupCount = 0) {
  const { alphaSTA, alphaLTA, ratioTrig, minTrig, spikeFactor } = params;
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
    if (cf > spikeFactor * ltaRef) cf = spikeFactor * ltaRef;
    sta = alphaSTA * cf + (1 - alphaSTA) * sta;
    const ratio = lta > 1e-9 ? sta / lta : 0;
    switch (state) {
      case 'STANDBY':
        lta = alphaLTA * cf + (1 - alphaLTA) * lta;
        if (ratio >= ratioTrig) { trigCount++; state = 'DETECTING'; } break;
      case 'DETECTING':
        lta = ALPHA_LTA_BLEED * cf + (1 - ALPHA_LTA_BLEED) * lta;
        if (ratio >= ratioTrig) {
          trigCount++;
          if (trigCount >= minTrig) { state = 'ALARMING'; if (detectedAt === null) detectedAt = i - warmupCount; }
        } else { trigCount = 0; state = 'STANDBY'; } break;
      case 'ALARMING':
        lta = ALPHA_LTA_BLEED * cf + (1 - ALPHA_LTA_BLEED) * lta;
        if (ratio < RATIO_DETRIGGER) state = 'LOCKOUT'; break;
      case 'LOCKOUT':
        lta = alphaLTA * cf + (1 - alphaLTA) * lta; break;
    }
  }
  return { detectedAt };
}

function evaluate(params) {
  let detected = 0, totalDelay = 0;
  for (const pw of data.pwave) {
    const { detectedAt } = simulate(pw.data, params);
    if (detectedAt !== null) { detected++; totalDelay += Math.max(0, detectedAt - ONSET); }
  }
  let noiseFA = 0;
  for (const ns of data.noises) { if (simulate(ns, params, NOISE_WARMUP).detectedAt !== null) noiseFA++; }
  const avgDelay = detected > 0 ? totalDelay / detected : 999;
  const score = detected - (noiseFA * 0.5) - (avgDelay * 0.1);
  const prec = (detected + noiseFA) > 0 ? detected / (detected + noiseFA) : 1;
  const tpr = detected / data.pwave.length;
  const f1 = (prec + tpr) > 0 ? 2 * prec * tpr / (prec + tpr) : 0;
  return { detected, noiseFA, avgDelay, score, f1, tpr, prec };
}

const results = [];
for (const staW of STA_WINDOWS)
  for (const ratioTrig of RATIO_TRIGS)
    for (const minTrig of MIN_TRIGS)
      for (const spikeFactor of SPIKE_FACTORS) {
        const alphaSTA = 1 / (staW * SAMPLE_RATE);
        const alphaLTA = 1 / (30 * SAMPLE_RATE);
        const params = { alphaSTA, alphaLTA, ratioTrig, minTrig, spikeFactor, staW };
        results.push({ params, ...evaluate(params) });
      }

results.sort((a, b) => b.score - a.score);
console.log('rank,STA,RATIO,MIN,SPIKE,TPR%,detected,noiseFA,delay_smp,F1,score');
for (const [i, r] of results.slice(0, 10).entries()) {
  const { staW, ratioTrig, minTrig, spikeFactor } = r.params;
  console.log(`${i+1},${staW},${ratioTrig},${minTrig},${spikeFactor},${(r.tpr*100).toFixed(1)},${r.detected},${r.noiseFA},${r.avgDelay.toFixed(2)},${r.f1.toFixed(3)},${r.score.toFixed(2)}`);
}
