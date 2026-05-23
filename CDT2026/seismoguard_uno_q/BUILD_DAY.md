# 12-hour build day checklist — Coding Thailand 2026

Stick this on the wall. Tick boxes in pen.

## Pre-day (bring with you)

- [ ] Laptop with Arduino IDE pre-installed + `Arduino_LSM6DSOX` library
- [ ] USB cable spares (×2 Type-C, ×1 micro)
- [ ] Phone with ntfy.sh app installed + subscribed to your test topic
- [ ] This repo cloned offline (USB flash drive backup)
- [ ] Printed `assets/flowchart.md` A3 + this checklist A4
- [ ] ESD wrist strap, foam pad, cable ties, kapton tape, "DO NOT TOUCH" sign

## H0 – H1: Inventory + first power

- [ ] Count parts vs. bag list. Photograph layout (rubric: Setup & Safety).
- [ ] Boot UNO Q, confirm Linux desktop / SSH reachable.
- [ ] Plug Ugreen 65 W → UNO Q. Confirm no brown-out under load.
- [ ] Run `i2cdetect -y 1` BEFORE wiring Modulinos to map noise.
- [ ] Hang "DO NOT TOUCH — calibration" sign.

## H1 – H3: Wiring + smoke test

- [ ] Daisy-chain Qwiic: Movement → Buzzer → Pixels.
- [ ] `i2cdetect -y 1` again → expect 3 new addresses. **Note them.** If they
      differ from `arduino/seismoguard_uno_q.ino` (`0x6A`, `0x3C`, `0x6C`),
      patch the `#define ADDR_*` lines and re-flash.
- [ ] Flash `arduino/seismoguard_uno_q.ino`.
- [ ] `screen /dev/ttyACM0 115200` → confirm `E,boot,...` and `S,...` lines stream.
- [ ] Manually trigger:
      ```
      echo "P" > /dev/ttyACM0          # expect E,pong
      echo "A,1" > /dev/ttyACM0        # expect buzzer beep + Pixels yellow
      echo "A,2,5.5" > /dev/ttyACM0    # expect siren + Pixels red flash
      echo "R" > /dev/ttyACM0          # back to green
      ```

## H3 – H6: Calibrate + Linux side wiring

- [ ] Mount IMU on foam pad on a stable surface.
- [ ] `bash scripts/install.sh` (skip if already provisioned).
- [ ] `cp linux/seismoguard.conf.example linux/seismoguard.conf` → edit
      `ntfy_topic`, `venue_name`. Use a long random topic.
- [ ] `python3 scripts/gen_tts.py` → confirm `assets/alert_*_th.wav` exist
      and `aplay assets/alert_t2_th.wav` plays through USB speaker.
- [ ] `python3 scripts/calibrate.py --port /dev/ttyACM0 --secs 60` → record
      the recommended `RATIO_TRIGGER`. If > 6.0, patch `arduino/config.h`
      from the template, re-flash, re-run.
- [ ] Run orchestrator end-to-end:
      ```
      . .venv/bin/activate
      python3 -m linux.main --port /dev/ttyACM0
      ```
      → open `http://localhost:8080` on a 2nd device, see live ratio.

## H6 – H8: Enclosure + presentation

- [ ] 3D-print or laser-cut enclosure. Rigid floor coupling for IMU.
- [ ] Cable-tie all wires. Front face: Pixels + Buzzer visible to judge.
- [ ] Label every connector with a paper sticker.
- [ ] Mount label: "P-wave detector / Alert siren / Status display".

## H8 – H10: Scenario rehearsal (×2 runs)

### Scenario A — Tap test (false-positive reject)

- [ ] With device armed, tap the foam pad 10 times of varying force.
- [ ] Watch dashboard: each tap should briefly **open the window** but the
      decision line should read `below_threshold` → no siren.
- [ ] If a tap fires T2: raise `MIN_TRIG_CF_ABS` in `arduino/config.h`,
      re-flash.

### Scenario B — Vibrator/shake (true-positive)

- [ ] Tape phone vibrator to chassis. Play 5 s continuous buzz.
- [ ] Expect: trigger → Mw decision ≥ T2 → siren + Pixels red flash +
      Thai TTS + ntfy push to phone.
- [ ] Time the P-onset → siren latency. **Target ≤ 500 ms.** Record value.
- [ ] Save `events.log` from orchestrator → USB flash backup.

## H10 – H11: Demo polish

- [ ] Dashboard up on big screen. Tab open: live ratio + recent events.
- [ ] Tape flowchart A3 to table edge facing judges.
- [ ] Rehearse 3-minute pitch (see README "Pitch hook").
- [ ] Q&A drill — assign one teammate per topic:
      - "ทำไม STA/LTA?" — adaptive to ambient noise floor.
      - "FPR เท่าไหร่?" — 1% on 689 STEAD samples (439P / 250N).
      - "ทำไมต้อง Mw gate?" — taps spike ratio but not energy → reject.
      - "ต้นทุนเท่าไหร่?" — ~฿2,000 BOM vs commercial EEW ฿100k+.
      - "ไม่มีไฟทำไง?" — UNO Q ride-through ≈ 2 s; Li-ion add-on roadmap.

## H11 – H12: Final check + buffer

- [ ] Dry run full pitch + demo, hands on stopwatch. Cut anything > 3 min.
- [ ] Backup: `arduino/`, `linux/`, `seismoguard.conf`, last `events.log` to
      USB flash. Eject cleanly.
- [ ] Power-cycle test: unplug → wait 5 s → plug in → confirm auto-recover
      and orchestrator restarts. (Set up `systemd` unit if time permits.)
- [ ] Final photo of setup for rubric Setup & Safety evidence.
- [ ] Team huddle: roles, who answers what, who runs each scenario.

## Roles (for Participation 1.25×)

| Role | Person | Owns |
|---|---|---|
| Hardware lead | | wiring, enclosure, ESD, safety |
| Firmware lead | | `arduino/`, threshold tuning, MCU flash |
| Linux/dashboard lead | | `linux/`, dashboard, ntfy, TTS |
| Presenter | | pitch, Q&A, judge interaction |
