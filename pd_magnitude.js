/**
 * pd_magnitude.js
 * Peak-displacement (Pd) magnitude estimation for SeismoGuard.
 *
 * Method: Wu & Zhao (2006) early-warning regression
 *   log10(PGA_cm_s2) = a·log10(Pd_cm) + b   (at epicentral distance R km)
 *   → simplified on-device form uses only first 3 s of P-wave:
 *      log10(M) ≈ 1.23·log10(Pd) + 5.39  (Wu & Kanamori 2005, global)
 *
 * Pipeline per waveform (starting from P-onset):
 *   1. Extract 3-second window (150 samples @ 50 Hz) after P-arrival
 *   2. Detrend: subtract mean of window
 *   3. Integrate once (trapezoidal, dt=1/fs) → velocity  [raw units·s]
 *   4. Detrend again (remove linear drift in velocity)
 *   5. Integrate again → displacement  [raw units·s²]
 *   6. Pd = max absolute displacement in window
 *   7. Scale: MPU6050 default ±2g range → 1 LSB = (2×9.81×2)/32768 m/s²
 *             convert to cm/s² then integrate to cm
 *   8. Apply regression → Mw estimate
 *
 * This script runs on all 77 STEAD P-wave samples and reports:
 *   - Distribution of Pd values
 *   - Estimated Mw for each waveform
 *   - Note: STEAD accel data is in counts (not calibrated cm/s²); results
 *     are relative/illustrative. Real deployment needs sensor calibration.
 */
'use strict';

const data = require('C:/Users/Lenovo/OneDrive/Desktop/Claude_Home/Earthquake/seismoguard_data.json');

// ── Constants ────────────────────────────────────────────────────────────────
const SAMPLE_RATE  = 50;
const DT           = 1 / SAMPLE_RATE;          // 0.02 s
const ONSET        = 50;                         // P-arrival sample index
const PD_WINDOW    = 3 * SAMPLE_RATE;           // 150 samples = 3 s
const TOTAL_WINDOW = 250;

// MPU6050 ±2g scale factor → m/s² per count
// Range = ±2g, ADC = 16-bit signed → sensitivity = 16384 counts/g
// 1 count = 9.81/16384 m/s² ≈ 5.986×10⁻⁴ m/s²
const COUNTS_PER_G  = 16384;
const G_MS2         = 9.80665;                  // m/s²
const SCALE_MS2     = G_MS2 / COUNTS_PER_G;     // m/s² per count
const SCALE_CMS2    = SCALE_MS2 * 100;          // cm/s² per count

// Wu & Kanamori (2005) regression: log10(M) = a·log10(Pd_cm) + b
// Pd in cm, Mw output. Coefficients from their Table 1 (global, all distances).
const WK_A = 1.0;
const WK_B = 5.39;

// ── Helper: remove mean from array ───────────────────────────────────────────
function detrend(arr) {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.map(v => v - mean);
}

// ── Helper: remove linear trend (least-squares line) ─────────────────────────
function detrendLinear(arr) {
  const n = arr.length;
  const x = Array.from({length: n}, (_, i) => i);
  const sumX  = x.reduce((s,v)=>s+v,0);
  const sumY  = arr.reduce((s,v)=>s+v,0);
  const sumXY = x.reduce((s,v,i)=>s+v*arr[i],0);
  const sumX2 = x.reduce((s,v)=>s+v*v,0);
  const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
  const inter = (sumY - slope*sumX) / n;
  return arr.map((v, i) => v - (slope*i + inter));
}

// ── Helper: trapezoidal integration ──────────────────────────────────────────
function integrate(arr, dt) {
  const out = new Array(arr.length).fill(0);
  for (let i = 1; i < arr.length; i++) {
    out[i] = out[i-1] + 0.5 * (arr[i-1] + arr[i]) * dt;
  }
  return out;
}

// ── Process one waveform ──────────────────────────────────────────────────────
function computePd(raw) {
  // Step 1: extract 3s window after P-onset (samples ONSET to ONSET+PD_WINDOW)
  const end = Math.min(ONSET + PD_WINDOW, raw.length);
  const segment = raw.slice(ONSET, end);

  if (segment.length < 10) return null;   // too short

  // Step 2: detrend (remove DC offset / mean)
  const accel_counts = detrend(segment);

  // Convert to physical units (cm/s²)
  const accel_cms2 = accel_counts.map(v => v * SCALE_CMS2);

  // Step 3: integrate → velocity (cm/s)
  const vel = integrate(accel_cms2, DT);

  // Step 4: remove linear drift from velocity
  const vel_dt = detrendLinear(vel);

  // Step 5: integrate again → displacement (cm)
  const disp = integrate(vel_dt, DT);

  // Step 6: Pd = peak absolute displacement
  const Pd_cm = Math.max(...disp.map(Math.abs));

  return Pd_cm;
}

// ── Run on all 77 P-wave waveforms ───────────────────────────────────────────
const results = [];

for (let i = 0; i < data.pwave.length; i++) {
  const raw  = data.pwave[i].data;
  const Pd   = computePd(raw);
  if (Pd === null || Pd <= 0) continue;

  const logPd = Math.log10(Pd);
  const Mw    = WK_A * logPd + WK_B;

  results.push({ i, Pd, logPd, Mw });
}

// ── Statistics ───────────────────────────────────────────────────────────────
const Pds  = results.map(r => r.Pd);
const Mws  = results.map(r => r.Mw);

function stat(arr) {
  const n    = arr.length;
  const mean = arr.reduce((s,v)=>s+v,0) / n;
  const sorted = arr.slice().sort((a,b)=>a-b);
  const med  = sorted[Math.floor(n/2)];
  const min  = sorted[0];
  const max  = sorted[n-1];
  const std  = Math.sqrt(arr.reduce((s,v)=>s+(v-mean)**2,0)/(n-1));
  return { n, mean, med, min, max, std };
}

const sPd = stat(Pds);
const sMw = stat(Mws);

// ── Output ───────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║       SeismoGuard — Pd Magnitude Estimation                 ║');
console.log('║       Wu & Kanamori (2005): log10(M) = 1.0·log10(Pd)+5.39  ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('\nNote: STEAD data is in raw counts. MPU6050 ±2g scale applied.');
console.log('      Mw estimates are illustrative; real use requires calibrated sensor.\n');

console.log('MPU6050 scale: 1 count = ' + SCALE_CMS2.toExponential(3) + ' cm/s²');
console.log('P-wave window: samples ' + ONSET + '–' + (ONSET+PD_WINDOW) + ' (first 3 s after onset)\n');

console.log('── Pd (peak displacement) statistics ─────────────────────────');
console.log(`  N       : ${sPd.n}`);
console.log(`  Min     : ${sPd.min.toExponential(3)} cm`);
console.log(`  Max     : ${sPd.max.toExponential(3)} cm`);
console.log(`  Mean    : ${sPd.mean.toExponential(3)} cm`);
console.log(`  Median  : ${sPd.med.toExponential(3)} cm`);
console.log(`  Std Dev : ${sPd.std.toExponential(3)} cm`);

console.log('\n── Estimated Mw distribution ─────────────────────────────────');
console.log(`  Min  Mw : ${sMw.min.toFixed(2)}`);
console.log(`  Max  Mw : ${sMw.max.toFixed(2)}`);
console.log(`  Mean Mw : ${sMw.mean.toFixed(2)}`);
console.log(`  Median  : ${sMw.med.toFixed(2)}`);
console.log(`  Std Dev : ${sMw.std.toFixed(2)}`);

// Mw histogram (0.5-bin)
const bins = {};
for (const r of results) {
  const b = (Math.floor(r.Mw / 0.5) * 0.5).toFixed(1);
  bins[b] = (bins[b] || 0) + 1;
}
console.log('\n── Mw histogram (0.5-bin) ────────────────────────────────────');
for (const b of Object.keys(bins).sort((a,b)=>+a-+b)) {
  const bar = '█'.repeat(bins[b]);
  console.log(`  Mw ${b.padStart(5)}: ${bar.padEnd(20)} ${bins[b]}`);
}

// Top 10 largest Pd
console.log('\n── Top 10 by Pd ──────────────────────────────────────────────');
const top10 = results.slice().sort((a,b)=>b.Pd-a.Pd).slice(0,10);
console.log('  idx   Pd (cm)          log10(Pd)   Est. Mw');
console.log('  ────  ───────────────  ─────────   ───────');
for (const r of top10) {
  console.log(`  ${String(r.i).padStart(3)}   ${r.Pd.toExponential(4).padEnd(15)}  ${r.logPd.toFixed(3).padStart(8)}   ${r.Mw.toFixed(2)}`);
}

console.log('\n── Deployment algorithm (on-device, integer arithmetic) ──────');
console.log('  1. Detect P-wave with STA/LTA → note P-onset sample index');
console.log('  2. Buffer 150 samples (3s @ 50Hz) after onset in int16_t[150]');
console.log('  3. Compute mean of buffer → subtract (detrend)');
console.log('  4. Integrate with Euler (velocity[i] += accel[i]*DT_MS/1000)');
console.log('  5. Compute mean of velocity → subtract (remove drift)');
console.log('  6. Integrate again → displacement[]');
console.log('  7. Pd = max(|displacement[i]|)  ×  SCALE_CMS2');
console.log('  8. Mw = log10(Pd) + 5.39  → send in LINE Notify message');
console.log('  Memory: 150×2 bytes = 300 bytes (fits in ESP32 DRAM easily)\n');
