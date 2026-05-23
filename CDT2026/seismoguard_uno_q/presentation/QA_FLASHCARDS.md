# Q&A flashcards — judge questions + short answers

Practice these out loud before the demo. One-sentence answer first, expand
only if the judge asks "tell me more".

Format: **Q** — short A — (longer A if asked).

---

## Algorithm

**Q: ทำไม STA/LTA ไม่ใช้ ML?**
A: STA/LTA ปรับตัวต่อ noise floor venue ได้อัตโนมัติ + เร็วพอสำหรับ EEW.
*Long:* ML ต้อง label data เยอะ + retrain ต่อ environment. STA/LTA แค่ recursive EMA 2 ตัว = <1 µs ต่อ sample บน MCU.

**Q: ทำไมต้องมี Mw gate? Trigger อย่างเดียวไม่พอเหรอ?**
A: Tap ทำให้ ratio พุ่งได้ แต่ energy ต่ำ → Pd เล็ก → Mw ต่ำ → ไม่เตือน. กัน false alarm.
*Long:* ratio = STA/LTA = relative spike, ไม่บอกขนาดจริง. Pd = peak displacement = absolute energy proxy. คูณกัน = ratio บอกว่าเกิดอะไร, Mw บอกว่ารุนแรงแค่ไหน.

**Q: ทำไมต้อง 3 วินาที window?**
A: เวลาน้อยสุดที่ Pd + τc converge สำหรับ Mw estimate ที่เชื่อถือได้ (Allen 2007).
*Long:* น้อยกว่านี้ → Mw ไม่นิ่ง. มากกว่านี้ → latency เพิ่ม. 3 s = sweet spot.

**Q: FPR/TPR เท่าไหร่?**
A: F1 = 0.995, TPR = 100% (439/439 P-waves), FPR = 1% (3/250 noise) บน STEAD dataset.
*Long:* Grid-search optimum: RATIO_TRIGGER=6.0, MIN_TRIG=3, AUC=0.9919, detection delay 232 ms.

**Q: ทำไม Z-axis อย่างเดียว? ไม่ใช้ 3-axis?**
A: P-wave มาจาก vertical motion เป็นหลัก. Z-only ให้ SNR ดีที่สุดบน MEMS.
*Long:* 3-axis CF (dx²+dy²+dz²) เคยลอง — เพิ่ม noise มากกว่า signal. ใช้ใน calib แต่ไม่ใช้ detect.

**Q: ทำไมไม่ใช้ Pd บน MCU เลย? ต้องส่งกลับ Linux ทำไม?**
A: MCU มีจำกัด — แยก fast-path (trigger + buzzer pre-tone) กับ heavy compute (Mw + alert). Linux ทำ float64 ได้ + retune ได้โดยไม่ flash ใหม่.

## Hardware

**Q: ทำไมไม่ใช้ MPU6050 เหมือนเดิม?**
A: Kit ให้ LSM6DSOX มา (Modulino Movement). LSM6DSOX แม่นกว่า, ±2/4/8/16g range, noise density 70 µg/√Hz.

**Q: BOM เท่าไหร่?**
A: Kit ทั้งหมด ~2,000 บาท equivalent. Marginal cost (วัสดุนอก kit) ~50 บาท.
*Long:* เทียบ commercial EEW node ~100,000+ บาท → ของเรา 2% ของราคา.

**Q: ใช้ไฟเท่าไหร่?**
A: UNO Q load สูงสุด ~8 W. Ugreen 65 W ในกล่องเพียงพอ.

**Q: ถ้าไฟดับทำไง?**
A: UNO Q มี caps ride-through ~2 s. Roadmap: Li-ion 18650 + TP4056 ~4 hr backup.

**Q: ติดตั้งยังไง?**
A: วางบนพื้นแข็ง bolt 4 มุม → coupling vibration เข้า IMU ตรง. ไม่ใช้ foam pad.

## Demo

**Q: ทำไม tap ไม่ trigger เลย?**
A: Trigger เปิด window 3 วินาที แต่ Mw ตำ่กว่า threshold → silent reset. ดูใน dashboard มี trigger entry แต่ไม่มี alert.

**Q: ทำไม shake ถึง trigger?**
A: Vibrator amplitude สูงพอให้ Pd ผ่าน threshold → Mw ≥ 4.5 → T2 fire.

**Q: ปรับ sensitivity ยังไง?**
A: `linux/seismoguard.conf` → `mw_t1` / `mw_t2`. ไม่ต้อง reflash.

**Q: ปรับ threshold ratio?**
A: `arduino/config.h` → `#define RATIO_TRIGGER 7.5f` → reflash. หรือใช้ `scripts/calibrate.py` แนะนำค่า.

## Theme

**Q: ทำไม Health & Well-Being?**
A: EEW = ชีวิต. ผู้สูงอายุ/พิการ/หูหนวก เสียเปรียบที่สุดในแผ่นดินไหว. Multi-modal alert (เสียง + แสง + เสียงพูด + push) ครอบคลุมทุกคน.

**Q: เจาะตลาดไหน?**
A: condo สูง + ผู้สูงอายุ + บ้านที่มีคนพิการ. ช่วงแรก B2C ~5,000 บาท retail พร้อม cloud subscription.

**Q: scale ยังไง?**
A: Multi-station mesh → vote-based confirm → FPR ลดลง + epicenter localization. ESP-NOW prototype on roadmap.

## Limitations (be honest)

**Q: ทดสอบบนแผ่นดินไหวจริงหรือยัง?**
A: ยัง. ทดสอบบน STEAD dataset (439 P-waves) + bench tap/shake. Field test = next step.

**Q: Mw ตัวเลขเชื่อถือได้แค่ไหน?**
A: PRELIMINARY. ใช้ Wu & Kanamori 2005 Taiwan coefficients + R = 10 km fixed. Recalibrate กับ TMD catalog Thailand บน roadmap.

**Q: Single-station มี limit อะไร?**
A: ไม่รู้ epicenter distance → Mw error dominated by R guess. Mesh แก้ได้.

**Q: ถ้าไม่มี internet?**
A: Buzzer + Pixels + TTS ทำงานปกติ (local). ntfy push ไม่ส่ง, แต่ระบบเตือนภัยหลักไม่กระทบ.

## Code

**Q: ภาษาอะไรบ้าง?**
A: 4 ภาษา: Python (reference), Rust, Java, C — algorithm port เหมือนกันทุกตัว, JSON schema เดียวกัน.

**Q: ทำไมหลายภาษา?**
A: แต่ละภาษามีจุดเด่น — Python iterate ไว, Rust/C fast, Java JVM interop. ทุกตัวผ่าน parity test 1e-9 tolerance.

**Q: Test coverage?**
A: 5 unit tests ต่อ port — DC stable, tap reject, Mw formula, synthetic P-wave, schema fields. Python+C run locally ผ่านหมด.

---

## Quick stats sheet (memorize)

```
F1               = 0.995    (689 STEAD samples, 439P + 250N)
TPR              = 100%     (439/439)
FPR              = 1%       (3/250)
AUC              = 0.9919
Detection delay  = 232 ms   (P-onset → trigger)
Mw window        = 3.0 s    (post-trigger)
End-to-end T1    = ≤ 500 ms (P-onset → buzzer)
End-to-end T2    = ≤ 3.2 s  (P-onset → ntfy + TTS)
Sample rate      = 100 Hz
Cost (marginal)  = ~50 ฿    (kit loaner, vs 100k+ commercial)
```
