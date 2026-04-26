const fs = require('fs');
const JSZip = require('./node_modules/jszip');

function escXml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const newParaText = 'ในโครงงานนี้นำข้อมูลจาก STEAD จำนวน 439 ตัวอย่าง (P-wave จัดกลุ่มแบบ Stratified ตามระดับ Mw) และ 250 ตัวอย่าง (noise) มาทดสอบอัลกอริทึม STA/LTA ผ่านกระบวนการ Grid Search จำนวน 677,220 การจำลอง (980 ชุดพารามิเตอร์ × 689 ตัวอย่าง) เพื่อหาค่าพารามิเตอร์ที่เหมาะสมที่สุด โดยดึงข้อมูลจากรูปแบบ HDF5 แปลงเป็น JSON ผ่านสคริปต์ Python บน Kaggle จากนั้นนำส่งไปประมวลผลบน Arduino และ Browser Dashboard';

const id = 'CF' + Math.floor(Math.random()*0xFFFFF).toString(16).padStart(5,'0');
const newPara = `    <w:p w14:paraId="${id}" w14:textId="77777777" w:rsidR="00CF0008" w:rsidRDefault="00CF0008" w:rsidP="005B123C">
      <w:pPr>
        <w:ind w:left="720" w:firstLine="720"/>
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
        <w:t xml:space="preserve">${escXml(newParaText)}</w:t>
      </w:r>
    </w:p>`;

const PARA_START = 274567;
const PARA_END   = 275459;

JSZip.loadAsync(fs.readFileSync('รูปเล่มโครงงานเสด_new.docx')).then(zip => {
  return zip.file('word/document.xml').async('string').then(xml => {
    const newXml = xml.substring(0, PARA_START) + newPara + xml.substring(PARA_END);
    console.log('Replaced para:', PARA_END - PARA_START, '->', newPara.length, 'bytes');
    zip.file('word/document.xml', newXml);
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  });
}).then(buf => {
  fs.writeFileSync('รูปเล่มโครงงานเสด_new.docx', buf);
  console.log('Done — saved.');
});
