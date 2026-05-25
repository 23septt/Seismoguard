/**
 * fix_alpha_formula.js
 * Fixes two remaining issues:
 *
 * 1. Fix-E wrote wrong alpha formula in section 3.2.6 step 3:
 *    WRONG:   α = 1−exp(−1/τ)
 *    CORRECT: α = 1/(τ·f_s)     ← matches actual firmware (earthquake.ino line 8)
 *
 * 2. Also corrects Chapter 2 notation to use same symbol set as Ch3.
 */

const fs = require('fs');
const DOC = `${__dirname}/unpacked/word/document.xml`;

let xml = fs.readFileSync(DOC, 'utf8');
let changes = 0;

function replace1(old, neu, tag) {
  const idx = xml.indexOf(old);
  if (idx === -1) { console.warn('[WARN] ' + tag); return; }
  xml = xml.slice(0, idx) + neu + xml.slice(idx + old.length);
  console.log('[OK] ' + tag);
  changes++;
}

// ── FIX 1: wrong exp() formula in 3.2.6 step 3 (inserted by Fix-E) ─────────
// The Fix-E output:
//   "...โดย α = 1−exp(−1/τ) เมื่อ τ คือขนาดหน้าต่าง..."
// Correct formula per firmware:
//   α = 1/(τ·f_s)   where τ_STA=0.5s, τ_LTA=30s, f_s=50 Hz

replace1(
  'STA(n) = \u03B1\u00B7CF(n) + (1\u2212\u03B1)\u00B7STA(n\u22121) \u0E41\u0E25\u0E30 LTA(n) = \u03B2\u00B7CF(n) + (1\u2212\u03B2)\u00B7LTA(n\u22121) \u0E42\u0E14\u0E22 \u03B1 = 1\u2212exp(\u22121/\u03C4) \u0E40\u0E21\u0E37\u0E48\u0E2D \u03C4 \u0E04\u0E37\u0E2D\u0E02\u0E19\u0E32\u0E14\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E48\u0E32\u0E07\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23 (\u03C4\u005FSTA = 0.5 \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35, \u03C4\u005FLTA = 30 \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35, f\u005Fs = 50 Hz)',
  // Corrected: α = 1/(τ·f_s) with actual values
  'STA(n) = \u03B1\u00B7CF(n) + (1\u2212\u03B1)\u00B7STA(n\u22121) \u0E41\u0E25\u0E30 LTA(n) = \u03B2\u00B7CF(n) + (1\u2212\u03B2)\u00B7LTA(n\u22121) \u0E42\u0E14\u0E22 \u03B1 = 1/(\u03C4\u00B7f_s) \u0E40\u0E21\u0E37\u0E48\u0E2D \u03C4 \u0E04\u0E37\u0E2D\u0E02\u0E19\u0E32\u0E14\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E48\u0E32\u0E07 (\u03C4\u005FSTA = 0.5 s, \u03B1 = 0.04; \u03C4\u005FLTA = 30 s, \u03B2 \u2248 0.000667; f_s = 50 Hz)',
  'FIX 1: alpha formula 1-exp(-1/τ) → 1/(τ·f_s) with actual values'
);

// ── FIX 2: also fix same formula in section 2.1.4 if it has the exp form ────
// Ch2 (2.1.4) currently uses "alpha = 1/(T_STA*fs)" which is CORRECT per firmware.
// But let's confirm by checking and aligning notation:
const ch2AlphaOld = 'alpha = 1/(T_STA*fs) = 0.04 \u0E41\u0E25\u0E30 beta = 1/(T_LTA*fs) = 0.000667 (T_STA = 0.5 \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35, T_LTA = 30 \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35, fs = 50 Hz)';
const ch2AlphaNew = '\u03B1 = 1/(\u03C4_STA\u00B7f_s) = 0.04 \u0E41\u0E25\u0E30 \u03B2 = 1/(\u03C4_LTA\u00B7f_s) \u2248 0.000667 (\u03C4_STA = 0.5 s, \u03C4_LTA = 30 s, f_s = 50 Hz)';
replace1(ch2AlphaOld, ch2AlphaNew, 'FIX 2: Ch2 alpha formula aligned to Greek symbols');

fs.writeFileSync(DOC, xml, 'utf8');
console.log('\nChanges: ' + changes + '/2  →  run: node repack.js');
