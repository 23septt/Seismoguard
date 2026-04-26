/**
 * adaptive_sweep2d.js
 * 2-D grid search: QUIET_BUF_SIZE × PERC_K
 * Goal: find (bufSize, percK) that maximises F1 while keeping FPR ≤ 3%
 *       (matching or beating v2 PERC_K=1.2 operating point).
 *
 * Also sweeps PERC_Q (0.90 / 0.95 / 0.99) as a 3rd dimension.
 */
'use strict';

const data = require('C:/Users/Lenovo/OneDrive/Desktop/Claude_Home/Earthquake/seismoguard_data.json');

// ── Shared constants ──────────────────────────────────────────────────────────
const SAMPLE_RATE     = 50;
const ONSET           = 50;
const WINDOW          = 250;
const NOISE_WARMUP    = 1750;
const ALPHA_LTA_BLEED = 0.0001;
const RATIO_DETRIGGER = 1.5;
const MIN_TRIG        = 3;    // grid-search optimal (439P+250N)
const SPIKE           = 50;   // grid-search optimal
const alphaSTA        = 1 / (0.5 * SAMPLE_RATE);
const alphaLTA        = 1 / (30  * SAMPLE_RATE);
const BASE_RATIO      = 3.0;

function percentile(arr, q) {
  if (arr.length === 0) return 1.0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function simulate(samples, warmupCount, percK, percQ, bufSize, preloadN) {
  let sta = 0, lta = 0, trigCount = 0, state = 'STANDBY';
  const firstCF = samples[0] * samples[0];
  sta = firstCF; lta = firstCF;

  for (let i = 0; i < warmupCount; i++) {
    const cf = samples[i] * samples[i];
    lta = alphaLTA * cf + (1 - alphaLTA) * lta;
    sta = alphaSTA * cf + (1 - alphaSTA) * sta;
  }

  // Preload pass
  const quietBuf = [];
  if (preloadN > 0 && warmupCount === 0) {
    let pSta = firstCF, pLta = firstCF;
    for (let i = 0; i < preloadN && i < samples.length; i++) {
      const cf = samples[i] * samples[i];
      pLta = alphaLTA * cf + (1 - alphaLTA) * pLta;
      pSta = alphaSTA * cf + (1 - alphaSTA) * pSta;
      const r = pLta > 1e-9 ? pSta / pLta : 0;
      if (quietBuf.length >= bufSize) quietBuf.shift();
      quietBuf.push(r);
    }
  }

  let detectedAt = null;
  for (let i = warmupCount; i < warmupCount + WINDOW; i++) {
    let cf = samples[i] * samples[i];
    const ltaRef = Math.max(lta, 1e-9);
    if (cf > SPIKE * ltaRef) cf = SPIKE * ltaRef;

    sta = alphaSTA * cf + (1 - alphaSTA) * sta;
    const ratio = lta > 1e-9 ? sta / lta : 0;

    const perc = percentile(quietBuf, percQ);
    const ratioTrig = Math.max(BASE_RATIO, percK * perc);

    switch (state) {
      case 'STANDBY':
        lta = alphaLTA * cf + (1 - alphaLTA) * lta;
        if (quietBuf.length >= bufSize) quietBuf.shift();
        quietBuf.push(ratio);
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
        if (quietBuf.length >= bufSize) quietBuf.shift();
        quietBuf.push(ratio);
        break;
    }
  }
  return detectedAt;
}

const N_P = data.pwave.length;   // 77
const N_N = data.noises.length;  // 38

// Fixed reference
let fixedTP = 0, fixedFP = 0;
const fixedRatio = 5.0;
for (const pw of data.pwave) {
  let sta=0,lta=0,trig=0,st='STANDBY';
  const fc=pw.data[0]*pw.data[0]; sta=fc; lta=fc;
  let det=null;
  for (let i=0;i<WINDOW;i++){
    let cf=pw.data[i]*pw.data[i];
    const lr=Math.max(lta,1e-9); if(cf>SPIKE*lr) cf=SPIKE*lr;
    sta=alphaSTA*cf+(1-alphaSTA)*sta;
    const r=lta>1e-9?sta/lta:0;
    if(st==='STANDBY'){lta=alphaLTA*cf+(1-alphaLTA)*lta;if(r>=fixedRatio){trig++;st='DETECTING';}}
    else if(st==='DETECTING'){lta=ALPHA_LTA_BLEED*cf+(1-ALPHA_LTA_BLEED)*lta;if(r>=fixedRatio){trig++;if(trig>=MIN_TRIG){st='ALARMING';if(det===null)det=i;}}else{trig=0;st='STANDBY';}}
    else if(st==='ALARMING'){lta=ALPHA_LTA_BLEED*cf+(1-ALPHA_LTA_BLEED)*lta;if(r<RATIO_DETRIGGER)st='LOCKOUT';}
    else{lta=alphaLTA*cf+(1-alphaLTA)*lta;}
  }
  if(det!==null) fixedTP++;
}
for (const ns of data.noises) {
  let sta=0,lta=0,trig=0,st='STANDBY';
  const fc=ns[0]*ns[0]; sta=fc; lta=fc;
  for(let i=0;i<NOISE_WARMUP;i++){const cf=ns[i]*ns[i];lta=alphaLTA*cf+(1-alphaLTA)*lta;sta=alphaSTA*cf+(1-alphaSTA)*sta;}
  let det=null;
  for(let i=NOISE_WARMUP;i<NOISE_WARMUP+WINDOW;i++){
    let cf=ns[i]*ns[i];
    const lr=Math.max(lta,1e-9); if(cf>SPIKE*lr) cf=SPIKE*lr;
    sta=alphaSTA*cf+(1-alphaSTA)*sta;
    const r=lta>1e-9?sta/lta:0;
    if(st==='STANDBY'){lta=alphaLTA*cf+(1-alphaLTA)*lta;if(r>=fixedRatio){trig++;st='DETECTING';}}
    else if(st==='DETECTING'){lta=ALPHA_LTA_BLEED*cf+(1-ALPHA_LTA_BLEED)*lta;if(r>=fixedRatio){trig++;if(trig>=MIN_TRIG){st='ALARMING';if(det===null)det=i;}}else{trig=0;st='STANDBY';}}
    else if(st==='ALARMING'){lta=ALPHA_LTA_BLEED*cf+(1-ALPHA_LTA_BLEED)*lta;if(r<RATIO_DETRIGGER)st='LOCKOUT';}
    else{lta=alphaLTA*cf+(1-alphaLTA)*lta;}
  }
  if(det!==null) fixedFP++;
}
const fixedTPR = fixedTP/N_P, fixedFPR = fixedFP/N_N;
const fixedPrec = fixedTP/(fixedTP+fixedFP);
const fixedF1 = 2*fixedPrec*fixedTPR/(fixedPrec+fixedTPR);

console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║     SeismoGuard — Adaptive Threshold 2D Grid Search              ║');
console.log('║     QUIET_BUF_SIZE × PERC_K × PERC_Q                            ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
console.log(`\nFixed reference: TP=${fixedTP}  FP=${fixedFP}  TPR=${(fixedTPR*100).toFixed(0)}%  FPR=${(fixedFPR*100).toFixed(0)}%  F1=${fixedF1.toFixed(3)}\n`);

const bufSizes = [25, 50, 75, 100, 150, 200];
const percQs   = [0.90, 0.95, 0.99];
const kRange   = [];
for (let k = 10; k <= 25; k++) kRange.push(k / 10);

const allResults = [];

for (const bufSize of bufSizes) {
  for (const percQ of percQs) {
    for (const percK of kRange) {
      let tp = 0, fp = 0;
      for (const pw of data.pwave) {
        if (simulate(pw.data, 0, percK, percQ, bufSize, ONSET) !== null) tp++;
      }
      for (const ns of data.noises) {
        if (simulate(ns, NOISE_WARMUP, percK, percQ, bufSize, 0) !== null) fp++;
      }
      const tpr  = tp / N_P;
      const fpr  = fp / N_N;
      const prec = (tp + fp) > 0 ? tp / (tp + fp) : 1;
      const f1   = (prec + tpr) > 0 ? 2 * prec * tpr / (prec + tpr) : 0;
      allResults.push({ bufSize, percQ, percK, tp, fp, tpr, fpr, prec, f1 });
    }
  }
}

// ── Top 15 by F1 (FPR ≤ fixedFPR) ───────────────────────────────────────────
const constrained = allResults.filter(r => r.fpr <= fixedFPR).sort((a, b) => b.f1 - a.f1);
console.log('── Top 15 operating points  (FPR ≤ Fixed FPR = ' + (fixedFPR*100).toFixed(0) + '%) ──────────────────');
console.log('BufSz  PQ    PK  │  TP   FP  │  TPR    FPR   Prec    F1   vs Fixed');
console.log('────────────────┼───────────┼─────────────────────────────────────');
constrained.slice(0, 15).forEach(r => {
  const flag = r.f1 >= fixedF1 ? ' ★ ≥ Fixed!' : (r.f1 >= fixedF1 - 0.05 ? ' ◀ close' : '');
  console.log(
    `  ${String(r.bufSize).padStart(3)}  ${r.percQ.toFixed(2)}  ${r.percK.toFixed(1).padStart(4)}  │` +
    ` ${String(r.tp).padStart(3)} TP  ${String(r.fp).padStart(2)} FP │` +
    ` ${(r.tpr*100).toFixed(0).padStart(4)}%` +
    `  ${(r.fpr*100).toFixed(0).padStart(4)}%` +
    `  ${(r.prec*100).toFixed(0).padStart(4)}%` +
    `  ${r.f1.toFixed(3)}` +
    flag
  );
});

// ── Zero-FP top 10 ────────────────────────────────────────────────────────────
const zeroFP = allResults.filter(r => r.fp === 0).sort((a, b) => b.f1 - a.f1);
console.log('\n── Top 10 zero-FP points (FPR = 0%) ────────────────────────────────');
console.log('BufSz  PQ    PK  │  TP   FP  │  TPR    FPR   Prec    F1');
console.log('────────────────┼───────────┼────────────────────────────');
zeroFP.slice(0, 10).forEach(r => {
  console.log(
    `  ${String(r.bufSize).padStart(3)}  ${r.percQ.toFixed(2)}  ${r.percK.toFixed(1).padStart(4)}  │` +
    ` ${String(r.tp).padStart(3)} TP  ${String(r.fp).padStart(2)} FP │` +
    ` ${(r.tpr*100).toFixed(0).padStart(4)}%` +
    `  ${(r.fpr*100).toFixed(0).padStart(4)}%` +
    `  ${(r.prec*100).toFixed(0).padStart(4)}%` +
    `  ${r.f1.toFixed(3)}`
  );
});

// ── Absolute best F1 (no FPR constraint) ─────────────────────────────────────
const best = allResults.reduce((a, b) => b.f1 > a.f1 ? b : a);
const bestConstrained = constrained[0];
console.log(`\n── Summary ──────────────────────────────────────────────────────────`);
console.log(`Fixed 5.0:               TP=${fixedTP}  FP=${fixedFP}  TPR=${(fixedTPR*100).toFixed(0)}%  FPR=${(fixedFPR*100).toFixed(0)}%  F1=${fixedF1.toFixed(3)}`);
console.log(`Best adaptive (any FPR): bufSize=${best.bufSize} PQ=${best.percQ} PK=${best.percK} → TPR=${(best.tpr*100).toFixed(0)}%  FPR=${(best.fpr*100).toFixed(0)}%  F1=${best.f1.toFixed(3)}`);
if (bestConstrained) {
  console.log(`Best adaptive (FPR≤${(fixedFPR*100).toFixed(0)}%):  bufSize=${bestConstrained.bufSize} PQ=${bestConstrained.percQ} PK=${bestConstrained.percK} → TPR=${(bestConstrained.tpr*100).toFixed(0)}%  FPR=${(bestConstrained.fpr*100).toFixed(0)}%  F1=${bestConstrained.f1.toFixed(3)}`);
}
console.log(`Best zero-FP adaptive:   bufSize=${zeroFP[0].bufSize} PQ=${zeroFP[0].percQ} PK=${zeroFP[0].percK} → TPR=${(zeroFP[0].tpr*100).toFixed(0)}%  FPR=0%  F1=${zeroFP[0].f1.toFixed(3)}\n`);
