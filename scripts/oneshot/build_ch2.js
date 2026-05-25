const fs = require('fs');

// Helper: paragraph with indent firstLine=720, thaiDistribute (body text)
function body(text, bold=false) {
  const bTag = bold ? '<w:b/><w:bCs/>' : '';
  return `    <w:p w14:paraId="CF${Math.floor(Math.random()*0xFFFFF).toString(16).padStart(5,'0')}" w14:textId="77777777" w:rsidR="00CF0001" w:rsidRDefault="00CF0001" w:rsidP="005B123C">
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
          ${bTag}
          <w:noProof/>
          <w:szCs w:val="32"/>
          <w:cs/>
        </w:rPr>
        <w:t xml:space="preserve">${text}</w:t>
      </w:r>
    </w:p>`;
}

// Section heading 2.2.x
function secHead(num, title) {
  return `    <w:p w14:paraId="CF${Math.floor(Math.random()*0xFFFFF).toString(16).padStart(5,'0')}" w14:textId="77777777" w:rsidR="00CF0001" w:rsidRDefault="00CF0001" w:rsidP="005B123C">
      <w:pPr>
        <w:ind w:firstLine="720"/>
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
          <w:noProof/>
          <w:sz w:val="36"/>
          <w:szCs w:val="36"/>
          <w:cs/>
        </w:rPr>
        <w:t xml:space="preserve">${num} ${title}</w:t>
      </w:r>
    </w:p>`;
}

// Paper heading line (researcher name label bold)
function paperHead(label) {
  return `    <w:p w14:paraId="CF${Math.floor(Math.random()*0xFFFFF).toString(16).padStart(5,'0')}" w14:textId="77777777" w:rsidR="00CF0001" w:rsidRDefault="00CF0001" w:rsidP="005B123C">
      <w:pPr>
        <w:ind w:firstLine="720"/>
        <w:jc w:val="thaiDistribute"/>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:b/>
          <w:bCs/>
          <w:noProof/>
          <w:szCs w:val="32"/>
        </w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:cs="TH Sarabun New"/>
          <w:b/>
          <w:bCs/>
          <w:noProof/>
          <w:szCs w:val="32"/>
          <w:cs/>
        </w:rPr>
        <w:t xml:space="preserve">${label}</w:t>
      </w:r>
    </w:p>`;
}

const parts = [];

// ──────────────────────────────────────────────────────────
// 2.2.1 งานวิจัยในประเทศ
// ──────────────────────────────────────────────────────────
parts.push(secHead('2.2.1', 'งานวิจัยในประเทศ'));

parts.push(body('ผู้จัดทำได้ทบทวนงานวิจัยที่เกี่ยวข้องกับแผ่นดินไหวในประเทศไทย การพัฒนาระบบเตือนภัย และการประเมินความเสี่ยงในพื้นที่ภาคเหนือ โดยคัดเลือกงานวิจัยที่มีความเกี่ยวข้องโดยตรงกับการออกแบบและตรวจสอบความถูกต้องของโครงงานนี้ ดังนี้'));

// Paper TH-1 ─ มาณพ เจริญยุทธ et al.
parts.push(paperHead('งานวิจัยที่ 1: เจริญยุทธ, ม. และคณะ (2550)'));
parts.push(body('เจริญยุทธ ม. และคณะ (2550) ได้ทำการศึกษาวิจัยเรื่อง การรวบรวมและวิเคราะห์คลื่นแผ่นดินไหวในประเทศไทย สำนักงานกองทุนสนับสนุนการวิจัย (สกว.) ซึ่งงานวิจัยนี้มีวัตถุประสงค์เพื่อรวบรวมและศึกษาคลื่นแผ่นดินไหวที่เกิดขึ้นในประเทศไทยอย่างเป็นระบบ เนื่องจากก่อนหน้านี้ยังไม่มีการรวบรวมข้อมูลอัตราเร่งภาคพื้นดินอย่างครบถ้วน'));
parts.push(body('การศึกษานี้ได้รวบรวมบันทึกการสั่นไหวของพื้นดินจากกรมอุตุนิยมวิทยา พร้อมกับการติดตั้งเครื่องตรวจวัดคลื่นแผ่นดินไหวระบบดิจิทัลใหม่จำนวน 15 สถานีในปี พ.ศ. 2549 ซึ่งสามารถดึงข้อมูลผ่านอินเทอร์เน็ตได้ จากนั้นได้นำข้อมูลไปวิเคราะห์หาสมการลดทอนคลื่นแผ่นดินไหว (Attenuation Equation) ที่เหมาะสมกับสภาพธรณีวิทยาของประเทศไทย และจัดทำสเปกตรัมเพื่อการออกแบบโครงสร้างต้านแผ่นดินไหว'));
parts.push(body('จากงานวิจัยพบว่า พื้นที่ภาคเหนือและภาคตะวันตกมีระดับอันตรายแผ่นดินไหวสูงที่สุดในประเทศ โดยมีโอกาส 10% ที่จะเกิดความเร่งภาคพื้นดิน 0.1-0.4 g ในช่วง 50 ปี โครงงานนี้จึงนำข้อมูลดังกล่าวมาอ้างอิงเพื่อแสดงถึงความจำเป็นของระบบเตือนภัยแผ่นดินไหวในพื้นที่เสี่ยงสูง'));

// Paper TH-2 ─ Pananont et al. (2017) JGR
parts.push(paperHead('งานวิจัยที่ 2: Pananont และคณะ (2560)'));
parts.push(body('Pananont, P., Herman, M. W., Pornsopin, P., Furlong, K. P., Habangkaem, S., Waldhauser, F., and Wechbunthung, B. (2017) ได้ทำการศึกษาวิจัยเรื่อง Seismotectonics of the 2014 Chiang Rai, Thailand, earthquake sequence ตีพิมพ์ใน Journal of Geophysical Research: Solid Earth, 122(8), 6367-6388 โดย American Geophysical Union งานวิจัยนี้มีวัตถุประสงค์เพื่อวิเคราะห์กลไกและโครงสร้างการแตกตัวของแผ่นดินไหว Mw 6.2 Mae Lao (เชียงราย) ที่เกิดขึ้นเมื่อวันที่ 5 พฤษภาคม 2557 ซึ่งเป็นแผ่นดินไหวรุนแรงที่สุดที่เกิดขึ้นในประเทศไทยในรอบหลายสิบปี'));
parts.push(body('ทีมวิจัยได้ดำเนินการจำแนกตำแหน่งศูนย์กลางแผ่นดินไหวหลักและอาฟเตอร์ช็อคอย่างแม่นยำด้วยวิธี waveform cross-correlation คำนวณ regional moment tensor ของเหตุการณ์สำคัญ บันทึกและวิเคราะห์ปรากฏการณ์ liquefaction และ ground failure และสร้างแบบจำลองการถ่ายโอนความเค้น (Coulomb stress transfer) เพื่ออธิบายรูปแบบการเกิดอาฟเตอร์ช็อค ผลการศึกษาพบว่าแผ่นดินไหวหลักมีกลไกการแตกตัวแบบ right-lateral strike-slip บนระนาบรอยเลื่อนแนว NNW-SSE ซึ่งอยู่ในแนว Phayao Fault Zone'));
parts.push(body('จากงานวิจัยพบว่า ลำดับเหตุการณ์แผ่นดินไหวเชียงรายปี 2557 แสดงให้เห็นว่าพื้นที่ภาคเหนือของไทยมีรอยเลื่อนมีพลังซ่อนอยู่ใต้ดินซึ่งยังไม่ถูกทำแผนที่ครบถ้วน ทำให้ความเสี่ยงต่อแผ่นดินไหวรุนแรงในพื้นที่นี้มีสูงกว่าที่ประเมินไว้ โครงงานนี้จึงนำงานวิจัยชิ้นนี้มาสนับสนุนเหตุผลความจำเป็นของการพัฒนาระบบเตือนภัยแผ่นดินไหวล่วงหน้าที่ตรวจจับ P-wave ได้จริง'));

// Paper TH-3 ─ Chiang Rai community EEW (existing)
parts.push(paperHead('งานวิจัยที่ 3: ผู้วิจัย (2564) นวัตกรรมเตือนภัยแผ่นดินไหวชุมชน'));
parts.push(body('งานวิจัยเรื่อง นวัตกรรมเพื่อการแจ้งเตือนภัยพิบัติแผ่นดินไหวของชุมชนในพื้นที่เสี่ยง จังหวัดเชียงราย ซึ่งตีพิมพ์ในวารสารวิชาการระดับชาติด้านวิทยาศาสตร์และเทคโนโลยีของไทย งานวิจัยนี้มีวัตถุประสงค์เพื่อพัฒนาเครื่องเตือนแผ่นดินไหวที่ควบคุมด้วยระบบสมองกลฝังตัว สำหรับชุมชนในจังหวัดเชียงรายซึ่งเป็นพื้นที่เสี่ยงภัยแผ่นดินไหวสูง'));
parts.push(body('คณะนักวิจัยได้พัฒนาเครื่องเตือนแผ่นดินไหวที่ใช้ระบบสมองกลฝังตัวเป็นตัวประมวลผล พร้อมทดสอบการทำงานและประสิทธิภาพโดยเปรียบเทียบกับระบบแจ้งเตือนแผ่นดินไหวมาตรฐานที่ศูนย์เฝ้าระวังแผ่นดินไหว อำเภอพาน จังหวัดเชียงราย ผลการศึกษาพบว่าเครื่องเตือนที่พัฒนาขึ้นสามารถทำงานได้อย่างมีประสิทธิภาพ โดยมีความถูกต้องและแม่นยำมากกว่าร้อยละ 80'));
parts.push(body('จากงานวิจัยพบว่า ระบบการทำงานแบบโดดเดี่ยว (standalone) มีข้อจำกัดในด้านความครอบคลุมพื้นที่ จึงมีข้อเสนอแนะให้พัฒนาต่อยอดโดยเชื่อมต่อหลายจุดเป็นโครงข่าย และเชื่อมต่ออินเทอร์เน็ตเพื่อแสดงผลบนเว็บไซต์ โครงงานนี้จึงนำแนวทางดังกล่าวมาใช้เป็นฐานในการออกแบบระบบเตือนภัย โดยเพิ่มการทดสอบด้วยชุดข้อมูลมาตรฐาน STEAD และการหาค่าพารามิเตอร์ที่เหมาะสมด้วย Grid Search'));

// ──────────────────────────────────────────────────────────
// 2.2.2 งานวิจัยต่างประเทศ
// ──────────────────────────────────────────────────────────
parts.push(secHead('2.2.2', 'งานวิจัยต่างประเทศ'));

parts.push(body('ผู้จัดทำได้ทบทวนงานวิจัยต่างประเทศที่เกี่ยวข้องกับอัลกอริทึมตรวจจับ P-wave อุปกรณ์ IoT ต้นทุนต่ำ ชุดข้อมูลมาตรฐาน และระบบเตือนภัยแบบพกพา ดังนี้'));

// Paper FN-1 ─ Won & Park 2020 BLESeis
parts.push(paperHead('งานวิจัยที่ 4: Won, T. and Park, S. (2020)'));
parts.push(body('Won, T. and Park, S. (2020) ได้ทำการศึกษาวิจัยเรื่อง BLESeis: Low-Cost IoT Sensor for Smart Earthquake Detection and Notification ตีพิมพ์ใน Sensors, 20(10), 2963 โดย MDPI งานวิจัยนี้มีวัตถุประสงค์เพื่อพัฒนาเซ็นเซอร์ IoT ต้นทุนต่ำสำหรับตรวจจับแผ่นดินไหวและแจ้งเตือนผ่าน Bluetooth Low Energy (BLE) โดยไม่ต้องพึ่งพาโครงสร้างพื้นฐานอินเทอร์เน็ต'));
parts.push(body('ระบบ BLESeis ประกอบด้วย 3 ส่วนหลัก ได้แก่ (1) การตรวจวัดแรงสั่นสะเทือนความเที่ยงสูงด้วยเซ็นเซอร์ MEMS LIS3DHH (sampling rate 1,100 Hz, noise density 0.2 mg) (2) อัลกอริทึมตรวจจับแผ่นดินไหวแบบ Embedded ซึ่งใช้ STA/LTA trigger (STA=50 ms, LTA=1,000 ms, threshold=1.3) ร่วมกับ low-pass filter และ decimation และ (3) ส่ง beacon แจ้งเตือนผ่าน BLE ไปยังสมาร์ตโฟน'));
parts.push(body('ผลการทดลองแสดงให้เห็นว่า BLESeis สามารถตรวจจับแผ่นดินไหวได้ด้วยความแม่นยำ 100% และจำแนกได้ถูกต้อง 100% จากงานวิจัยนี้พบว่า STA/LTA algorithm ที่ใช้กับเซ็นเซอร์ MEMS ราคาถูกสามารถให้ผลลัพธ์ที่น่าเชื่อถือได้ โครงงานนี้จึงนำแนวทางการใช้ STA/LTA แบบ Embedded มาปรับใช้กับ Arduino Uno และ MPU6050 แทน LIS3DHH เพื่อลดต้นทุนให้ต่ำลงอีก'));

// Paper FN-2 ─ Sianturi et al. 2024 Arduino MPU6050
parts.push(paperHead('งานวิจัยที่ 5: Sianturi, R. และคณะ (2567)'));
parts.push(body('Sianturi, R., Hamdani, H., and Risdianto, E. (2024) ได้ทำการศึกษาวิจัยเรื่อง Design an Earthquake Early Warning System Based on Arduino Uno Microcontroller with Accelerometer-MPU6050 sensor and NodeMCU-ESP8266 ตีพิมพ์ใน Asian Journal of Science Education, 6(1), 46-56 งานวิจัยนี้มีวัตถุประสงค์เพื่อพัฒนาระบบเตือนภัยแผ่นดินไหวสำหรับอินโดนีเซียโดยใช้ไมโครคอนโทรลเลอร์ Arduino Uno ร่วมกับเซ็นเซอร์ MPU6050 และ NodeMCU ESP8266'));
parts.push(body('ระบบที่พัฒนาขึ้นใช้ MPU6050 ตรวจจับการเคลื่อนไหวบนแกน X และ Y เพื่อตรวจจับ P-wave ผ่านการวิเคราะห์ขนาดความเร่ง (acceleration magnitude) เมื่อค่าความเร่งเกินค่า Threshold ที่กำหนดไว้ ระบบจะส่งสัญญาณเตือนผ่าน Buzzer, LCD display และแจ้งเตือนบน Smartphone ผ่าน Wi-Fi ด้วย NodeMCU ผลการทดสอบพบว่าระบบมีความแม่นยำในการตรวจจับแผ่นดินไหวร้อยละ 96'));
parts.push(body('จากงานวิจัยพบว่า Arduino Uno ร่วมกับ MPU6050 เป็นแพลตฟอร์มที่ใช้งานได้จริงสำหรับการพัฒนาระบบเตือนภัยแผ่นดินไหวต้นทุนต่ำในภูมิภาคเอเชียตะวันออกเฉียงใต้ โครงงานนี้จึงนำแนวทางดังกล่าวมาพัฒนาต่อยอดโดยปรับเปลี่ยนจากการวัดขนาดความเร่งแบบง่ายไปสู่การใช้อัลกอริทึม STA/LTA Recursive ที่มีความแม่นยำสูงกว่า พร้อมทั้งทดสอบด้วยชุดข้อมูลมาตรฐาน STEAD'));

// Paper FN-3 ─ Mousavi STEAD 2019
parts.push(paperHead('งานวิจัยที่ 6: Mousavi, S. M. และคณะ (2562)'));
parts.push(body('Mousavi, S. M., Sheng, Y., Zhu, W., and Beroza, G. C. (2019) ได้ทำการศึกษาวิจัยเรื่อง STanford EArthquake Dataset (STEAD): A Global Data Set of Seismic Signals for AI ตีพิมพ์ใน IEEE Access, 7, 179464-179476 งานวิจัยนี้มีวัตถุประสงค์เพื่อสร้างชุดข้อมูลสัญญาณแผ่นดินไหวมาตรฐานระดับโลกที่มีคุณภาพสูงและมีขนาดใหญ่เพียงพอสำหรับการฝึกสอนและทดสอบโมเดล Machine Learning'));
parts.push(body('STEAD ประกอบด้วยสัญญาณ 3 แกน (N, E, Z) จากแผ่นดินไหวระยะ local กว่า 1,050,000 รายการ และสัญญาณ noise 100,000 รายการ รวมมากกว่า 19,000 ชั่วโมง ทุกรายการมี metadata ครบถ้วนรวมถึงตำแหน่ง P-wave และ S-wave onset ที่ได้รับการ label โดยผู้เชี่ยวชาญ บันทึกโดยสถานีแผ่นดินไหว broadband และ strong-motion จากทั่วโลก ทำให้กลายเป็น benchmark dataset มาตรฐานสากล'));
parts.push(body('จากงานวิจัยพบว่า STEAD ช่วยให้สามารถพัฒนาและทดสอบอัลกอริทึมตรวจจับ P-wave ในสภาวะที่ควบคุมได้ โดยมี ground truth ที่เชื่อถือได้ โครงงานนี้จึงคัดเลือกตัวอย่าง P-wave 77 ชุดและ noise 38 ชุดจาก STEAD มาใช้เป็นชุดข้อมูลทดสอบอัลกอริทึม STA/LTA Recursive ผ่านกระบวนการ Grid Search จำนวน 25,875 การจำลอง'));

// Paper FN-4 ─ Mousavi EQTransformer 2020
parts.push(paperHead('งานวิจัยที่ 7: Mousavi, S. M. และคณะ (2563)'));
parts.push(body('Mousavi, S. M., Ellsworth, W. L., Zhu, W., Chuang, L. Y., and Beroza, G. C. (2020) ได้ทำการศึกษาวิจัยเรื่อง Earthquake transformer—an attentive deep-learning model for simultaneous earthquake detection and phase picking ตีพิมพ์ใน Nature Communications, 11, 3952 งานวิจัยนี้มีวัตถุประสงค์เพื่อพัฒนาโมเดล deep learning รุ่นใหม่ที่สามารถตรวจจับแผ่นดินไหวและระบุตำแหน่ง P-wave และ S-wave onset พร้อมกันในการประมวลผลครั้งเดียว'));
parts.push(body('EQTransformer ใช้สถาปัตยกรรม Transformer ที่ผสมผสาน CNN และ Attention mechanism ประกอบด้วย 56 layers และพารามิเตอร์ประมาณ 372,000 ตัว ฝึกสอนด้วย STEAD dataset ที่มีแผ่นดินไหว 850,000 รายการ ผลการทดสอบกับข้อมูลต่อเนื่อง 5 สัปดาห์จากลำดับเหตุการณ์แผ่นดินไหว Tottori ประเทศญี่ปุ่น พบว่า EQTransformer สามารถตรวจพบแผ่นดินไหวได้มากกว่าเดิมถึง 2 เท่า โดยใช้สถานีตรวจวัดเพียงไม่ถึง 1 ใน 3'));
parts.push(body('จากงานวิจัยพบว่า Deep learning สามารถให้ประสิทธิภาพสูงกว่า STA/LTA อย่างมีนัยสำคัญในสภาพแวดล้อม noise สูง แต่มีข้อจำกัดด้านทรัพยากรคำนวณที่ไม่เหมาะสำหรับไมโครคอนโทรลเลอร์ Arduino Uno (RAM 2 KB) โครงงานนี้จึงเลือกใช้ STA/LTA Recursive ที่เหมาะสมกับฮาร์ดแวร์ โดยใช้ STEAD เป็นชุดข้อมูลทดสอบเช่นเดียวกับงานวิจัยนี้เพื่อความเทียบเคียงได้'));

// Paper FN-5 ─ Temneanu 2025 Self-Contained MEMS EEW
parts.push(paperHead('งานวิจัยที่ 8: Temneanu, M. และคณะ (2568)'));
parts.push(body('Temneanu, M., Donciu, C., and Serea, F. (2025) ได้ทำการศึกษาวิจัยเรื่อง Self-Contained Earthquake Early Warning System Based on Characteristic Period Computed in the Frequency Domain ตีพิมพ์ใน Applied Sciences, 15(16), 9026 โดย MDPI งานวิจัยนี้มีวัตถุประสงค์เพื่อพัฒนาระบบเตือนภัยแผ่นดินไหวแบบ standalone ที่ไม่ต้องพึ่งพาโครงสร้างพื้นฐานภายนอก โดยใช้ MEMS accelerometer คุณภาพสูงร่วมกับไมโครคอนโทรลเลอร์สมรรถนะสูง'));
parts.push(body('ระบบใช้ STA/LTA algorithm เป็น trigger สัญญาณ จากนั้นวิเคราะห์ characteristic period (τc) ของ ground motion ในโดเมนความถี่ด้วยวิธี spectral moment จาก 3 วินาทีแรกของ P-wave เพื่อประมาณขนาดแผ่นดินไหว ผลการทดสอบแสดงให้เห็นความแม่นยำสูงในการประมาณ τc และมีความสัมพันธ์ดีกับขนาดแผ่นดินไหวจริง ยืนยันว่า embedded platform สมัยใหม่สามารถส่งสัญญาณเตือนได้อย่างรวดเร็วและน่าเชื่อถือ'));
parts.push(body('จากงานวิจัยพบว่า การผสานการใช้ STA/LTA สำหรับ trigger กับการวิเคราะห์ความถี่สำหรับ magnitude estimation สามารถสร้างระบบ EEW แบบ standalone ที่มีประสิทธิภาพสูงได้ โครงงานนี้นำแนวทาง STA/LTA แบบ standalone มาประยุกต์ใช้ในลักษณะเดียวกัน และนำเสนอ Grid Search บนชุดข้อมูล STEAD เป็นวิธีการหาค่าพารามิเตอร์ STA/LTA ที่เหมาะสมที่สุดอย่างเป็นระบบ ซึ่งเป็นแนวทางที่ยังไม่ปรากฏในงานวิจัยที่ผ่านมา'));

const xml = parts.join('\n');
fs.writeFileSync(`${__dirname}/ch2_new.xml`, xml, 'utf8');
console.log('Written ch2_new.xml, paragraphs:', parts.length);
console.log('Preview start:', xml.slice(0, 200));
