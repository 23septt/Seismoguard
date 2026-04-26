# ESP32 LINE Notify Firmware

**Category:** Hardware / Deployment  
**Source:** `seismoguard_esp32.ino`  
**Related:** [[STA/LTA Recursive Algorithm]], [[MPU6050 Sensor]], [[Pd Magnitude Estimation]], [[State Machine]]

---

## Overview

`seismoguard_esp32.ino` is a full ESP32 port of the SeismoGuard detector, adding:

1. **50 Hz hardware timer ISR** — non-blocking sample acquisition
2. **WiFi connectivity** — ESP32 connects to local network on boot
3. **LINE Notify alert** — HTTPS POST to `notify-api.line.me` with estimated Mw
4. **Pd magnitude estimation** — first 3-second P-wave window integrated to displacement → Wu & Kanamori (2005) regression
5. **Buzzer + LED local alert** — simultaneous physical warning

---

## Hardware Requirements

| Component | Spec | Wiring |
|-----------|------|--------|
| ESP32 DevKit | Any variant (WROOM/WROVER) | — |
| MPU6050 | I²C, ±2g mode | SDA=GPIO21, SCL=GPIO22 |
| Buzzer | Active, 3.3V/5V | GPIO25 |
| LED | Built-in or external | GPIO2 |
| Power | 5V USB or LiPo via TP4056 | VIN/GND |

---

## Algorithm Parameters (identical to Arduino version)

| Parameter | Value |
|-----------|-------|
| Sample rate | 50 Hz |
| τ_STA | 0.5 s → α = 0.04 |
| τ_LTA | 30 s  → β ≈ 0.000667 |
| RATIO_TRIGGER | **6.0** |
| MIN_TRIG | **3 samples** (60 ms) |
| SPIKE limit | **50 × LTA** |
| RATIO_DETRIGGER | 1.5 |

Validated via grid search v3 on 439P+250N stratified STEAD + ROC analysis (AUC=**0.9919**, TPR=100%, FPR=1%, F1=0.995 at RATIO=6.0, MIN=3).

---

## LINE Notify Setup

1. Open [https://notify-bot.line.me/](https://notify-bot.line.me/)
2. Log in with LINE account → **"Generate access token"**
3. Choose a group chat or 1-on-1 with LINE Notify bot
4. Copy the token → paste into `#define LINE_TOKEN "..."` in firmware
5. Configure WiFi credentials: `WIFI_SSID`, `WIFI_PASSWORD`

### Alert Message Format (Thai)

```
⚠️ แผ่นดินไหวตรวจพบ!
ขนาด (Mw) ≈ 5.2
อยู่ในตำแหน่งปลอดภัย และตรวจสอบความเสียหาย
SeismoGuard EEW v1.0
```

### Alert Cooldown

`ALERT_COOLDOWN_MS = 30000` — minimum 30 seconds between consecutive LINE messages to avoid flooding during aftershock sequences.

---

## Firmware Architecture

### Sampling (ISR)
```
Hardware Timer0 @ 50 Hz → sets sampleReady=true flag
loop() reads MPU6050 only when flag is set → non-blocking
```

### Detection Loop (loop())

```
Read az (Z-axis acceleration, m/s²)
↓
Compute CF = az²  →  apply spike rejection
↓
Update STA  →  compute ratio = STA/LTA
↓
State machine: STANDBY → DETECTING → ALARMING → LOCKOUT
↓
If ALARMING: buffer 150 samples for Pd
            → computeMw() → sendLineNotify()
            → alertOn() (buzzer + LED)
```

### Pd Buffer

Declared as `float pdBuf[150]` on heap — 600 bytes.  
Filled starting from the sample that confirmed P-onset (MIN_TRIG reached).

---

## TLS / Certificate Note

The firmware uses `client.setInsecure()` to skip certificate verification — acceptable for a single-purpose IoT alert device on a trusted home network. For production or public deployment, use `client.setCACert(root_ca)` with the ISRG Root X1 CA certificate (Let's Encrypt root, used by LINE API).

---

## Serial Monitor Output

```
[SeismoGuard ESP32] Booting...
[OK] MPU6050 initialised (±2g, 10Hz filter)
[WiFi] Connected. IP: 192.168.1.105
[OK] Sampling timer started @ 50 Hz
[OK] SeismoGuard running. RATIO_TRIGGER=6.0
[hb] t=10s  state=0  STA=0.0021  LTA=0.0020  ratio=1.050
[ALARM] P-onset at sample 512  ratio=6.84
[Pd] Estimated Mw = 4.70
[LOCKOUT] Ratio fell below detrigger
[STANDBY] Detector reset
```

---

## Required Libraries

Install via Arduino Library Manager:

| Library | Author | Version |
|---------|--------|---------|
| Adafruit MPU6050 | Adafruit | ≥ 2.2.4 |
| Adafruit Unified Sensor | Adafruit | ≥ 1.1.9 |
| ESP32 board package | Espressif | ≥ 2.0.0 |

ArduinoJson is **not required** — LINE Notify uses form-encoded POST, not JSON.

---

## Differences from Arduino (earthquake.ino)

| Feature | Arduino | ESP32 |
|---------|---------|-------|
| WiFi | ✗ | ✓ ESP32 built-in |
| LINE Notify | ✗ | ✓ HTTPS POST |
| Pd estimation | ✓ 75 samples (1.5 s) | ✓ 150 samples (3 s) |
| 2-tier alert | ✓ Tier-1 buzzer only | ✓ Tier-1 + Tier-2 LINE |
| Sampling | `delay(20)` blocking | Hardware timer ISR |
| Serial baud | 115200 | 115200 |
| Flash size | 32 KB | 4 MB |

---

## Future Enhancements

- NTP time sync → timestamp alerts with actual UTC time
- MQTT publish to Home Assistant or Grafana dashboard
- SD card logging of raw accelerometer data (post-event playback)
- OTA (Over-The-Air) firmware updates via `ArduinoOTA`
- Adaptive threshold integration (see [[Adaptive Threshold]])

---

## References

- LINE Notify API documentation: https://notify-bot.line.me/doc/en/
- Wu, Y.-M., & Kanamori, H. (2005) — Pd regression coefficients
- [[MPU6050 Sensor]]
- [[State Machine]]
- [[Pd Magnitude Estimation]]
