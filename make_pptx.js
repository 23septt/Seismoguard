'use strict';
const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.title = 'SeismoGuard — ระบบตรวจจับคลื่น P-Wave แผ่นดินไหว';

/* ═══════════════════════════════════════════
   PALETTE  (no "#" prefix)
═══════════════════════════════════════════ */
const BG    = "09090F";
const BG2   = "11111C";
const CARD  = "18182A";
const CARD2 = "0F0F1A";
const RED   = "C0392B";
const RED2  = "7B241C";
const ORG   = "E67E22";
const GRN   = "27AE60";
const WHT   = "FFFFFF";
const TEXT  = "D4C5B0";
const TEXT2 = "9A8A7A";
const MUT   = "3A3A50";

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function chapterSlide(num, th, en) {
  const s = pres.addSlide();
  s.background = { color: BG };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.18, h:5.625, fill:{color:RED}, line:{color:RED} });
  s.addShape(pres.shapes.RECTANGLE, { x:0.18, y:0, w:9.82, h:5.625, fill:{color:BG}, line:{color:BG} });
  // faint horizontal rule
  s.addShape(pres.shapes.RECTANGLE, { x:0.4, y:3.05, w:3.5, h:0.03, fill:{color:RED2}, line:{color:RED2} });
  s.addText(`บทที่ ${num}`, { x:0.4, y:1.6, w:9, h:0.5, fontSize:16, color:RED, fontFace:"Calibri", bold:true, charSpacing:5, margin:0 });
  s.addText(th, { x:0.4, y:2.1, w:9.2, h:1.0, fontSize:34, color:WHT, fontFace:"Arial Black", bold:true, margin:0 });
  s.addText(en, { x:0.4, y:3.15, w:9, h:0.45, fontSize:15, color:TEXT2, fontFace:"Calibri", italic:true, margin:0 });
  return s;
}

function contentSlide(chNum, title) {
  const s = pres.addSlide();
  s.background = { color: BG2 };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.7, fill:{color:CARD2}, line:{color:CARD2} });
  s.addShape(pres.shapes.RECTANGLE, { x:0.28, y:0.13, w:0.07, h:0.43, fill:{color:RED}, line:{color:RED} });
  s.addText(title, { x:0.48, y:0.1, w:8.7, h:0.52, fontSize:20, color:WHT, fontFace:"Arial Black", bold:true, valign:"middle", margin:0 });
  s.addText(`บทที่ ${chNum}`, { x:8.6, y:0.1, w:1.2, h:0.52, fontSize:11, color:RED, fontFace:"Calibri", bold:true, align:"right", valign:"middle", margin:0 });
  return s;
}

function card(s, x, y, w, h, title, titleColor) {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill:{color:CARD}, line:{color:MUT, width:1} });
  if (title) s.addText(title, { x:x+0.15, y:y+0.1, w:w-0.3, h:0.38, fontSize:13, color:titleColor||RED, fontFace:"Calibri", bold:true, margin:0 });
}

function statBox(s, x, y, num, label) {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w:2.8, h:1.4, fill:{color:CARD}, line:{color:RED2, width:1.5} });
  s.addText(num,   { x, y:y+0.05, w:2.8, h:0.85, fontSize:44, color:RED, fontFace:"Arial Black", bold:true, align:"center", margin:0 });
  s.addText(label, { x, y:y+0.9,  w:2.8, h:0.45, fontSize:12, color:TEXT2, fontFace:"Calibri", align:"center", margin:0 });
}

/* ═══════════════════════════════════════════
   SLIDE 1 — COVER
═══════════════════════════════════════════ */
{
  const s = pres.addSlide();
  s.background = { color: BG };
  // left dark-red stripe
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.4, h:5.625, fill:{color:RED2}, line:{color:RED2} });
  // bottom bar
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:4.8, w:10, h:0.825, fill:{color:CARD2}, line:{color:CARD2} });
  // top label
  s.addText("โครงงานวิทยาศาสตร์และเทคโนโลยี", {
    x:0.6, y:0.4, w:9, h:0.45, fontSize:13, color:TEXT2, fontFace:"Calibri", charSpacing:2, margin:0
  });
  // main title
  s.addText("SeismoGuard", {
    x:0.6, y:0.85, w:9, h:1.1, fontSize:56, color:WHT, fontFace:"Arial Black", bold:true, margin:0
  });
  // subtitle line 1
  s.addText("ระบบตรวจจับคลื่น P-Wave แผ่นดินไหวแบบเรียลไทม์บน Arduino", {
    x:0.6, y:1.9, w:9, h:0.55, fontSize:17, color:TEXT, fontFace:"Calibri", margin:0
  });
  // red rule
  s.addShape(pres.shapes.RECTANGLE, { x:0.6, y:2.55, w:4.5, h:0.05, fill:{color:RED}, line:{color:RED} });
  // tech stack pills
  const pills = ["Arduino Uno","MPU6050","STA/LTA Algorithm","STEAD Dataset","JavaScript Dashboard"];
  pills.forEach((p, i) => {
    const px = 0.6 + i * 1.85;
    s.addShape(pres.shapes.RECTANGLE, { x:px, y:2.75, w:1.7, h:0.38, fill:{color:CARD}, line:{color:MUT, width:1} });
    s.addText(p, { x:px, y:2.75, w:1.7, h:0.38, fontSize:10, color:TEXT2, fontFace:"Calibri", align:"center", valign:"middle", margin:0 });
  });
  // bottom info
  s.addText("ปีการศึกษา 2567  |  โรงเรียน _______________  |  ชื่อผู้จัดทำ _______________", {
    x:0.5, y:4.88, w:9, h:0.45, fontSize:12, color:TEXT2, fontFace:"Calibri", margin:0
  });
}

/* ═══════════════════════════════════════════
   SLIDE 2 — สารบัญ
═══════════════════════════════════════════ */
{
  const s = pres.addSlide();
  s.background = { color: BG2 };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.7, fill:{color:CARD2}, line:{color:CARD2} });
  s.addShape(pres.shapes.RECTANGLE, { x:0.28, y:0.13, w:0.07, h:0.43, fill:{color:RED}, line:{color:RED} });
  s.addText("สารบัญ", { x:0.48, y:0.1, w:9, h:0.52, fontSize:22, color:WHT, fontFace:"Arial Black", bold:true, valign:"middle", margin:0 });

  const chapters = [
    { n:"01", th:"บทนำ", en:"Introduction — ที่มา วัตถุประสงค์ ขอบเขต" },
    { n:"02", th:"ทฤษฎีที่เกี่ยวข้อง", en:"Theory — คลื่น P-Wave, STA/LTA, State Machine, Hardware" },
    { n:"03", th:"วิธีดำเนินการ", en:"Methodology — Data Pipeline, Firmware, Grid Search" },
    { n:"04", th:"ผลการดำเนินงาน", en:"Results — Detection Rate, Delay, Parameter Comparison" },
    { n:"05", th:"สรุปและอภิปราย", en:"Conclusion — ข้อจำกัด แนวทางพัฒนาต่อ" },
  ];
  chapters.forEach((c, i) => {
    const y = 0.95 + i * 0.88;
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:9.4, h:0.72, fill:{color:CARD}, line:{color:MUT, width:1} });
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:0.55, h:0.72, fill:{color:RED2}, line:{color:RED2} });
    s.addText(c.n, { x:0.3, y, w:0.55, h:0.72, fontSize:18, color:WHT, fontFace:"Arial Black", bold:true, align:"center", valign:"middle", margin:0 });
    s.addText(c.th, { x:1.0, y:y+0.04, w:2.2, h:0.35, fontSize:15, color:WHT, fontFace:"Calibri", bold:true, margin:0 });
    s.addText(c.en, { x:1.0, y:y+0.36, w:8.4, h:0.3, fontSize:11, color:TEXT2, fontFace:"Calibri", italic:true, margin:0 });
  });
}

/* ═══════════════════════════════════════════
   บทที่ 1 — บทนำ
═══════════════════════════════════════════ */
chapterSlide(1, "บทนำ", "Introduction");

// 1.1 ที่มาและความสำคัญ
{
  const s = contentSlide(1, "1.1  ที่มาและความสำคัญ");
  // left: problem
  card(s, 0.3, 0.85, 4.4, 2.1, "ปัญหาที่พบ", RED);
  s.addText([
    { text: "• แผ่นดินไหวเกิดขึ้นโดยไม่มีการเตือนล่วงหน้า", options:{breakLine:true} },
    { text: "• ระบบ Early Warning ระดับมืออาชีพมีราคาสูงมาก", options:{breakLine:true} },
    { text: "• ประเทศไทยมีพื้นที่เสี่ยงแต่ขาดระบบเฝ้าระวังขนาดเล็ก", options:{} },
  ], { x:0.45, y:1.32, w:4.1, h:1.5, fontSize:13, color:TEXT, fontFace:"Calibri", margin:0 });

  // right: solution
  card(s, 5.0, 0.85, 4.4, 2.1, "แนวทางแก้ปัญหา", GRN);
  s.addText([
    { text: "• คลื่น P-Wave มาก่อนคลื่นทำลาย 10–60 วินาที", options:{breakLine:true} },
    { text: "• ใช้ sensor MEMS MPU6050 + Arduino ราคาถูก", options:{breakLine:true} },
    { text: "• อัลกอริทึม STA/LTA ตรวจจับ onset ได้แบบ real-time", options:{} },
  ], { x:5.15, y:1.32, w:4.1, h:1.5, fontSize:13, color:TEXT, fontFace:"Calibri", margin:0 });

  // bottom key message
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:3.15, w:9.1, h:1.0, fill:{color:RED2}, line:{color:RED2} });
  s.addText("P-Wave คือสัญญาณเตือนภัยธรรมชาติที่มาก่อนแรงสั่นสะเทือนทำลายล้างเสมอ", {
    x:0.4, y:3.18, w:8.9, h:0.45, fontSize:15, color:WHT, fontFace:"Calibri", bold:true, align:"center", margin:0
  });
  s.addText("โครงงานนี้พัฒนาอุปกรณ์ตรวจจับ P-Wave ต้นทุนต่ำด้วย Arduino + MPU6050", {
    x:0.4, y:3.6, w:8.9, h:0.45, fontSize:13, color:TEXT, fontFace:"Calibri", align:"center", margin:0
  });
}

// 1.2 วัตถุประสงค์
{
  const s = contentSlide(1, "1.2  วัตถุประสงค์");
  const items = [
    { num:"01", text:"พัฒนาระบบตรวจจับ P-Wave แบบ real-time บน Arduino โดยใช้ sensor MPU6050" },
    { num:"02", text:"ใช้อัลกอริทึม STA/LTA พร้อม State Machine 4 สถานะ ตรวจจับ onset ของแผ่นดินไหว" },
    { num:"03", text:"หาค่า parameter ที่ดีที่สุดโดย Grid Search กับข้อมูล STEAD Dataset จำนวน 100 ตัวอย่าง" },
    { num:"04", text:"พัฒนา Browser Dashboard สำหรับ visualize waveform และทดสอบอัลกอริทึม" },
  ];
  items.forEach((it, i) => {
    const y = 0.9 + i * 1.05;
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:9.1, h:0.88, fill:{color:CARD}, line:{color:MUT, width:1} });
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:0.65, h:0.88, fill:{color:RED2}, line:{color:RED2} });
    s.addText(it.num, { x:0.3, y, w:0.65, h:0.88, fontSize:22, color:WHT, fontFace:"Arial Black", bold:true, align:"center", valign:"middle", margin:0 });
    s.addText(it.text, { x:1.1, y:y+0.12, w:8.1, h:0.65, fontSize:14, color:TEXT, fontFace:"Calibri", valign:"middle", margin:0 });
  });
}

// 1.3 ขอบเขต
{
  const s = contentSlide(1, "1.3  ขอบเขตของโครงงาน");

  card(s, 0.3, 0.85, 4.5, 2.3, "อยู่ในขอบเขต ✓", GRN);
  s.addText([
    { text: "• Sensor MEMS: MPU6050 (3-axis, 50 Hz)", options:{breakLine:true} },
    { text: "• อัลกอริทึม: Recursive STA/LTA + CF", options:{breakLine:true} },
    { text: "• ข้อมูลทดสอบ: STEAD Dataset 100 samples", options:{breakLine:true} },
    { text: "• แจ้งเตือน: Buzzer + Serial output", options:{} },
  ], { x:0.45, y:1.32, w:4.2, h:1.7, fontSize:13, color:TEXT, fontFace:"Calibri", margin:0 });

  card(s, 5.05, 0.85, 4.5, 2.3, "นอกขอบเขต ✗", RED);
  s.addText([
    { text: "• ไม่ใช้ seismometer ระดับมืออาชีพ", options:{breakLine:true} },
    { text: "• ไม่ทดสอบกับแผ่นดินไหวจริงในสนาม", options:{breakLine:true} },
    { text: "• ไม่รวมการส่งสัญญาณระยะไกล (Wi-Fi/SMS)", options:{breakLine:true} },
    { text: "• ไม่ระบุ Magnitude หรือ Epicenter", options:{} },
  ], { x:5.2, y:1.32, w:4.2, h:1.7, fontSize:13, color:TEXT, fontFace:"Calibri", margin:0 });

  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:3.35, w:9.1, h:0.8, fill:{color:CARD2}, line:{color:MUT, width:1} });
  s.addText("เครื่องจำลองแผ่นดินไหว — กลไกข้อเหวี่ยง:", {
    x:0.5, y:3.4, w:3.5, h:0.35, fontSize:13, color:RED, fontFace:"Calibri", bold:true, margin:0
  });
  s.addText("ใช้พิสูจน์ว่าระบบ trigger ได้จากแรงสั่นจริง โดยไม่ต้องโปรแกรม waveform เพิ่ม (sinusoidal motion = P-Wave โดยธรรมชาติ)", {
    x:0.5, y:3.75, w:9.0, h:0.35, fontSize:12, color:TEXT2, fontFace:"Calibri", italic:true, margin:0
  });
}

/* ═══════════════════════════════════════════
   บทที่ 2 — ทฤษฎี
═══════════════════════════════════════════ */
chapterSlide(2, "ทฤษฎีที่เกี่ยวข้อง", "Related Theory & Background");

// 2.1 คลื่นไหวสะเทือน
{
  const s = contentSlide(2, "2.1  คลื่นไหวสะเทือน");
  const waves = [
    { name:"P-Wave", full:"Primary Wave", color:GRN, motion:"อนุภาคสั่น ไปข้างหน้า–ถอยหลัง (ตามทิศคลื่น)", speed:"~6 km/s", note:"มาก่อน — ใช้เตือนภัย" },
    { name:"S-Wave", full:"Secondary Wave", color:ORG, motion:"อนุภาคสั่น ขึ้น–ลง (ตั้งฉากทิศคลื่น)", speed:"~3.5 km/s", note:"แรงกว่า — ทำลายโครงสร้าง" },
    { name:"Surface Wave", full:"Love / Rayleigh", color:RED, motion:"เคลื่อนที่บนผิวดิน ซับซ้อน", speed:"~2–3 km/s", note:"ช้าสุด — ทำลายมากสุด" },
  ];
  waves.forEach((w, i) => {
    const y = 0.85 + i * 1.45;
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:9.1, h:1.22, fill:{color:CARD}, line:{color:MUT, width:1} });
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:1.5, h:1.22, fill:{color:w.color}, line:{color:w.color} });
    s.addText(w.name, { x:0.3, y:y+0.1, w:1.5, h:0.5, fontSize:17, color:WHT, fontFace:"Arial Black", bold:true, align:"center", margin:0 });
    s.addText(w.full, { x:0.3, y:y+0.6, w:1.5, h:0.45, fontSize:10, color:WHT, fontFace:"Calibri", align:"center", margin:0 });
    s.addText(`การเคลื่อนที่: ${w.motion}`, { x:1.95, y:y+0.1, w:5.5, h:0.38, fontSize:13, color:TEXT, fontFace:"Calibri", margin:0 });
    s.addText(`ความเร็ว: ${w.speed}`, { x:1.95, y:y+0.48, w:3.0, h:0.33, fontSize:12, color:TEXT2, fontFace:"Calibri", margin:0 });
    s.addShape(pres.shapes.RECTANGLE, { x:7.5, y:y+0.25, w:1.8, h:0.6, fill:{color:w.color}, line:{color:w.color} });
    s.addText(w.note, { x:7.5, y:y+0.25, w:1.8, h:0.6, fontSize:11, color:WHT, fontFace:"Calibri", bold:true, align:"center", valign:"middle", margin:0 });
  });
}

// 2.2 STA/LTA Algorithm
{
  const s = contentSlide(2, "2.2  อัลกอริทึม STA/LTA");

  // 3 concept cards top row
  const concepts = [
    { title:"Characteristic Function (CF)", body:"CF = (rawMag − smoothedMag)²\nวัดความเปลี่ยนแปลงกะทันหันของขนาดแรงสั่น", color:ORG },
    { title:"STA  (Short-Term Average)", body:"หน่วยความจำระยะสั้น\nตรวจจับ burst ฉับพลัน\nwindow: 0.3 s = 15 samples", color:GRN },
    { title:"LTA  (Long-Term Average)", body:"ฐาน baseline noise\nปรับตัวช้าๆ\nwindow: 30 s = 1500 samples", color:"2980B9" },
  ];
  concepts.forEach((c, i) => {
    const x = 0.3 + i * 3.2;
    s.addShape(pres.shapes.RECTANGLE, { x, y:0.85, w:2.9, h:1.65, fill:{color:CARD}, line:{color:MUT, width:1} });
    s.addShape(pres.shapes.RECTANGLE, { x, y:0.85, w:2.9, h:0.4, fill:{color:c.color}, line:{color:c.color} });
    s.addText(c.title, { x:x+0.1, y:0.85, w:2.7, h:0.4, fontSize:11, color:WHT, fontFace:"Calibri", bold:true, valign:"middle", margin:0 });
    s.addText(c.body, { x:x+0.1, y:1.3, w:2.7, h:1.15, fontSize:12, color:TEXT, fontFace:"Calibri", margin:0 });
  });

  // Ratio + trigger logic
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:2.65, w:9.1, h:0.55, fill:{color:CARD2}, line:{color:CARD2} });
  s.addText("Ratio = STA ÷ LTA", { x:0.5, y:2.68, w:2.8, h:0.45, fontSize:16, color:ORG, fontFace:"Calibri", bold:true, margin:0 });
  s.addText("ถ้า  Ratio ≥ 3.0  →  ตรวจพบเหตุการณ์  |  ถ้า  Ratio < 1.5  →  สัญญาณสงบลง", {
    x:3.2, y:2.68, w:6.0, h:0.45, fontSize:13, color:TEXT, fontFace:"Calibri", valign:"middle", margin:0
  });

  // Recursive EMA formula
  card(s, 0.3, 3.35, 9.1, 1.05, "สูตร Recursive EMA (ประหยัด RAM ไม่ต้องเก็บ buffer)", TEXT2);
  s.addText("STA(n) = α·CF(n) + (1−α)·STA(n−1)     โดย  α = 1 / (0.3 s × 50 Hz) = 0.0667",
    { x:0.5, y:3.78, w:8.9, h:0.38, fontSize:13, color:WHT, fontFace:"Calibri", margin:0 });
  s.addText("LTA ใช้รูปเดียวกัน  แต่ α เล็กกว่ามาก = 0.000667  (ปรับตัวช้ามาก)",
    { x:0.5, y:4.1, w:8.9, h:0.3, fontSize:12, color:TEXT2, fontFace:"Calibri", italic:true, margin:0 });
}

// 2.3 State Machine
{
  const s = contentSlide(2, "2.3  State Machine — 4 สถานะ");

  const states = [
    { name:"STANDBY", th:"เฝ้าระวัง", color:"2980B9", x:0.4,  y:1.05, desc:"LTA อัปเดตปกติ\nรอ ratio ≥ 3.0" },
    { name:"DETECTING", th:"กำลังตรวจ", color:ORG, x:3.2,  y:1.05, desc:"LTA อัปเดตช้า (bleed)\nนับ trigger samples" },
    { name:"ALARMING", th:"แจ้งเตือน", color:RED, x:6.0,  y:1.05, desc:"Buzzer ดัง\nรอ ratio < 1.5" },
    { name:"LOCKOUT", th:"พักเครื่อง", color:MUT, x:3.2,  y:3.15, desc:"ป้องกัน re-trigger\n5 วินาที" },
  ];
  states.forEach(st => {
    s.addShape(pres.shapes.RECTANGLE, { x:st.x, y:st.y, w:2.5, h:1.75, fill:{color:CARD}, line:{color:st.color, width:2} });
    s.addShape(pres.shapes.RECTANGLE, { x:st.x, y:st.y, w:2.5, h:0.45, fill:{color:st.color}, line:{color:st.color} });
    s.addText(st.name, { x:st.x+0.05, y:st.y+0.02, w:2.4, h:0.42, fontSize:14, color:WHT, fontFace:"Arial Black", bold:true, align:"center", valign:"middle", margin:0 });
    s.addText(st.th, { x:st.x+0.05, y:st.y+0.5, w:2.4, h:0.35, fontSize:12, color:TEXT2, fontFace:"Calibri", align:"center", margin:0 });
    s.addText(st.desc, { x:st.x+0.1, y:st.y+0.88, w:2.3, h:0.8, fontSize:12, color:TEXT, fontFace:"Calibri", margin:0 });
  });

  // Arrows labels
  const arrows = [
    { x:2.95, y:1.85, text:"ratio ≥ 3.0 →" },
    { x:5.75, y:1.85, text:"count ≥ 2 →" },
    { x:6.5,  y:3.1,  text:"ratio < 1.5 ↓" },
    { x:3.3,  y:4.7,  text:"← 5 s elapsed" },
  ];
  arrows.forEach(a => {
    s.addText(a.text, { x:a.x, y:a.y, w:2.5, h:0.35, fontSize:11, color:ORG, fontFace:"Calibri", bold:true, italic:true, align:"center", margin:0 });
  });
}

// 2.4 Hardware + STEAD
{
  const s = contentSlide(2, "2.4  Hardware และชุดข้อมูล");
  // hardware left
  card(s, 0.3, 0.85, 4.4, 3.5, "Hardware", RED);
  s.addText([
    { text: "Arduino Uno (ATmega328P)", options:{bold:true, breakLine:true} },
    { text: "  • โปรเซสเซอร์: 16 MHz, RAM 2 KB\n", options:{breakLine:true} },
    { text: "MPU6050 — MEMS 6-DOF IMU", options:{bold:true, breakLine:true} },
    { text: "  • Accelerometer ± 2g, Filter: 10 Hz\n", options:{breakLine:true} },
    { text: "Sampling Rate: 50 Hz (ทุก 20 ms)", options:{bold:true, breakLine:true} },
    { text: "Buzzer: Pin 9, beep pattern 150 ms\n", options:{breakLine:true} },
    { text: "Serial output: CF / STA / LTA / Ratio / State", options:{} },
  ], { x:0.45, y:1.32, w:4.1, h:2.9, fontSize:12, color:TEXT, fontFace:"Calibri", margin:0 });

  // STEAD right
  card(s, 5.0, 0.85, 4.4, 3.5, "STEAD Dataset", ORG);
  s.addText([
    { text: "STanford EArthquake Dataset", options:{bold:true, breakLine:true} },
    { text: "  • ข้อมูล seismogram จากสถานีทั่วโลก\n", options:{breakLine:true} },
    { text: "ข้อมูลที่ใช้ในโครงงาน:", options:{bold:true, breakLine:true} },
    { text: "  • P-wave: 100 samples\n  • Noise: 1 sample\n  • ความยาว: 250 points @ 50 Hz\n  • Onset: index 50 (วินาทีที่ 1.0)\n", options:{breakLine:true} },
    { text: "Pipeline:", options:{bold:true, breakLine:true} },
    { text: "  HDF5 → JSON → C header → Arduino", options:{} },
  ], { x:5.15, y:1.32, w:4.1, h:2.9, fontSize:12, color:TEXT, fontFace:"Calibri", margin:0 });
}

/* ═══════════════════════════════════════════
   บทที่ 3 — วิธีดำเนินการ
═══════════════════════════════════════════ */
chapterSlide(3, "วิธีดำเนินการ", "Methodology & System Development");

// 3.1 Pipeline
{
  const s = contentSlide(3, "3.1  ภาพรวม Data Pipeline");

  const steps = [
    { label:"STEAD\nHDF5", sub:"100 samples", color:MUT },
    { label:"extract_data.js\nNode.js", sub:"แปลงข้อมูล", color:"2980B9" },
    { label:"test_data.h\nseismoguard_data.json", sub:"C header / JSON", color:ORG },
    { label:"Arduino\nSimulation", sub:"simulation.ino", color:GRN },
    { label:"Browser\nDashboard", sub:"blackmystery.html", color:RED },
  ];
  const boxW = 1.55;
  const startX = 0.3;
  const y = 1.3;
  steps.forEach((st, i) => {
    const x = startX + i * 1.9;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w:boxW, h:1.4, fill:{color:CARD}, line:{color:st.color, width:2} });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w:boxW, h:0.38, fill:{color:st.color}, line:{color:st.color} });
    s.addText(st.label, { x:x+0.05, y:y+0.02, w:boxW-0.1, h:0.35, fontSize:10, color:WHT, fontFace:"Calibri", bold:true, align:"center", valign:"middle", margin:0 });
    s.addText(st.sub, { x:x+0.05, y:y+0.45, w:boxW-0.1, h:0.85, fontSize:11, color:TEXT, fontFace:"Calibri", align:"center", valign:"middle", margin:0 });
    if (i < steps.length - 1) {
      s.addText("→", { x:x+boxW+0.05, y:y+0.5, w:0.35, h:0.4, fontSize:18, color:TEXT2, fontFace:"Calibri", bold:true, align:"center", margin:0 });
    }
  });

  // parallel path note
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:2.9, w:9.1, h:0.55, fill:{color:CARD2}, line:{color:CARD2} });
  s.addText("ไฟล์ที่เกี่ยวข้องทั้งหมด:", { x:0.5, y:2.93, w:2.5, h:0.45, fontSize:13, color:TEXT2, fontFace:"Calibri", bold:true, margin:0 });
  s.addText("earthquake.ino.ino  |  simulation.ino.ino  |  blackmystery.html  |  seismoguard_data.json  |  param_test.js", {
    x:2.9, y:2.93, w:7.0, h:0.45, fontSize:12, color:TEXT, fontFace:"Calibri", margin:0
  });

  // Real hardware box
  card(s, 0.3, 3.6, 9.1, 1.6, "Real Hardware Path — earthquake.ino.ino", RED);
  s.addText("MPU6050 → readCF() → updateDetector() → manageAlarm() → Buzzer + Serial Plotter", {
    x:0.5, y:4.05, w:8.7, h:0.38, fontSize:13, color:TEXT, fontFace:"Calibri", margin:0
  });
  s.addText("Calibration: 300 samples warm-up → baseline LTA → begin monitoring", {
    x:0.5, y:4.42, w:8.7, h:0.35, fontSize:12, color:TEXT2, fontFace:"Calibri", italic:true, margin:0
  });
}

// 3.2 Algorithm Implementation
{
  const s = contentSlide(3, "3.2  การพัฒนา Firmware Arduino");

  s.addText("readCF()  —  คำนวณ Characteristic Function", { x:0.3, y:0.82, w:9.1, h:0.4, fontSize:14, color:ORG, fontFace:"Calibri", bold:true, margin:0 });
  card(s, 0.3, 1.2, 9.1, 0.85, null, null);
  s.addText([
    { text: "rawMag = √(ax² + ay² + az²)", options:{bold:true} },
    { text: "   →   delta = |rawMag − smoothedMag|   →   CF = delta²", options:{} }
  ], { x:0.5, y:1.25, w:8.7, h:0.5, fontSize:13, color:TEXT, fontFace:"Calibri", valign:"middle", margin:0 });
  s.addText("smoothedMag อัปเดตด้วย EMA (α = 0.05) — ตรวจเฉพาะ การเปลี่ยนแปลง ไม่ใช่ขนาดสัมบูรณ์", {
    x:0.5, y:1.72, w:8.7, h:0.28, fontSize:11, color:TEXT2, fontFace:"Calibri", italic:true, margin:0
  });

  s.addText("Spike Rejection  —  ป้องกัน noise กระชาก", { x:0.3, y:2.15, w:9.1, h:0.4, fontSize:14, color:RED, fontFace:"Calibri", bold:true, margin:0 });
  card(s, 0.3, 2.53, 9.1, 0.65, null, null);
  s.addText("if (CF > 50 × LTA)  →  CF = 50 × LTA    // จำกัดไม่ให้ spike เดียวทำ LTA เสีย", {
    x:0.5, y:2.6, w:8.7, h:0.45, fontSize:13, color:TEXT, fontFace:"Calibri", margin:0
  });

  s.addText("Buzzer Pattern  —  ALARMING State", { x:0.3, y:3.33, w:9.1, h:0.4, fontSize:14, color:GRN, fontFace:"Calibri", bold:true, margin:0 });
  card(s, 0.3, 3.7, 9.1, 1.0, null, null);
  s.addText([
    { text: "Beep cycle: 150 ms  |  ON: 75 ms  |  OFF: 75 ms", options:{breakLine:true} },
    { text: "Alarm window: 3,000 ms  →  Lockout: 5,000 ms  →  กลับ STANDBY", options:{} }
  ], { x:0.5, y:3.75, w:8.7, h:0.88, fontSize:13, color:TEXT, fontFace:"Calibri", margin:0 });
}

// 3.3 Browser Dashboard
{
  const s = contentSlide(3, "3.3  Browser Dashboard — blackmystery.html");

  const features = [
    { icon:"■", title:"Waveform Chart", desc:"แสดง raw signal + CF ทุก sample ใน real-time พร้อมระบุจุด onset" },
    { icon:"■", title:"STA/LTA Ratio Chart", desc:"เส้น ratio เทียบกับ threshold line 3.0 และ 1.5" },
    { icon:"■", title:"State Indicator", desc:"แสดง STANDBY / DETECTING / ALARMING / LOCKOUT แบบ live" },
    { icon:"■", title:"Parameter Sliders", desc:"ปรับ STA window, TRIG ratio, MIN trigs, SPIKE reject ได้ทันที" },
    { icon:"■", title:"Dataset Selector", desc:"เลือก P-wave sample 1–100 หรือ Noise จาก STEAD dataset" },
  ];
  features.forEach((f, i) => {
    const y = 0.88 + i * 0.88;
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:9.1, h:0.72, fill:{color:CARD}, line:{color:MUT, width:1} });
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:0.08, h:0.72, fill:{color:RED}, line:{color:RED} });
    s.addText(f.title, { x:0.5, y:y+0.06, w:2.8, h:0.34, fontSize:13, color:WHT, fontFace:"Calibri", bold:true, margin:0 });
    s.addText(f.desc, { x:0.5, y:y+0.38, w:8.7, h:0.28, fontSize:12, color:TEXT2, fontFace:"Calibri", margin:0 });
  });
}

// 3.4 Grid Search
{
  const s = contentSlide(3, "3.4  การหาค่า Parameter ด้วย Grid Search");

  s.addText("ทดสอบ 225 ชุดค่า × 101 ชุดข้อมูล (100 P-wave + 1 Noise) = 22,725 การจำลอง", {
    x:0.3, y:0.82, w:9.4, h:0.42, fontSize:13, color:ORG, fontFace:"Calibri", bold:true, margin:0
  });

  // Grid table
  const gridParams = [
    ["Parameter", "ค่าที่ทดสอบ", "จำนวน"],
    ["STA_WINDOW_SEC", "0.3 / 0.4 / 0.5 s", "3"],
    ["RATIO_TRIGGER", "3.0 / 3.5 / 4.0 / 4.5 / 5.0", "5"],
    ["MIN_TRIGGER_SAMPLES", "2 / 3 / 5 / 8 / 10", "5"],
    ["SPIKE_REJECT_FACTOR", "20 / 50 / 100", "3"],
  ];
  const headerStyle = { fill: { color: RED2 }, color: WHT, bold: true, fontFace:"Calibri", fontSize: 12 };
  const rowStyle = { fill: { color: CARD }, color: TEXT, fontFace:"Calibri", fontSize: 12 };
  const tableData = gridParams.map((row, ri) =>
    row.map(cell => ({ text: cell, options: ri === 0 ? headerStyle : rowStyle }))
  );
  s.addTable(tableData, { x:0.3, y:1.35, w:9.1, h:1.95, border:{pt:1, color:MUT}, colW:[3.5, 4.2, 1.4] });

  // Score formula
  card(s, 0.3, 3.45, 9.1, 1.45, "สูตรคะแนน — อ้างอิง F-beta Score (β = 2)", ORG);
  s.addText("Score = (DetRate × 60) − (AvgDelay/250 × 10) − (FalseAlarm × 15)", {
    x:0.5, y:3.88, w:8.7, h:0.38, fontSize:13, color:WHT, fontFace:"Calibri", margin:0
  });
  s.addText("น้ำหนัก: Detection 60  |  FalseAlarm 15 = 60/β²  |  Delay 10   →   Miss แย่กว่า False Alarm 4 เท่า (β² = 4)", {
    x:0.5, y:4.24, w:8.7, h:0.3, fontSize:12, color:TEXT2, fontFace:"Calibri", italic:true, margin:0
  });
  s.addText("อ้างอิง: F-score (Wikipedia) · Springer EEW Decision Theory · USGS ShakeAlert Performance Standard", {
    x:0.5, y:4.54, w:8.7, h:0.28, fontSize:10, color:MUT, fontFace:"Calibri", italic:true, margin:0
  });
}

/* ═══════════════════════════════════════════
   บทที่ 4 — ผลการดำเนินงาน
═══════════════════════════════════════════ */
chapterSlide(4, "ผลการดำเนินงาน", "Results & Performance Evaluation");

// 4.1 Grid Search Results
{
  const s = contentSlide(4, "4.1  ผลลัพธ์ Grid Search — Top 10");
  s.addText("ผลการทดสอบ 225 ชุดค่า เรียงตามคะแนน (สูง → ต่ำ):", {
    x:0.3, y:0.82, w:9.1, h:0.38, fontSize:13, color:TEXT2, fontFace:"Calibri", margin:0
  });

  const top10 = [
    ["อันดับ","STA (s)","TRIG","MIN","SPIKE","Detect","Avg Delay","Noise FA","Score"],
    ["1 ★", "0.3","3.0","2","50","100%","8.3","ไม่มี","59.67"],
    ["2",   "0.3","3.0","2","100","100%","8.3","ไม่มี","59.67"],
    ["3",   "0.3","3.0","2","20","100%","8.4","ไม่มี","59.66"],
    ["4",   "0.4","3.0","2","50","100%","9.1","ไม่มี","59.64"],
    ["5",   "0.4","3.0","2","100","100%","9.1","ไม่มี","59.64"],
    ["6",   "0.3","3.0","3","50","100%","9.2","ไม่มี","59.63"],
    ["7",   "0.3","3.0","3","100","100%","9.2","ไม่มี","59.63"],
    ["8",   "0.3","3.0","3","20","100%","9.4","ไม่มี","59.62"],
    ["9",   "0.4","3.0","2","20","100%","9.5","ไม่มี","59.62"],
    ["10",  "0.3","3.5","2","50","100%","9.5","ไม่มี","59.62"],
  ];
  const hdr = { fill:{color:RED2}, color:WHT, bold:true, fontFace:"Calibri", fontSize:11 };
  const cel = { fill:{color:CARD}, color:TEXT, fontFace:"Calibri", fontSize:11 };
  const top1 = { fill:{color:RED2}, color:WHT, bold:true, fontFace:"Calibri", fontSize:11 };
  const tdata = top10.map((row, ri) =>
    row.map(cell => ({ text: String(cell), options: ri === 0 ? hdr : (ri === 1 ? top1 : cel) }))
  );
  s.addTable(tdata, {
    x:0.3, y:1.28, w:9.1, h:3.85,
    border:{pt:1, color:MUT},
    colW:[0.8,0.7,0.7,0.6,0.7,0.85,1.1,0.95,0.8]
  });
}

// 4.2 Best Parameters + Performance
{
  const s = contentSlide(4, "4.2  ค่า Parameter ที่ดีที่สุดและประสิทธิภาพ");

  // 3 stat boxes
  statBox(s, 0.4, 0.88, "100%", "Detection Rate\n(100 / 100 samples)");
  statBox(s, 3.6, 0.88, "166 ms", "Avg Detection Delay\n(8.3 samples หลัง onset)");
  statBox(s, 6.8, 0.88, "0", "False Alarm\nบน noise sample");

  // Parameter summary card
  card(s, 0.4, 2.5, 9.0, 1.5, "Best Parameters — ใช้กับทุกไฟล์", ORG);
  const params = [
    ["STA_WINDOW_SEC", "0.3 f", "window 15 samples — ตอบสนองเร็ว"],
    ["RATIO_TRIGGER",  "3.0 f", "threshold พอดี — ไม่ trigger noise แต่จับ P-wave ครบ"],
    ["MIN_TRIGGER_SAMPLES", "2", "ยืนยัน 2 ครั้งติดต่อ (40 ms) — ป้องกัน single spike"],
    ["SPIKE_REJECT_FACTOR", "50.0 f", "กรอง spike สูงกว่า 50×LTA ออก"],
  ];
  params.forEach((p, i) => {
    const y = 2.97 + i * 0.24;
    s.addText(`${p[0]}  =  ${p[1]}`, { x:0.6, y, w:3.8, h:0.22, fontSize:12, color:WHT, fontFace:"Calibri", bold:true, margin:0 });
    s.addText(`// ${p[2]}`, { x:4.4, y, w:5.0, h:0.22, fontSize:11, color:TEXT2, fontFace:"Calibri", italic:true, margin:0 });
  });
}

// 4.3 Before/After Comparison
{
  const s = contentSlide(4, "4.3  เปรียบเทียบก่อน / หลัง Grid Search");

  const rows = [
    ["Parameter", "earthquake.ino\n(เดิม)", "simulation.ino\n(เดิม)", "หลัง Grid Search", "เปลี่ยน?"],
    ["STA_WINDOW_SEC", "0.5 f", "0.3 f", "0.3 f", "real ✓"],
    ["RATIO_TRIGGER", "3.0 f", "4.0 f", "3.0 f", "sim ✓"],
    ["MIN_TRIGGER_SAMPLES", "50", "3", "2", "ทั้งคู่ ✓"],
    ["SPIKE_REJECT_FACTOR", "20.0 f", "100.0 f", "50.0 f", "ทั้งคู่ ✓"],
  ];
  const hdr = { fill:{color:RED2}, color:WHT, bold:true, fontFace:"Calibri", fontSize:12 };
  const cel = { fill:{color:CARD}, color:TEXT, fontFace:"Calibri", fontSize:12 };
  const newCol = { fill:{color:"1A3A1A"}, color:GRN, bold:true, fontFace:"Calibri", fontSize:12 };
  const tdata = rows.map((row, ri) =>
    row.map((cell, ci) => ({
      text: cell,
      options: ri === 0 ? hdr : (ci === 3 ? newCol : cel)
    }))
  );
  s.addTable(tdata, { x:0.3, y:0.85, w:9.1, h:2.4, border:{pt:1, color:MUT}, colW:[2.8,1.65,1.65,1.65,1.35] });

  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:3.4, w:9.1, h:1.8, fill:{color:CARD2}, line:{color:MUT, width:1} });
  s.addText("ผลกระทบของการเปลี่ยนแปลง:", { x:0.5, y:3.5, w:9.0, h:0.35, fontSize:13, color:ORG, fontFace:"Calibri", bold:true, margin:0 });
  s.addText([
    { text: "• MIN 50 → 2: ลด latency จาก >1 วินาที เป็น 40 ms — ไม่พลาด burst สั้น\n", options:{breakLine:true} },
    { text: "• SPIKE 20 → 50: รับ P-wave แรงได้ โดยยังกรอง electrical spike ออก\n", options:{breakLine:true} },
    { text: "• RATIO 4 → 3 (sim): ตรวจจับ sample ที่ amplitude ต่ำได้ครบ 100%", options:{} },
  ], { x:0.5, y:3.88, w:8.7, h:1.2, fontSize:13, color:TEXT, fontFace:"Calibri", margin:0 });
}

// 4.4 Physical Test
{
  const s = contentSlide(4, "4.4  การทดสอบกับเครื่องจำลองแผ่นดินไหว");

  card(s, 0.3, 0.85, 4.4, 3.5, "กลไกข้อเหวี่ยง", ORG);
  s.addText([
    { text: "• แปลงการหมุน → การเคลื่อนที่เส้นตรง", options:{breakLine:true} },
    { text: "• ได้คลื่น sinusoidal ในแนวแกนเดียว", options:{breakLine:true} },
    { text: "• = P-Wave (longitudinal) โดยธรรมชาติ", options:{breakLine:true} },
    { text: "\nความถี่ที่แนะนำ:", options:{bold:true, breakLine:true} },
    { text: "  2–5 Hz (120–300 RPM)", options:{breakLine:true} },
    { text: "  → อยู่ใน MPU6050 filter range\n  → STA window 0.3s จับได้ ~1 รอบ", options:{} },
  ], { x:0.45, y:1.32, w:4.1, h:2.95, fontSize:13, color:TEXT, fontFace:"Calibri", margin:0 });

  card(s, 5.0, 0.85, 4.4, 3.5, "วิธีทดสอบ", GRN);
  s.addText([
    { text: "ขั้นตอน:", options:{bold:true, breakLine:true} },
    { text: "1. เปิด Arduino — รอ 30 วินาที (LTA warm-up)", options:{breakLine:true} },
    { text: "2. เปิดมอเตอร์ข้อเหวี่ยงทันที", options:{breakLine:true} },
    { text: "3. STA พุ่งสูงขึ้นฉับพลัน", options:{breakLine:true} },
    { text: "4. ratio > 3.0 → DETECTING → ALARMING", options:{breakLine:true} },
    { text: "5. Buzzer ดัง + Serial แสดงผล\n", options:{breakLine:true} },
    { text: "ผลที่คาดหวัง:", options:{bold:true, breakLine:true} },
    { text: "  ระบบ trigger ได้ใน < 200 ms\n  หลังเครื่องเริ่มสั่น", options:{} },
  ], { x:5.15, y:1.32, w:4.1, h:2.95, fontSize:13, color:TEXT, fontFace:"Calibri", margin:0 });
}

/* ═══════════════════════════════════════════
   บทที่ 5 — สรุปและอภิปราย
═══════════════════════════════════════════ */
chapterSlide(5, "สรุปและอภิปรายผล", "Conclusion & Discussion");

// 5.1 สรุปผล
{
  const s = contentSlide(5, "5.1  สรุปผล");
  const results = [
    { num:"01", color:GRN, title:"ตรวจจับได้ 100%", body:"ระบบ STA/LTA ตรวจจับ P-Wave ได้ครบ 100 จาก 100 samples จาก STEAD Dataset" },
    { num:"02", color:ORG, title:"ตอบสนองเร็ว 166 ms", body:"เฉลี่ย 8.3 samples หลัง P-wave onset ที่ 50 Hz — เพียงพอสำหรับการเตือนภัยล่วงหน้า" },
    { num:"03", color:"2980B9", title:"ไม่มี False Alarm", body:"ชุดค่า parameter ที่เลือกไม่ trigger บน noise sample เลย — ความน่าเชื่อถือสูง" },
    { num:"04", color:RED, title:"ค่า Parameter สม่ำเสมอ", body:"ไฟล์ทั้ง 3 (firmware, simulation, browser) ใช้ค่าเดียวกัน — ผลทดสอบสะท้อนพฤติกรรมจริง" },
  ];
  results.forEach((r, i) => {
    const y = 0.88 + i * 1.12;
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:9.1, h:0.95, fill:{color:CARD}, line:{color:MUT, width:1} });
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:0.65, h:0.95, fill:{color:r.color}, line:{color:r.color} });
    s.addText(r.num, { x:0.3, y, w:0.65, h:0.95, fontSize:20, color:WHT, fontFace:"Arial Black", bold:true, align:"center", valign:"middle", margin:0 });
    s.addText(r.title, { x:1.1, y:y+0.1, w:3.0, h:0.35, fontSize:14, color:WHT, fontFace:"Calibri", bold:true, margin:0 });
    s.addText(r.body, { x:1.1, y:y+0.48, w:8.1, h:0.42, fontSize:12, color:TEXT2, fontFace:"Calibri", margin:0 });
  });
}

// 5.2 ข้อจำกัด
{
  const s = contentSlide(5, "5.2  ข้อจำกัดและอภิปรายผล");

  const limits = [
    { icon:"⚠", color:RED, title:"Sensitivity ของ MEMS ต่ำ", desc:"MPU6050 มี noise floor สูงกว่า seismometer จริงมาก อาจพลาด micro-earthquake (M < 3)" },
    { icon:"⚠", color:ORG, title:"ทดสอบ In-Silico เท่านั้น", desc:"ข้อมูล STEAD คือ waveform ที่บันทึกไว้ — ยังไม่ได้ทดสอบกับ ground motion จริงในสนาม" },
    { icon:"⚠", color:"2980B9", title:"LTA ต้องการ Warm-Up 30 วินาที", desc:"ก่อนระบบพร้อม baseline ต้องนิ่งนาน 30 วินาที — ไม่เหมาะกับการ reboot บ่อย" },
    { icon:"⚠", color:MUT, title:"1 แกน vs 3 แกน", desc:"เครื่องข้อเหวี่ยงสั่น 1 แกน แต่แผ่นดินไหวจริงมี component ทุกแกน — ต้องใช้ vector magnitude" },
  ];
  limits.forEach((l, i) => {
    const y = 0.88 + i * 1.12;
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:9.1, h:0.95, fill:{color:CARD}, line:{color:l.color, width:1.5} });
    s.addText(l.title, { x:0.55, y:y+0.1, w:8.6, h:0.35, fontSize:13, color:WHT, fontFace:"Calibri", bold:true, margin:0 });
    s.addText(l.desc, { x:0.55, y:y+0.48, w:8.6, h:0.4, fontSize:12, color:TEXT2, fontFace:"Calibri", margin:0 });
  });
}

// 5.3 แนวทางพัฒนาต่อ
{
  const s = contentSlide(5, "5.3  แนวทางพัฒนาต่อ");

  const next = [
    { num:"01", color:GRN,    title:"เพิ่ม Wi-Fi (ESP32)", desc:"ส่ง alert ผ่าน LINE Notify / MQTT ให้ผู้ใช้ได้รับการแจ้งเตือนบนมือถือ" },
    { num:"02", color:ORG,    title:"เพิ่ม Machine Learning", desc:"ใช้ CNN / LSTM onset picker จาก PhaseNet เพื่อความแม่นยำสูงกว่า STA/LTA" },
    { num:"03", color:"2980B9",title:"Sensor ระดับสูงขึ้น", desc:"เปลี่ยนเป็น geophone หรือ ADXL355 (noise floor ต่ำกว่า 100×) เพื่อจับ M < 3" },
    { num:"04", color:RED,    title:"Field Test จริง", desc:"ติดตั้งที่จริงในพื้นที่เสี่ยง เก็บข้อมูลเปรียบเทียบกับสถานีอ้างอิง TMD/USGS" },
  ];
  next.forEach((n, i) => {
    const y = 0.88 + i * 1.1;
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:9.1, h:0.92, fill:{color:CARD}, line:{color:MUT, width:1} });
    s.addShape(pres.shapes.RECTANGLE, { x:0.3, y, w:0.65, h:0.92, fill:{color:n.color}, line:{color:n.color} });
    s.addText(n.num, { x:0.3, y, w:0.65, h:0.92, fontSize:20, color:WHT, fontFace:"Arial Black", bold:true, align:"center", valign:"middle", margin:0 });
    s.addText(n.title, { x:1.1, y:y+0.08, w:3.2, h:0.35, fontSize:13, color:WHT, fontFace:"Calibri", bold:true, margin:0 });
    s.addText(n.desc, { x:1.1, y:y+0.46, w:8.1, h:0.4, fontSize:12, color:TEXT2, fontFace:"Calibri", margin:0 });
  });
}

/* ═══════════════════════════════════════════
   CLOSING SLIDE
═══════════════════════════════════════════ */
{
  const s = pres.addSlide();
  s.background = { color: BG };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.18, h:5.625, fill:{color:RED}, line:{color:RED} });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:4.8, w:10, h:0.825, fill:{color:CARD2}, line:{color:CARD2} });
  s.addShape(pres.shapes.RECTANGLE, { x:0.4, y:2.6, w:3.5, h:0.04, fill:{color:RED2}, line:{color:RED2} });
  s.addText("ขอบคุณครับ / ค่ะ", { x:0.4, y:1.4, w:9, h:1.0, fontSize:48, color:WHT, fontFace:"Arial Black", bold:true, margin:0 });
  s.addText("Thank You", { x:0.4, y:2.4, w:9, h:0.5, fontSize:22, color:TEXT2, fontFace:"Calibri", italic:true, margin:0 });
  s.addText("SeismoGuard — Arduino P-Wave Detector  |  STA/LTA Algorithm  |  STEAD Dataset  |  100% Detection Rate", {
    x:0.4, y:4.88, w:9.3, h:0.38, fontSize:11, color:TEXT2, fontFace:"Calibri", margin:0
  });
}

/* ═══════════════════════════════════════════
   WRITE
═══════════════════════════════════════════ */
const OUT = "C:/Users/Lenovo/Claude_Home/Earthquake/SeismoGuard_Presentation.pptx";
pres.writeFile({ fileName: OUT }).then(() => {
  console.log("✓ Saved:", OUT);
}).catch(e => { console.error(e); process.exit(1); });
