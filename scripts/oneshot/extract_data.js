const fs = require('fs');
const path = require('path');

const inputPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Earthquake\\simulation.ino\\test_data.h';
const outputPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Earthquake\\bm_data_output.js';
const jsonOutputPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Earthquake\\seismoguard_data.json';

const content = fs.readFileSync(inputPath, 'utf8');

// ── Extract noise_sample_1 … noise_sample_50 (2000 values each) ───
const noises = [];
const noiseArrayRe = /const float noise_sample_(\d+)\[2000\][^{]*\{([\s\S]*?)\};/g;
let nm;
while ((nm = noiseArrayRe.exec(content)) !== null) {
  const n = parseInt(nm[1]);
  if (n < 1 || n > 50) continue;   // keep only 1-50
  const vals = nm[2]
    .replace(/\/\/[^\n]*/g, '')
    .replace(/[f\s]/g, '')
    .split(',')
    .filter(v => v.length > 0)
    .map(Number);
  noises[n - 1] = vals;             // 0-based array
}
// Verify
const missing = [];
for (let i = 0; i < 50; i++) { if (!noises[i]) missing.push(i + 1); }
if (missing.length) { console.error('Missing noise samples:', missing); process.exit(1); }
console.log(`noise_sample_1..50: ${noises[0].length} values each`);

// ── Extract p_wave_samples_N arrays ───────────────────────────────
// Pattern: optional comment line(s) with STEAD ID, then array declaration
const pwaveResults = [];

// Regex to find each p_wave_samples_N block along with any preceding STEAD ID comment
// We'll iterate over all matches
const arrayRegex = /(?:\/\/[^\n]*\n)*const float p_wave_samples_(\d+)\[250\][^{]*\{([\s\S]*?)\};/g;

let match;
while ((match = arrayRegex.exec(content)) !== null) {
  const n = parseInt(match[1]);
  const rawData = match[2]
    .replace(/\/\/[^\n]*/g, '')
    .replace(/[f\s]/g, '')
    .split(',')
    .filter(v => v.length > 0)
    .map(Number);

  // Find the STEAD ID comment just before this array
  // Look backwards from match.index to find the most recent STEAD comment
  const before = content.substring(0, match.index + match[0].indexOf('const float'));
  // Search for the last STEAD ID comment
  const steadCommentRegex = /\/\/\s*ข้อมูลจาก STEAD ID\s*:\s*([^\n\r(]+)/g;
  let steadMatch;
  let lastSteadLabel = null;
  let tempRe = new RegExp('//\\s*ข้อมูลจาก STEAD ID\\s*:\\s*([^\\n\\r(]+)', 'g');
  let m2;
  while ((m2 = tempRe.exec(before)) !== null) {
    lastSteadLabel = m2[1].trim();
  }

  // Extract station code: part before first underscore
  let label = 'UNKNOWN';
  if (lastSteadLabel) {
    label = lastSteadLabel.split('_')[0].trim();
  }

  pwaveResults.push({ n, label, data: rawData, onset: 50 });
}

// Sort by n
pwaveResults.sort((a, b) => a.n - b.n);

console.log(`p_wave arrays found: ${pwaveResults.length}`);
pwaveResults.forEach(p => {
  if (p.data.length !== 250) {
    console.warn(`  WARNING: p_wave_samples_${p.n} has ${p.data.length} values (expected 250)`);
  }
});

// ── Build output JS ───────────────────────────────────────────────
// Outputs ONLY the noise arrays as a separate global so blackmystery.html
// can load this before its inline BM_DATASETS block.
let out = '// Auto-generated from test_data.h\n';
out += `// ${noises.length} noise samples (2000 values each) + ${pwaveResults.length} P-wave datasets\n\n`;

// noise arrays as BM_DATASETS_NOISES (separate from inline pwave data)
out += 'window.BM_DATASETS_NOISES = [\n';
for (const arr of noises) {
  out += '  [' + arr.join(',') + '],\n';
}
out += '];\n\n';

// Also emit full BM_DATASETS for standalone use (includes pwave)
out += 'if (!window._BM_DATASETS_LOADED) {\n';
out += 'window._BM_DATASETS_LOADED = true;\n';
out += '}\n';

fs.writeFileSync(outputPath, out, 'utf8');
console.log(`\nWrote ${outputPath}`);
console.log(`File size: ${(out.length / 1024).toFixed(1)} KB`);

// ── Also write seismoguard_data.json with full 2000-sample noise arrays ──
const jsonData = {
  noises: noises,
  pwave: pwaveResults.map(p => ({ n: p.n, label: p.label, data: p.data, onset: p.onset }))
};
fs.writeFileSync(jsonOutputPath, JSON.stringify(jsonData), 'utf8');
console.log(`Wrote ${jsonOutputPath}`);
console.log(`  noises: ${noises.length} × ${noises[0].length} values`);
console.log(`  pwave:  ${pwaveResults.length} entries`);
