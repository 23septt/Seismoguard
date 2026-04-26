const fs = require('fs');
const JSZip = require('./node_modules/jszip');

function escXml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const newText = 'จากงานวิจัยพบว่า STEAD ช่วยให้สามารถพัฒนาและทดสอบอัลกอริทึมตรวจจับ P-wave ในสภาวะที่ควบคุมได้ โดยมี ground truth ที่เชื่อถือได้ โครงงานนี้จึงคัดเลือกตัวอย่าง P-wave จำนวน 439 ชุด (Stratified ตามระดับ Mw: sub 3.0–4.5 × 100, T1 4.5–5.0 × 100, T2 5.0–6.5 × 200, crit 6.5+ × 39) และ noise จำนวน 250 ชุดจาก STEAD มาใช้เป็นชุดข้อมูลทดสอบอัลกอริทึม STA/LTA Recursive ผ่านกระบวนการ Grid Search จำนวน 677,220 การจำลอง';

const id = 'CF' + Math.floor(Math.random()*0xFFFFF).toString(16).padStart(5,'0');
const newPara = `    <w:p w14:paraId="${id}" w14:textId="77777777" w:rsidR="00CF0009" w:rsidRDefault="00CF0009" w:rsidP="005B123C">
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
        <w:t xml:space="preserve">${escXml(newText)}</w:t>
      </w:r>
    </w:p>`;

const PARA_START = 301940;
const PARA_END   = 302839;

JSZip.loadAsync(fs.readFileSync('รูปเล่มโครงงานเสด_new.docx')).then(zip => {
  return zip.file('word/document.xml').async('string').then(xml => {
    const newXml = xml.substring(0, PARA_START) + newPara + xml.substring(PARA_END);
    console.log('Replaced:', PARA_END - PARA_START, '->', newPara.length, 'bytes');
    zip.file('word/document.xml', newXml);
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  });
}).then(buf => {
  fs.writeFileSync('รูปเล่มโครงงานเสด_new.docx', buf);
  console.log('Done.');
});
