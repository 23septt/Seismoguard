/**
 * apply_format.js
 * Applies IPST / สสวท. formatting rules to the unpacked docx.
 *
 * Changes made:
 *   1. document.xml — all 9 sectPr: set left=2160, top=2160 (right/bottom stay 1440)
 *   2. styles.xml   — docDefaults pPrDefault: single line spacing, 0 space-after
 *   3. styles.xml   — Normal style: add explicit pPr with same spacing
 *
 * Run:  node apply_format.js
 * Then: node repack.js
 */

const fs = require('fs');

const DOC_PATH    = 'C:/Users/Lenovo/OneDrive/Desktop/Claude_Home/Earthquake/unpacked/word/document.xml';
const STYLES_PATH = 'C:/Users/Lenovo/OneDrive/Desktop/Claude_Home/Earthquake/unpacked/word/styles.xml';

// ─── 1. Fix page margins in document.xml ──────────────────────────────────────
let doc = fs.readFileSync(DOC_PATH, 'utf8');

const pgMarOld = /w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/g;
const pgMarNew = 'w:top="2160" w:right="1440" w:bottom="1440" w:left="2160"';

const pgMarCount = (doc.match(pgMarOld) || []).length;
doc = doc.replace(pgMarOld, pgMarNew);
console.log(`[document.xml] Page margins updated: ${pgMarCount} sectPr(s)`);

fs.writeFileSync(DOC_PATH, doc, 'utf8');

// ─── 2. Fix spacing in styles.xml ─────────────────────────────────────────────
let styles = fs.readFileSync(STYLES_PATH, 'utf8');

// 2a. docDefaults pPrDefault: after=160 line=259 → after=0 line=240
const oldDefaultSpacing = '<w:spacing w:after="160" w:line="259" w:lineRule="auto"/>';
const newDefaultSpacing = '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>';

if (styles.includes(oldDefaultSpacing)) {
  styles = styles.replace(oldDefaultSpacing, newDefaultSpacing);
  console.log('[styles.xml] docDefaults spacing fixed (single, 0 after)');
} else {
  console.warn('[styles.xml] WARNING: docDefaults spacing pattern not found — may already be correct or different format');
}

// 2b. Normal style: inject <w:pPr> with spacing if not already present
//     Normal style currently has no <w:pPr>, only <w:rPr>
const normalStyleOld = '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rsid w:val="00B17475"/><w:rPr>';
const normalStyleNew = '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rsid w:val="00B17475"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr>';

if (styles.includes(normalStyleOld)) {
  styles = styles.replace(normalStyleOld, normalStyleNew);
  console.log('[styles.xml] Normal style pPr spacing added');
} else if (styles.includes('<w:pPr><w:spacing w:after="0"')) {
  console.log('[styles.xml] Normal style spacing already set — skipping');
} else {
  console.warn('[styles.xml] WARNING: Normal style pattern not found — check rsid value');
}

// 2c. Make sure Normal style rFonts also includes cs= for Thai rendering
const normalRFontsOld = '<w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New"/>';
const normalRFontsNew = '<w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New"/>';

if (styles.includes(normalRFontsOld)) {
  // Only replace the first occurrence (Normal style), not every rFonts in the file
  styles = styles.replace(normalRFontsOld, normalRFontsNew);
  console.log('[styles.xml] Normal style rFonts cs= added for Thai rendering');
}

// 2d. Ensure default sz in rPrDefault matches 16pt body text
//     Current: sz=22 (11pt). We want 32 (16pt).
const rPrDefaultOld = '<w:sz w:val="22"/><w:szCs w:val="28"/>';
const rPrDefaultNew = '<w:sz w:val="32"/><w:szCs w:val="32"/>';

if (styles.includes(rPrDefaultOld)) {
  styles = styles.replace(rPrDefaultOld, rPrDefaultNew);
  console.log('[styles.xml] docDefaults rPrDefault font size: 22→32 (11pt→16pt)');
}

fs.writeFileSync(STYLES_PATH, styles, 'utf8');

console.log('\nDone. Now run:  node repack.js');
