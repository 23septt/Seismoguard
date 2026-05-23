/**
 * build_ch4.js
 * Generates new XML for Chapter 4 sections 4.4–4.7 (replacing old 4.4 STEAD content).
 * Injects into รูปเล่มโครงงานเสด_new.docx in-place.
 *
 * Replaces: xml[756626 .. 793222)  (old one-section 4.4)
 * With:     4.4 Grid Search v3 + 4.5 ROC + 4.6 Pd Magnitude + 4.7 2-tier alert
 */

const fs = require('fs');
const JSZip = require('./node_modules/jszip');

// ── Helpers ──────────────────────────────────────────────────────────────────
let _paraCounter = 0xCA0000;
function rnd() {
  _paraCounter++;
  return _paraCounter.toString(16).toUpperCase().padStart(6, '0');
}

/** Body paragraph — indent firstLine=720, thaiDistribute */
function body(text) {
  const id = rnd();
  return `    <w:p w14:paraId="${id}" w14:textId="77777777" w:rsidR="00CF0004" w:rsidRDefault="00CF0004" w:rsidP="005B123C">
      <w:pPr>
        <w:ind w:firstLine="720"/>
        <w:jc w:val="thaiDistribute"/>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
        </w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:szCs w:val="32"/>
          <w:cs/>
        </w:rPr>
        <w:t xml:space="preserve">${escXml(text)}</w:t>
      </w:r>
    </w:p>`;
}

/** Section heading — bold, sz=36 (18pt), firstLine=720 */
function secHead(num, title) {
  const id = rnd();
  return `    <w:p w14:paraId="${id}" w14:textId="77777777" w:rsidR="00CF0004" w:rsidRDefault="00CF0004" w:rsidP="005B123C">
      <w:pPr>
        <w:ind w:firstLine="720"/>
        <w:jc w:val="thaiDistribute"/>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:b/>
          <w:bCs/>
          <w:noProof/>
          <w:sz w:val="36"/>
          <w:szCs w:val="36"/>
        </w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:b/>
          <w:bCs/>
          <w:noProof/>
          <w:sz w:val="36"/>
          <w:szCs w:val="36"/>
          <w:cs/>
        </w:rPr>
        <w:t xml:space="preserve">${escXml(num + ' ' + title)}</w:t>
      </w:r>
    </w:p>`;
}

/** Table caption (centered, size 28 = 14pt) */
function tableCaption(text) {
  const id = rnd();
  return `    <w:p w14:paraId="${id}" w14:textId="77777777" w:rsidR="00CF0004" w:rsidRDefault="00CF0004" w:rsidP="005B123C">
      <w:pPr>
        <w:jc w:val="center"/>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:sz w:val="28"/>
          <w:szCs w:val="28"/>
        </w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:noProof/>
          <w:sz w:val="28"/>
          <w:szCs w:val="28"/>
          <w:cs/>
        </w:rPr>
        <w:t xml:space="preserve">${escXml(text)}</w:t>
      </w:r>
    </w:p>`;
}

/** XML-escape a text string for use inside <w:t> */
function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Table cell: centered, optional bold, sz=24 (12pt) */
function tc(w, text, bold = false) {
  const b = bold ? '<w:b/><w:bCs/>' : '';
  const pid = rnd();
  const safeText = escXml(text);
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p w14:paraId="${pid}" w14:textId="${pid}"><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:cs="TH Sarabun New"/>${b}<w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:cs="TH Sarabun New"/>${b}<w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${safeText}</w:t></w:r></w:p></w:tc>`;
}

/** Build a full table from header row and data rows. colWidths = array of dxa widths */
function buildTable(colWidths, headerCells, dataRows) {
  const trid = rnd();
  // tblGrid
  const grid = colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('');
  // header row
  const headerTcs = headerCells.map((h, i) => tc(colWidths[i], h, true)).join('');
  const headerRow = `<w:tr w14:paraId="${trid}" w14:textId="${trid}">${headerTcs}</w:tr>`;
  // data rows
  const dataRowsXml = dataRows.map(row => {
    const rid = rnd();
    const cells = row.map((cell, i) => tc(colWidths[i], cell, false)).join('');
    return `<w:tr w14:paraId="${rid}" w14:textId="${rid}">${cells}</w:tr>`;
  }).join('\n      ');

  return `    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="0" w:type="auto"/>
        <w:jc w:val="center"/>
        <w:tblLook w:val="0420" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
      </w:tblPr>
      <w:tblGrid>${grid}</w:tblGrid>
      ${headerRow}
      ${dataRowsXml}
    </w:tbl>`;
}

// ── Content ───────────────────────────────────────────────────────────────────
const parts = [];

// ── 4.4 Grid Search v3 ───────────────────────────────────────────────────────
parts.push(secHead('4.4', 'ผลการค้นหาพารามิเตอร์ที่เหมาะสมด้วยวิธี Grid Search'));

parts.push(body(
  'เพื่อตรวจสอบและปรับปรุงค่าพารามิเตอร์ของอัลกอริทึม STA/LTA ให้เหมาะสมกับสัญญาณแผ่นดินไหวจริง ' +
  'คณะผู้จัดทำจึงดำเนินการค้นหาพารามิเตอร์ที่เหมาะสมด้วยวิธี Grid Search บนชุดข้อมูล ' +
  'Stanford Earthquake Dataset (STEAD) เวอร์ชัน 3 ซึ่งเป็นชุดข้อมูลที่ได้รับการจัดกลุ่มแบบ Stratified ' +
  'ให้สอดคล้องกับระดับขีดเตือนของระบบ 2 ระดับ'
));

parts.push(body(
  'ชุดข้อมูล STEAD v3 ที่ใช้ในการค้นหาพารามิเตอร์ประกอบด้วยสัญญาณ P-wave จำนวน 439 ตัวอย่าง ' +
  'แบ่งเป็น 4 กลุ่มตามขนาดแผ่นดินไหว ได้แก่ กลุ่ม sub (Mw 3.0–4.5) จำนวน 100 ตัวอย่าง ' +
  'กลุ่ม T1 (Mw 4.5–5.0) จำนวน 100 ตัวอย่าง กลุ่ม T2 (Mw 5.0–6.5) จำนวน 200 ตัวอย่าง ' +
  'และกลุ่ม crit (Mw 6.5+) จำนวน 39 ตัวอย่าง รวมกับสัญญาณรบกวน (Noise) อีก 250 ตัวอย่าง ' +
  'รวมทั้งสิ้น 689 ตัวอย่าง'
));

parts.push(body(
  'พื้นที่การค้นหาครอบคลุม 980 ชุดพารามิเตอร์ (5 × 7 × 7 × 4) ประกอบด้วย ' +
  'ค่า τ_STA ที่ 0.2, 0.3, 0.4, 0.5 และ 0.6 วินาที, ' +
  'ค่า RATIO_TRIGGER ที่ 3.0, 3.5, 4.0, 4.5, 5.0, 5.5 และ 6.0, ' +
  'ค่า MIN_TRIGGER_SAMPLES ที่ 3, 5, 7, 8, 10, 12 และ 15 ตัวอย่าง และ ' +
  'ค่า SPIKE_REJECT_FACTOR ที่ 20, 50, 100 และ 200 เท่า ' +
  'โดยกำหนดค่า LTA window คงที่ที่ 30 วินาทีตลอดการค้นหา ' +
  'รวมการจำลองทั้งสิ้น 677,220 ครั้ง'
));

parts.push(body(
  'ฟังก์ชันคะแนนที่ใช้คัดเลือกพารามิเตอร์ที่เหมาะสมคำนวณจาก ' +
  'Score = TPR × 100 − FPR × 50 − delay × 0.1 ' +
  'โดยให้น้ำหนักการลงโทษการแจ้งเตือนเท็จ (FPR) สูงกว่าความล่าช้า 5 เท่า เพื่อให้สอดคล้องกับ ' +
  'ข้อกำหนดของระบบ EEW ที่ต้องการอัตราการแจ้งเตือนเท็จต่ำ'
));

parts.push(tableCaption('ตารางที่ 4.4 ผลการค้นหาพารามิเตอร์ 10 อันดับแรกด้วย Grid Search บนชุดข้อมูล STEAD v3 (439P+250N)'));

parts.push(buildTable(
  [700, 700, 600, 700, 800, 1200, 1000, 700, 800],
  ['STA (s)', 'RATIO', 'MIN', 'SPIKE', 'ตรวจจับ', 'ความล่าช้า (ตย.)', 'Noise FA', 'F1', 'Score'],
  [
    ['0.5', '6.0', '3', '50',  '100%', '11.6', '3/250 (1%)', '0.995', '98.93'],
    ['0.6', '6.0', '3', '200', '100%', '11.8', '3/250 (1%)', '0.994', '98.81'],
    ['0.6', '6.0', '3', '100', '100%', '11.9', '3/250 (1%)', '0.994', '98.81'],
    ['0.6', '6.0', '3', '50',  '100%', '12.4', '3/250 (1%)', '0.994', '98.80'],
    ['0.5', '6.0', '5', '100', '100%', '12.8', '3/250 (1%)', '0.994', '98.78'],
    ['0.5', '6.0', '5', '50',  '100%', '13.1', '3/250 (1%)', '0.994', '98.77'],
    ['0.6', '6.0', '5', '200', '100%', '13.6', '3/250 (1%)', '0.994', '98.76'],
    ['0.6', '6.0', '5', '100', '100%', '13.7', '3/250 (1%)', '0.994', '98.75'],
    ['0.5', '6.0', '3', '200', '100%', '11.3', '5/250 (2%)', '0.994', '98.75'],
    ['0.5', '6.0', '3', '100', '100%', '11.3', '5/250 (2%)', '0.994', '98.75'],
  ]
));

parts.push(body(
  'จากตาราง 4.4 พบว่าพารามิเตอร์ที่ให้ผลดีที่สุดคือ STA window = 0.5 วินาที, ' +
  'RATIO_TRIGGER = 6.0, MIN_TRIGGER_SAMPLES = 3 ตัวอย่าง (60 มิลลิวินาที) และ ' +
  'SPIKE_REJECT_FACTOR = 50 เท่า ซึ่งให้ค่า F1-score = 0.995, TPR = 100% (439/439 ตัวอย่าง), ' +
  'FPR = 1% (3/250 ตัวอย่าง) และความล่าช้าเฉลี่ยในการตรวจจับ 11.6 ตัวอย่าง (0.23 วินาที) ' +
  'หลังจุดเริ่มต้นของคลื่น P จึงเลือกใช้ชุดพารามิเตอร์นี้เป็นค่าสุดท้ายสำหรับการติดตั้งในอุปกรณ์จริง'
));

parts.push(body(
  'เปรียบเทียบกับการค้นหาพารามิเตอร์เวอร์ชันก่อนหน้า (v1: 77P+38N, RATIO=5.0, MIN=10, F1=0.994, FPR=3%) ' +
  'การปรับปรุงชุดข้อมูลเป็น v3 ที่มีขนาดใหญ่กว่าและครอบคลุมช่วง Mw ที่กว้างกว่า ' +
  'ส่งผลให้ค่า RATIO_TRIGGER ที่เหมาะสมเพิ่มขึ้นเป็น 6.0 ซึ่งช่วยลด FPR จาก 3% เหลือ 1% ' +
  'ขณะที่คงค่า TPR ไว้ที่ 100% และลดค่า MIN จาก 10 เหลือ 3 ซึ่งลดความล่าช้าในการแจ้งเตือนได้อย่างมีนัยสำคัญ'
));

// ── 4.5 ROC Analysis ─────────────────────────────────────────────────────────
parts.push(secHead('4.5', 'ผลการวิเคราะห์เส้นโค้ง ROC'));

parts.push(body(
  'การวิเคราะห์เส้นโค้ง ROC (Receiver Operating Characteristic) ดำเนินการโดยกวาดค่า ' +
  'RATIO_TRIGGER ตั้งแต่ 10.0 ลงมาจนถึง 1.5 โดยใช้ค่า MIN_TRIG = 3 และ SPIKE = 50 คงที่ ' +
  'รวม 86 จุดปฏิบัติการ บนชุดข้อมูล STEAD v3 (439 P-wave + 250 Noise) ' +
  'เพื่อประเมินความสามารถในการจำแนกสัญญาณ P-wave ออกจากสัญญาณรบกวนในภาพรวม'
));

parts.push(body(
  'ผลการวิเคราะห์ได้ค่า AUC (Area Under the Curve) = 0.9919 ' +
  'ซึ่งแสดงว่าระบบมีความสามารถในการจำแนกสัญญาณ P-wave ออกจากสัญญาณรบกวน ' +
  'ได้ในระดับที่ใกล้เคียงกับการจำแนกสมบูรณ์แบบ (AUC = 1.0)'
));

parts.push(tableCaption('ตารางที่ 4.5 จุดปฏิบัติการสำคัญบนเส้นโค้ง ROC (MIN=3, SPIKE=50, ชุดข้อมูล STEAD v3)'));

parts.push(buildTable(
  [800, 700, 700, 800, 700, 1500],
  ['RATIO', 'TPR', 'FPR', 'Precision', 'F1', 'ความล่าช้าเฉลี่ย (ตย.)'],
  [
    ['2.0', '100%', '29%', '86%', '0.923', '10.2'],
    ['3.0', '100%', '10%', '94%', '0.971', '13.0'],
    ['4.0', '100%',  '6%', '97%', '0.983', '14.6'],
    ['5.0', '100%',  '3%', '98%', '0.991', '15.9'],
    ['6.0 *', '100%',  '1%', '99%', '0.994', '17.4'],
    ['7.0', '99%',   '1%', '99%', '0.991', '17.8'],
    ['8.0', '98%',   '1%', '100%','0.990', '18.3'],
  ]
));

parts.push(body(
  'หมายเหตุ: * หมายถึงจุดปฏิบัติการที่ติดตั้งในอุปกรณ์จริง. ' +
  'ค่าความล่าช้าในตารางที่ 4.5 คำนวณจาก ROC sweep ที่ใช้ค่า MIN_TRIG=3 คงที่ ' +
  'จึงอาจต่างจากค่า 11.6 ตัวอย่างที่ได้จาก Grid Search ซึ่งนับจากจุดที่ผ่านเกณฑ์ MIN ครบ'
));

parts.push(body(
  'ที่จุดปฏิบัติการ RATIO = 6.0 ซึ่งเลือกใช้ในอุปกรณ์จริง ระบบสามารถตรวจจับสัญญาณ P-wave ' +
  'ได้ครบ 100% (439/439 ตัวอย่าง) โดยมีการแจ้งเตือนเท็จจากสัญญาณรบกวนเพียง 1% (3/250 ตัวอย่าง) ' +
  'ซึ่งเป็นการแลกเปลี่ยนที่เหมาะสมระหว่างความไวและความจำเพาะ ' +
  'เมื่อเปรียบเทียบกับ RATIO = 5.0 ที่เคยใช้ (FPR = 3%) ค่า RATIO = 6.0 สามารถลด FPR ลงได้ครึ่งหนึ่ง ' +
  'โดยไม่เสียค่า TPR แม้แต่น้อย'
));

// ── 4.6 Pd Magnitude Estimation ──────────────────────────────────────────────
parts.push(secHead('4.6', 'ผลการประเมินขนาดแผ่นดินไหวด้วยวิธี Pd'));

parts.push(body(
  'หลังจากระบบยืนยันการตรวจจับคลื่น P-wave (เข้าสู่สถานะ ALARMING) ' +
  'อุปกรณ์รุ่น ESP32 จะบันทึกค่าความเร่งจาก 150 ตัวอย่างแรก (3 วินาทีที่ 50 Hz) ' +
  'เพื่อประมาณขนาดแผ่นดินไหวเบื้องต้นด้วยวิธี Pd ' +
  'โดยทำการหาค่า peak displacement (Pd) จากการอินทิเกรตสัญญาณสองครั้ง ' +
  'แล้วนำมาคำนวณด้วยสมการถดถอยของ Wu and Kanamori (2005): ' +
  'log₁₀(Mw) = log₁₀(Pd) + 5.39 ' +
  'ซึ่งผลการประมาณ Mw จะใช้ตัดสินใจว่าจะส่งการแจ้งเตือนระดับใด'
));

parts.push(tableCaption('ตารางที่ 4.6 ผลการประมาณขนาดแผ่นดินไหวด้วยวิธี Pd จำแนกตามกลุ่ม Mw จริง (STEAD v3)'));

parts.push(buildTable(
  [1400, 600, 1100, 1200, 1200],
  ['Bin (Mw จริง)', 'n', 'Silent (<4.5)', 'Tier-1 (4.5–5.0)', 'Tier-2 (≥5.0)'],
  [
    ['sub: Mw 3.0–4.5', '100', '9%', '12%', '79% (overestimate)'],
    ['T1: Mw 4.5–5.0', '100', '0%', '3%',  '97%'],
    ['T2: Mw 5.0–6.5', '200', '2%', '2%',  '97%'],
    ['crit: Mw 6.5+',   '39',  '0%', '3%',  '97%'],
  ]
));

parts.push(body(
  'จากตาราง 4.6 พบว่าสำหรับแผ่นดินไหวกลุ่ม T1 (Mw 4.5–5.0), T2 (Mw 5.0–6.5) และ crit (Mw 6.5+) ' +
  'วิธี Pd สามารถประมาณขนาดได้ถูกต้องในระดับ Tier-2 (Mw ≥ 5.0) ได้ถึง 97% ' +
  'ซึ่งหมายความว่าเหตุการณ์ที่ควรส่งการแจ้งเตือนระดับสูงสุดนั้น ระบบสามารถตรวจจับและแจ้งเตือน ' +
  'ได้อย่างถูกต้องเกือบทั้งหมด'
));

parts.push(body(
  'อย่างไรก็ตาม พบข้อจำกัดที่สำคัญในกลุ่ม sub (Mw 3.0–4.5) ' +
  'ซึ่งเป็นแผ่นดินไหวที่ไม่ควรทำให้เกิดการแจ้งเตือน แต่ผลการประมาณพบว่า 79% ของตัวอย่างในกลุ่มนี้ ' +
  'ถูกประมาณค่าเป็น Mw ≥ 5.0 ซึ่งจะทำให้เกิดการแจ้งเตือนเท็จผ่าน buzzer และ LINE Notify ' +
  'ข้อบกพร่องนี้เกิดจากความไม่เข้ากันระหว่างสมการถดถอยของ Wu and Kanamori (2005) ' +
  'ซึ่งสอบเทียบจากเครื่องมือวัดแผ่นดินไหวระดับมืออาชีพ กับเซนเซอร์ MEMS MPU6050 ' +
  'ที่มีความไวและแบนด์วิดท์ต่างกัน ทำให้ค่า Pd ที่วัดได้สูงเกินจริงอย่างมีนัยสำคัญ'
));

// ── 4.7 2-tier alert summary ──────────────────────────────────────────────────
parts.push(secHead('4.7', 'สรุปการแจ้งเตือน 2 ระดับ'));

parts.push(body(
  'ระบบการแจ้งเตือนของ SeismoGuard แบ่งออกเป็น 2 ระดับตามขนาดแผ่นดินไหวที่ประมาณได้จากวิธี Pd ' +
  'เพื่อให้การแจ้งเตือนมีความเหมาะสมกับความรุนแรงของเหตุการณ์'
));

parts.push(tableCaption('ตารางที่ 4.7 สรุประดับการแจ้งเตือนและการตอบสนองของระบบ SeismoGuard'));

parts.push(buildTable(
  [1100, 1000, 1100, 1200, 1600],
  ['ระดับ', 'ช่วง Mw', 'Buzzer/LED', 'LINE Notify', 'หมายเหตุ'],
  [
    ['Silent (ไม่แจ้งเตือน)', 'Mw < 4.5', 'ไม่ทำงาน', 'ไม่ส่ง', 'บันทึก log เท่านั้น'],
    ['Tier-1', 'Mw 4.5–5.0', 'ทำงาน', 'ไม่ส่ง', 'Arduino + ESP32'],
    ['Tier-2', 'Mw ≥ 5.0', 'ทำงาน', 'ส่งข้อความ', 'ESP32 เท่านั้น'],
  ]
));

parts.push(body(
  'สำหรับอุปกรณ์ Arduino Uno รองรับการแจ้งเตือนได้เฉพาะ Tier-1 (buzzer + LED) เนื่องจากไม่มีการเชื่อมต่อ WiFi ' +
  'ส่วนอุปกรณ์ ESP32 รองรับทั้ง Tier-1 และ Tier-2 โดยใน Tier-2 จะส่งข้อความแจ้งเตือนผ่าน LINE Notify API ' +
  'พร้อมระบุค่าขนาดแผ่นดินไหวที่ประมาณได้ ทั้งนี้มีระยะเวลา cooldown ขั้นต่ำ 30 วินาที ' +
  'ระหว่างการส่งข้อความแต่ละครั้งเพื่อป้องกันการส่งซ้ำในกรณีอาฟเตอร์ช็อก'
));

parts.push(body(
  'จากผลการทดสอบด้วยชุดข้อมูล STEAD v3 สรุปได้ว่า ระบบการตรวจจับคลื่น P-wave ด้วย STA/LTA ' +
  'มีประสิทธิภาพสูงในระดับ AUC = 0.9919 โดยสามารถตรวจจับแผ่นดินไหวทุกระดับได้ครบถ้วน 100% ' +
  'ด้วย FPR เพียง 1% และความล่าช้าในการแจ้งเตือน 0.23 วินาทีหลัง P-onset ' +
  'อย่างไรก็ตามการประมาณขนาดด้วย Pd ยังมีข้อจำกัดในกลุ่มแผ่นดินไหวขนาดเล็ก (Mw < 4.5) ' +
  'ซึ่งเป็นประเด็นที่ต้องพัฒนาต่อไปในการวิจัยอนาคต'
));

// ── Combine all parts ─────────────────────────────────────────────────────────
const newSectionXml = parts.join('\n');

// ── Inject into docx ─────────────────────────────────────────────────────────
const DOCX = 'รูปเล่มโครงงานเสด_new.docx';

JSZip.loadAsync(fs.readFileSync(DOCX)).then(zip => {
  return zip.file('word/document.xml').async('string').then(xml => {
    // Replace: xml[756626 .. 793222) with newSectionXml
    const OLD_START = 756630;  // start of injected 4.4 section para
    const OLD_END   = 844976;  // start of Ch5 heading para

    const before = xml.substring(0, OLD_START);
    const after  = xml.substring(OLD_END);
    const newXml = before + newSectionXml + '\n' + after;

    console.log('Original length:', xml.length);
    console.log('Replaced section:', OLD_END - OLD_START, 'bytes');
    console.log('New section:', newSectionXml.length, 'bytes');
    console.log('New length:', newXml.length);

    zip.file('word/document.xml', newXml);
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  });
}).then(buf => {
  fs.writeFileSync(DOCX, buf);
  console.log('Done — saved to', DOCX);
});
