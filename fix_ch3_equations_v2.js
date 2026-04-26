/**
 * fix_ch3_equations_v2.js  —  uses exact paragraph text extracted from file
 *
 * Fixes remaining 4 patterns that v1 missed (whitespace differences):
 *   A. v_x paragraph (paraId 4C8D1D61): OMML v_x → v̄_z, description cleaned
 *   B. v_y paragraph (paraId 1E1600C0): delete entire paragraph
 *   C. v_z paragraph (paraId 1F941CAA): description "CF = ผลต่าง..." → "ค่าความเร่งแกน Z"
 *
 * v1 already applied:
 *   D. Step 3.2.6 step-1 notation (az → v_z)
 *   E. Step 3.2.6 step-3 notation (alpha/STA_prev → α/STA(n-1))
 */

const fs = require('fs');
const DOC = 'C:/Users/Lenovo/OneDrive/Desktop/Claude_Home/Earthquake/unpacked/word/document.xml';

let xml = fs.readFileSync(DOC, 'utf8');
let changes = 0;

// ── helper: replace exactly once ────────────────────────────────────────────
function replace1(old, neu, tag) {
  const idx = xml.indexOf(old);
  if (idx === -1) { console.warn('[WARN not found] ' + tag); return; }
  xml = xml.slice(0, idx) + neu + xml.slice(idx + old.length);
  console.log('[OK] ' + tag);
  changes++;
}

// ══ EXACT strings from file (read with Read tool) ════════════════════════════

// ── FIX A: replace entire v_x paragraph with corrected v̄_z version ─────────
const VX_OLD = fs.readFileSync(
  'C:/Users/Lenovo/OneDrive/Desktop/Claude_Home/Earthquake/vx_para.txt', 'utf8');

const VX_NEW =
`<w:p w14:paraId="4C8D1D61" w14:textId="6AA2BA68" w:rsidR="00C77E3A" w:rsidRPr="00235AB5" w:rsidRDefault="00E74497" w:rsidP="00365D6C">
      <w:pPr>
        <w:ind w:left="2160" w:firstLine="720"/>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
        </w:rPr>
      </w:pPr>
      <m:oMath>
        <m:acc>
          <m:accPr>
            <m:chr m:val="&#x305;"/>
            <m:ctrlPr>
              <w:rPr>
                <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="TH Sarabun New"/>
                <w:i/>
                <w:noProof/>
                <w:szCs w:val="32"/>
              </w:rPr>
            </m:ctrlPr>
          </m:accPr>
          <m:e>
            <m:sSub>
              <m:sSubPr>
                <m:ctrlPr>
                  <w:rPr>
                    <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="TH Sarabun New"/>
                    <w:i/>
                    <w:noProof/>
                    <w:szCs w:val="32"/>
                  </w:rPr>
                </m:ctrlPr>
              </m:sSubPr>
              <m:e>
                <m:r>
                  <w:rPr>
                    <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="TH Sarabun New"/>
                    <w:noProof/>
                    <w:szCs w:val="32"/>
                  </w:rPr>
                  <m:t>v</m:t>
                </m:r>
              </m:e>
              <m:sub>
                <m:r>
                  <w:rPr>
                    <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="TH Sarabun New"/>
                    <w:noProof/>
                    <w:szCs w:val="32"/>
                  </w:rPr>
                  <m:t>z</m:t>
                </m:r>
              </m:sub>
            </m:sSub>
          </m:e>
        </m:acc>
      </m:oMath>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
          <w:cs/>
        </w:rPr>
        <w:t xml:space="preserve"> \u0E2B\u0E21\u0E32\u0E22\u0E16\u0E36\u0E07 \u0E04\u0E48\u0E32\u0E40\u0E09\u0E25\u0E35\u0E48\u0E22\u0E40\u0E04\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E17\u0E35\u0E48 EMA \u0E02\u0E2D\u0E07\u0E41\u0E01\u0E19 Z \u0E13 \u0E08\u0E38\u0E14\u0E40\u0E27\u0E25\u0E32\u0E01\u0E48\u0E2D\u0E19\u0E2B\u0E19\u0E49\u0E32 (DC baseline)</w:t>
      </w:r>
    </w:p>`;

replace1(VX_OLD, VX_NEW, 'FIX A: v_x paragraph → v̄_z (overline v subscript z)');

// ── FIX B: delete v_y paragraph ─────────────────────────────────────────────
const VY_OLD = fs.readFileSync(
  'C:/Users/Lenovo/OneDrive/Desktop/Claude_Home/Earthquake/vy_para.txt', 'utf8');

replace1(VY_OLD, '', 'FIX B: delete v_y definition paragraph (unused)');

// ── FIX C: fix v_z description (currently wrong — says it IS the CF output) ─
const VZ_OLD = fs.readFileSync(
  'C:/Users/Lenovo/OneDrive/Desktop/Claude_Home\Earthquake/vz_para.txt', 'utf8');

// Build corrected v_z paragraph: keep OMML (v_z symbol), fix description text
const VZ_NEW =
`<w:p w14:paraId="1F941CAA" w14:textId="407472D7" w:rsidR="00E20781" w:rsidRDefault="00E74497" w:rsidP="00365D6C">
      <w:pPr>
        <w:ind w:left="2160" w:firstLine="720"/>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
        </w:rPr>
      </w:pPr>
      <m:oMath>
        <m:sSub>
          <m:sSubPr>
            <m:ctrlPr>
              <w:rPr>
                <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="TH Sarabun New"/>
                <w:i/>
                <w:noProof/>
                <w:szCs w:val="32"/>
              </w:rPr>
            </m:ctrlPr>
          </m:sSubPr>
          <m:e>
            <m:r>
              <w:rPr>
                <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="TH Sarabun New"/>
                <w:noProof/>
                <w:szCs w:val="32"/>
              </w:rPr>
              <m:t>v</m:t>
            </m:r>
          </m:e>
          <m:sub>
            <m:r>
              <w:rPr>
                <w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="TH Sarabun New"/>
                <w:noProof/>
                <w:szCs w:val="32"/>
              </w:rPr>
              <m:t>z</m:t>
            </m:r>
          </m:sub>
        </m:sSub>
      </m:oMath>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
          <w:cs/>
        </w:rPr>
        <w:t xml:space="preserve"> \u0E2B\u0E21\u0E32\u0E22\u0E16\u0E36\u0E07 \u0E04\u0E48\u0E32\u0E04\u0E27\u0E32\u0E21\u0E40\u0E23\u0E48\u0E07\u0E43\u0E19\u0E41\u0E19\u0E27\u0E41\u0E01\u0E19 Z \u0E13 \u0E08\u0E38\u0E14\u0E40\u0E27\u0E25\u0E32\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19 (\u0E2D\u0E34\u0E19\u0E1E\u0E38\u0E15\u0E08\u0E32\u0E01\u0E40\u0E0B\u0E19\u0E40\u0E0B\u0E2D\u0E23\u0E4C)</w:t>
      </w:r>
    </w:p>`;

replace1(VZ_OLD, VZ_NEW, 'FIX C: v_z description → ค่าความเร่งแกน Z ณ ปัจจุบัน');

// ── save ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(DOC, xml, 'utf8');
console.log('\nTotal changes: ' + changes);
console.log('Run: node repack.js');
