'use strict';
// Regenerates bm_data_output.js from seismoguard_data.json
// Output: window.BM_DATASETS_NOISES (250 × 2000) + window.BM_DATASETS_PWAVE (439 × 300)

const fs   = require('fs');
const data = require('./seismoguard_data.json');

const N_PWAVE = data.pwave.length;
const N_NOISE = data.noises.length;
console.log(`pwave: ${N_PWAVE}  noises: ${N_NOISE}`);

let out = `// Auto-generated from seismoguard_data.json\n`;
out    += `// ${N_PWAVE} P-wave datasets + ${N_NOISE} noise samples\n\n`;

// ── Noise arrays ──────────────────────────────────────────────────────────────
out += 'window.BM_DATASETS_NOISES = [\n';
for (const arr of data.noises) {
  out += '  [' + arr.join(',') + '],\n';
}
out += '];\n\n';

// ── P-wave arrays ─────────────────────────────────────────────────────────────
out += 'window.BM_DATASETS_PWAVE = [\n';
data.pwave.forEach((pw, i) => {
  const label = (pw.trace_name || pw.label || `DS-${i+1}`).split('_')[0];
  const onset = 50;   // analysis scripts use ONSET=50; extraction window starts 50 pre-P
  const mag   = pw.magnitude != null ? pw.magnitude : null;
  const magStr = mag != null ? `, magnitude:${mag}` : '';
  out += `  { n:${i+1}, label:${JSON.stringify(label)}, onset:${onset}${magStr}, data:[${pw.data.join(',')}] },\n`;
});
out += '];\n';

const outPath = './bm_data_output.js';
fs.writeFileSync(outPath, out, 'utf8');
console.log(`Wrote ${outPath}  (${(out.length/1024).toFixed(0)} KB)`);
