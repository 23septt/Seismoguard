'use strict';
/**
 * CDT2026 / 01_clean.js
 * Duplicate raw dataset → apply cleaning criteria → write dataset_clean.json
 *
 * Cleaning rules:
 *   P-wave
 *     C1  duplicate trace_name           → keep first
 *     C2  zero-energy trace              → drop
 *     C3  flat/stuck channel             → drop (range < 1e-8 over full trace)
 *     C4  pre-onset energy leak          → drop if energy([0:50]) > 0.5 × energy([50:300])
 *     C5  extreme sample value           → drop if any |v| > 1e6
 *   Noise
 *     C6  zero-energy                    → drop
 *     C7  embedded seismic event         → drop if STA/LTA > 2.5 in detection window
 *                                           (uses same α as firmware, cold-start is fine —
 *                                            LTA warmup runs first 1750 samples)
 */

const fs   = require('fs');
const path = require('path');

const RAW_PATH   = path.join(__dirname, '..', 'seismoguard_data.json');
const CLEAN_PATH = path.join(__dirname, 'dataset_clean.json');

const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));

// ── helpers ──────────────────────────────────────────────────────────────────
function energy(arr, start, end) {
  let s = 0;
  for (let i = start; i < end; i++) s += arr[i] * arr[i];
  return s;
}

// Lightweight STA/LTA to detect embedded events in noise
// Uses same parameters as firmware (conservative: RATIO 2.5 to be cautious)
const ALPHA_STA = 1 / (0.5 * 50);   // STA=0.5s @ 50Hz
const ALPHA_LTA = 1 / (30 * 50);    // LTA=30s  @ 50Hz
const NOISE_WARMUP = 1750;
const WINDOW = 250;
const EMBED_RATIO = 2.5;

function hasEmbeddedEvent(samples) {
  let sta = samples[0] * samples[0];
  let lta = sta;
  for (let i = 0; i < NOISE_WARMUP; i++) {
    const cf = samples[i] * samples[i];
    lta = ALPHA_LTA * cf + (1 - ALPHA_LTA) * lta;
    sta = ALPHA_STA * cf + (1 - ALPHA_STA) * sta;
  }
  for (let i = NOISE_WARMUP; i < NOISE_WARMUP + WINDOW; i++) {
    const cf = samples[i] * samples[i];
    sta = ALPHA_STA * cf + (1 - ALPHA_STA) * sta;
    lta = ALPHA_LTA * cf + (1 - ALPHA_LTA) * lta;
    if (lta > 1e-9 && sta / lta >= EMBED_RATIO) return true;
  }
  return false;
}

// ── clean P-waves ─────────────────────────────────────────────────────────────
const dropped_p = { C1: [], C2: [], C3: [], C4: [], C5: [] };
const seenNames = new Set();
const cleanP = [];

for (const p of raw.pwave) {
  if (seenNames.has(p.trace_name)) {
    dropped_p.C1.push(p.trace_name); continue;
  }
  seenNames.add(p.trace_name);

  const e_total = energy(p.data, 0, p.data.length);
  if (e_total < 1e-12) { dropped_p.C2.push(p.trace_name); continue; }

  const vmin = Math.min(...p.data);
  const vmax = Math.max(...p.data);
  if (vmax - vmin < 1e-8) { dropped_p.C3.push(p.trace_name); continue; }

  const e_pre  = energy(p.data, 0, 50);
  const e_post = energy(p.data, 50, 300);
  if (e_pre > 0.5 * e_post) { dropped_p.C4.push(p.trace_name); continue; }

  const extreme = p.data.some(v => Math.abs(v) > 1e6);
  if (extreme) { dropped_p.C5.push(p.trace_name); continue; }

  cleanP.push(p);
}

// ── clean Noise ───────────────────────────────────────────────────────────────
const dropped_n = { C6: 0, C7: 0 };
const cleanN = [];

for (const n of raw.noises) {
  const e_total = energy(n, 0, n.length);
  if (e_total < 1e-12) { dropped_n.C6++; continue; }

  if (hasEmbeddedEvent(n)) { dropped_n.C7++; continue; }

  cleanN.push(n);
}

// ── write output ──────────────────────────────────────────────────────────────
fs.writeFileSync(CLEAN_PATH, JSON.stringify({ pwave: cleanP, noises: cleanN }));

// ── report ────────────────────────────────────────────────────────────────────
const total_drop_p = Object.values(dropped_p).reduce((a, v) => a + v.length, 0);
const total_drop_n = Object.values(dropped_n).reduce((a, v) => a + v, 0);

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║  CDT2026  /  01_clean.js  —  Dataset Cleaning        ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('\n  SOURCE: seismoguard_data.json');
console.log(`  RAW    P-wave : ${raw.pwave.length.toString().padStart(4)}`);
console.log(`  RAW    Noise  : ${raw.noises.length.toString().padStart(4)}`);

console.log('\n  ── P-wave drops ───────────────────────────────────────');
console.log(`  C1 duplicate trace_name       : ${dropped_p.C1.length}`);
console.log(`  C2 zero-energy                : ${dropped_p.C2.length}`);
console.log(`  C3 flat/stuck channel         : ${dropped_p.C3.length}`);
console.log(`  C4 pre-onset energy leak       : ${dropped_p.C4.length}`);
console.log(`  C5 extreme sample (|v|>1e6)   : ${dropped_p.C5.length}`);
console.log(`  Total dropped P               : ${total_drop_p}`);

console.log('\n  ── Noise drops ────────────────────────────────────────');
console.log(`  C6 zero-energy                : ${dropped_n.C6}`);
console.log(`  C7 embedded seismic event     : ${dropped_n.C7}`);
console.log(`  Total dropped N               : ${total_drop_n}`);

console.log('\n  ── Clean dataset ──────────────────────────────────────');
console.log(`  CLEAN  P-wave : ${cleanP.length}`);
console.log(`  CLEAN  Noise  : ${cleanN.length}`);

const bins = [[3,4.5],[4.5,5],[5,6.5],[6.5,99]];
const labels = ['sub  Mw 3–4.5','T1   Mw 4.5–5 ','T2   Mw 5–6.5 ','crit Mw 6.5+  '];
console.log('\n  Mw distribution (clean):');
bins.forEach(([lo,hi], idx) => {
  const n = cleanP.filter(p => p.magnitude >= lo && p.magnitude < hi).length;
  console.log(`    ${labels[idx]}: ${n}`);
});

console.log(`\n  OUTPUT: CDT2026/dataset_clean.json`);
console.log(`  Size  : ${(fs.statSync(CLEAN_PATH).size / 1e6).toFixed(1)} MB\n`);
