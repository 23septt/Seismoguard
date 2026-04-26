/**
 * fix_ch3_equations_v3.js
 * Uses paraId anchors to find paragraphs regardless of whitespace/CRLF differences.
 *
 * Fixes:
 *   A. paraId 4C8D1D61 (v_x) → replace whole paragraph with v̄_z version
 *   B. paraId 1E1600C0 (v_y) → delete entire paragraph
 *   C. paraId 1F941CAA (v_z) → fix description text only
 */

const fs = require('fs');
const DOC = 'C:/Users/Lenovo/OneDrive/Desktop/Claude_Home/Earthquake/unpacked/word/document.xml';

let xml = fs.readFileSync(DOC, 'utf8');
let changes = 0;

function replaceByParaId(paraId, newContent, label) {
  const marker = 'paraId="' + paraId + '"';
  const idx = xml.indexOf(marker);
  if (idx === -1) { console.warn('[WARN] paraId not found: ' + paraId + ' (' + label + ')'); return; }
  // Find the opening <w:p tag
  const pStart = xml.lastIndexOf('<w:p ', idx);
  if (pStart === -1) { console.warn('[WARN] <w:p not found before marker: ' + label); return; }
  // Find the closing </w:p>
  const pEnd = xml.indexOf('</w:p>', idx) + 6;
  xml = xml.slice(0, pStart) + newContent + xml.slice(pEnd);
  console.log('[OK] ' + label);
  changes++;
}

// ══ FIX A: v_x paragraph (4C8D1D61) → v̄_z ════════════════════════════════
// Replace the whole paragraph: change OMML from v_x to v̄_z and fix description
replaceByParaId('4C8D1D61',
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
        <w:t xml:space="preserve"> หมายถึง ค่าเฉลี่ยเคลื่อนที่ EMA ของแกน Z ณ จุดเวลาก่อนหน้า (DC baseline)</w:t>
      </w:r>
    </w:p>`,
'FIX A: v_x → v̄_z (overline accent + description fixed)'
);

// ══ FIX B: v_y paragraph (1E1600C0) → delete ══════════════════════════════
replaceByParaId('1E1600C0', '',
  'FIX B: delete v_y definition paragraph (leftover from 3-axis version)'
);

// ══ FIX C: v_z paragraph (1F941CAA) → fix description only ════════════════
// Keep OMML the same (v_z is correct variable). Fix the description text.
replaceByParaId('1F941CAA',
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
        <w:t xml:space="preserve"> หมายถึง ค่าความเร่งในแนวแกน Z ณ จุดเวลาปัจจุบัน (อินพุตจากเซนเซอร์)</w:t>
      </w:r>
    </w:p>`,
'FIX C: v_z description → ค่าความเร่งแกน Z ณ ปัจจุบัน (not CF)'
);

// ── save ──────────────────────────────────────────────────────────────────
fs.writeFileSync(DOC, xml, 'utf8');
console.log('\nTotal changes: ' + changes + '/3');
console.log(changes === 3 ? 'All fixes applied. Run: node repack.js' : 'Some fixes failed — check warnings above.');
