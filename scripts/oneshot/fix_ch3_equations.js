/**
 * fix_ch3_equations.js
 * Fixes equation inconsistencies in Chapter 3 of the document.
 *
 * Problems found:
 *   1. CF definition: v_z is defined as "CF itself" but v_z is the INPUT, not output
 *   2. CF definition: v_x (EMA baseline) and v_y (Z-acceleration) are in definitions
 *      but NOT in the equation — leftover from 3-axis version
 *   3. CF equation uses v_z (input) and v̄_z (mean), but definitions reverse these
 *   4. Section 3.2.6 step text uses az/mean_az notation, inconsistent with v_z/v̄_z
 *   5. STA/LTA equations: right-side STA/LTA lacks n-1 index (ambiguous recursive form)
 *
 * Fixes applied:
 *   A. v_x definition paragraph → change OMML to v̄_z and fix description text
 *   B. v_y definition paragraph → DELETE entirely (unused, leftover from 3-axis)
 *   C. v_z definition text → change from "CF = ผลต่างยกกำลังสอง..." to "ค่าความเร่งแกน Z"
 *   D. Section 3.2.6 step 1 → align notation with formal equation (v_z, v̄_z)
 *   E. Section 3.2.6 step 3 → align notation with formal equations (α, β, n-1)
 */

const fs = require('fs');
const DOC = `${__dirname}/unpacked/word/document.xml`;

let xml = fs.readFileSync(DOC, 'utf8');
let changes = 0;

// ── Helper ────────────────────────────────────────────────────────────────────
function replace1(oldStr, newStr, label) {
  if (!xml.includes(oldStr)) {
    console.warn('[WARN] Pattern not found: ' + label);
    return;
  }
  xml = xml.replace(oldStr, newStr);
  console.log('[OK] ' + label);
  changes++;
}

// ══ FIX A: v_x definition → change OMML to v̄_z and fix description text ════
// The current v_x paragraph has subscript 'x'. We need to:
//   1. Wrap the m:e content with m:acc (overline) to make v̄
//   2. Change subscript from x → z
//   3. Simplify description: remove "(DC baseline หรือ v&#x305;z)"

const vxOmml = `<m:oMath>
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
              <m:t>x</m:t>
            </m:r>
          </m:sub>
        </m:sSub>
      </m:oMath>`;

const vzBarOmml = `<m:oMath>
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
      </m:oMath>`;

replace1(vxOmml, vzBarOmml, 'FIX A1: v_x OMML → v̄_z OMML');

// Fix A2: clean up the description text for the same paragraph
replace1(
  `หมายถึง ค่าเฉลี่ยเคลื่อนที่ EMA ของแกน Z (DC baseline หรือ v&#x305;</w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
        </w:rPr>
        <w:t>z)</w:t>
      </w:r>
    </w:p>`,
  `หมายถึง ค่าเฉลี่ยเคลื่อนที่ EMA ของแกน Z ณ จุดเวลาก่อนหน้า (DC baseline)</w:t>
      </w:r>
    </w:p>`,
  'FIX A2: v̄_z description text cleaned up'
);

// ══ FIX B: Delete v_y paragraph entirely ════════════════════════════════════
const vyParagraph = `<w:p w14:paraId="1E1600C0" w14:textId="01972E8C" w:rsidR="00C77E3A" w:rsidRPr="00235AB5" w:rsidRDefault="00E74497" w:rsidP="00365D6C">
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
              <m:t>y</m:t>
            </m:r>
          </m:sub>
        </m:sSub>
      </m:oMath>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
        </w:rPr>
        <w:t xml:space="preserve"> </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
          <w:cs/>
        </w:rPr>
        <w:t xml:space="preserve">หมายถึง ค่าความเร่งในแนวแกน Z ณ จุดเวลาปัจจุบัน (v</w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
        </w:rPr>
        <w:t>z)</w:t>
      </w:r>
    </w:p>`;

replace1(vyParagraph, '', 'FIX B: Delete v_y definition paragraph');

// ══ FIX C: v_z definition text — change from "CF = ผลต่าง..." to "ค่าความเร่งแกน Z" ═
replace1(
  `หมายถึง ค่า Characteristic Function (CF) = ผลต่างยกกำลังสองของแกน</w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New" w:hint="cs"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
          <w:cs/>
        </w:rPr>
        <w:t xml:space="preserve"> </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
        </w:rPr>
        <w:t>Z</w:t>
      </w:r>`,
  `หมายถึง ค่าความเร่งในแนวแกน Z ณ จุดเวลาปัจจุบัน</w:t>
      </w:r>`,
  'FIX C: v_z description → ค่าความเร่งแกน Z (not CF)'
);

// ══ FIX D: Section 3.2.6 step 1 — align az/mean_az → v_z/v̄_z notation ════
replace1(
  `ตามสมการ: CF = (az - mean_az)^2 เมื่อ az คือค่าความเร่งแกน Z และ mean_az คือค่าเฉลี่ยระยะยาว`,
  `ตามสมการ: CF = (v\u005Fz \u2212 v\u0305\u005Fz)\u00B2 เมื่อ v\u005Fz คือค่าความเร่งแกน Z ณ ปัจจุบัน และ v\u0305\u005Fz คือค่าเฉลี่ยเคลื่อนที่ EMA ระยะยาว`,
  'FIX D: Step 1 notation az/mean_az → v_z/v̄_z'
);

// ══ FIX E: Section 3.2.6 step 3 — update alpha/beta recursive notation ════
replace1(
  `STA = alpha_STA * CF + (1 - alpha_STA) * STA_prev \u0E41\u0E25\u0E30 LTA = alpha_LTA * CF + (1 - alpha_LTA) * LTA_prev \u0E42\u0E14\u0E22\u0E04\u0E48\u0E32 alpha \u0E04\u0E33\u0E19\u0E27\u0E13\u0E08\u0E32\u0E01 alpha = 1 - exp(-1/tau) \u0E40\u0E21\u0E37\u0E48\u0E2D tau \u0E04\u0E37\u0E2D\u0E02\u0E19\u0E32\u0E14\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E48\u0E32\u0E07\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23`,
  `STA(n) = \u03B1\u00B7CF(n) + (1\u2212\u03B1)\u00B7STA(n\u22121) \u0E41\u0E25\u0E30 LTA(n) = \u03B2\u00B7CF(n) + (1\u2212\u03B2)\u00B7LTA(n\u22121) \u0E42\u0E14\u0E22 \u03B1 = 1\u2212exp(\u22121/\u03C4) \u0E40\u0E21\u0E37\u0E48\u0E2D \u03C4 \u0E04\u0E37\u0E2D\u0E02\u0E19\u0E32\u0E14\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E48\u0E32\u0E07\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23 (\u03C4\u005FSTA = 0.5 \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35, \u03C4\u005FLTA = 30 \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35, f\u005Fs = 50 Hz)`,
  'FIX E: Step 3 notation alpha/STA_prev → α/STA(n-1) with actual values'
);

// ══ Save ════════════════════════════════════════════════════════════════════
fs.writeFileSync(DOC, xml, 'utf8');
console.log('\nTotal changes applied: ' + changes);
console.log('Now run: node repack.js');
