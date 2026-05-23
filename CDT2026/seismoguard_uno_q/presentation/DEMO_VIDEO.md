# DEMO_VIDEO.md — 90-second backup demo storyboard

Record this the night before. If the live demo fails on stage, play
this video. **Same content as the live demo**, just pre-canned so you
can't be sabotaged by a flaky cable or a noisy venue floor.

Output target: `presentation/backup_demo.mp4`, ~90 s, 1080p, MP4 H.264.

## Shot list (90 s budget)

| # | Time | Shot | Voiceover (TH or EN — match the live talk) |
|---|---|---|---|
| 1 | 0:00 – 0:08 | **Cold open:** close-up of the device on the table, Pixels green, LED idle. Caption: "SeismoGuard EEW · Coding Thailand 2026" | "ระบบเตือนภัยแผ่นดินไหวล่วงหน้า ต้นทุนต่ำกว่า 2,000 บาท" |
| 2 | 0:08 – 0:18 | **Architecture diagram** (still from `assets/flowchart.md` or `slides.md`). Subtle pan + zoom. | "IMU 100 Hz → STA/LTA trigger → 3 วินาที window → Mw decision → multi-modal alert" |
| 3 | 0:18 – 0:35 | **Scenario A — Tap test.** Hand enters frame, taps the foam pad next to the sensor 3 times. Dashboard on second monitor shows ratio spike + "trigger" log line but NO alert. Pixels stay green. Buzzer silent. | "เคาะเซนเซอร์: ratio ขึ้นชั่วครู่ แต่ Mw ต่ำกว่า threshold → silent reset → ไม่มี false alarm" |
| 4 | 0:35 – 0:55 | **Scenario B — Shake test.** Phone vibrator taped to chassis. 5-second sustained buzz. Dashboard ratio shoots up. Pixels flash red 2.5 Hz. Buzzer siren audible. Thai TTS plays "แผ่นดินไหว เตือนภัย รีบหลบ". Phone (in frame, separate) gets ntfy push. | "การสั่นสะเทือนจริง: trigger เปิด window → Pd + Mw → Mw ≥ 4.5 → fire T2 → ครบ 4 ช่องทาง" |
| 5 | 0:55 – 1:10 | **Dashboard close-up:** scroll back through events.jsonl log. Show timestamp + decision + Mw value for the demo run just performed. | "ทุก event บันทึกแบบ append-only JSONL ตรวจสอบย้อนหลังได้" |
| 6 | 1:10 – 1:25 | **Numbers + theme tie-in slide.** F1=0.995, FPR=1%, latency ≤ 500 ms / 3.2 s, BOM ~2,000 ฿. Subtitle: "Health & Well-Being — ครอบคลุมผู้สูงอายุ ผู้พิการ ทุกคน" | "ผ่านการทดสอบบน STEAD 689 ตัวอย่าง F1 = 0.995 · ผู้สูงอายุ ผู้พิการ ผู้นอนหลับ ทุกคนรับรู้พร้อมกัน" |
| 7 | 1:25 – 1:30 | **Outro card.** GitHub URL. Team logo. | (no VO, music fade) |

## Recording checklist

- [ ] **Mic:** use the Type-C mic from the kit, not the laptop mic.
      Reduce room reverb with a blanket behind the camera.
- [ ] **Camera:** phone tripod at 1 m height, 45° down angle. Frame
      includes device + the second-monitor dashboard.
- [ ] **Lighting:** 2 lamps (no harsh shadows on the Pixels — they wash
      out on camera if back-lit).
- [ ] **Software:** OBS Studio or QuickTime. 1080p 30 fps. H.264 + AAC.
      Single take, edit in Shotcut / iMovie / Resolve.
- [ ] **Backup:** export `backup_demo.mp4` to TWO places — laptop's
      `presentation/` folder AND the Kingston 16 GB USB flash.
- [ ] **Audio level check:** play back on a portable speaker at the
      venue. If the buzzer overpowers the VO, re-mix.
- [ ] **Captions:** burn Thai subtitles into the video. Judges may not
      hear the audio in a noisy hall.

## Live-fallback decision tree

| If… | Then… |
|---|---|
| Live demo works | Run live. Skip video. |
| Live trigger fires false alarm during tap | Pause, calmly run `R\n` reset cmd, restart Scenario A. If second tap also fails, switch to video at 0:18. |
| Live device doesn't boot / serial dead | Open `backup_demo.mp4` on the laptop. Tell judges: "เราพบปัญหาเรื่องการเชื่อมต่อในระหว่างเวที — นี่คือผลการรันก่อนหน้า". Carry on with pitch. |
| Dashboard browser tab crashed | Skip the dashboard, do live tap + shake on hardware only. Video covers the dashboard view. |

## Length policing

Demo + voiceover MUST stay under **90 s combined**. Anything longer
loses the judge. If you're over on the first take, cut from shot 5 →
straight to outro. The numbers slide is nice-to-have, not essential.
