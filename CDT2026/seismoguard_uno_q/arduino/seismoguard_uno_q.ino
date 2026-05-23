/**
 * seismoguard_uno_q.ino  —  v0.1.0-cdt2026
 * SeismoGuard EEW port for Arduino UNO Q (MCU side) + Modulino chain.
 *
 * Hardware:
 *   - Arduino UNO Q (MCU side: ATmega-class; Linux side runs Python detector)
 *   - Modulino Movement (LSM6DSOX) on Qwiic I²C — accel only, 100 Hz
 *   - Modulino Buzzer  on Qwiic I²C — fast-path heads-up tone
 *   - Modulino Pixels  on Qwiic I²C — 8-LED status bar
 *
 * Role split:
 *   MCU = sample IMU @100 Hz, recursive STA/LTA trigger, local fast-path
 *         buzzer pre-tone (<500 ms), stream raw accel to Linux over USB
 *         serial as compact CSV lines, drive Pixels FSM, accept commands
 *         from Linux to fire T1/T2 alert (Mw-gated decision lives on Linux).
 *   Linux = Pd/τc/Mw pipeline, decision gate, ntfy push, TTS, dashboard.
 *
 * Serial protocol (115200 baud, 8N1):
 *   Out (MCU → Linux):
 *     S,<ms>,<ax>,<ay>,<az>,<ratio>,<state>\n   — sample line, 100 Hz
 *     E,trigger,<peak_ratio>\n                  — STA/LTA window-open event
 *     E,detrigger\n                             — return to standby
 *     E,boot,<fw_version>\n                     — once on boot
 *   In (Linux → MCU):
 *     A,1\n   — fire T1 heads-up (short tone, pixels yellow)
 *     A,2,<mw>\n — fire T2 alert (siren, pixels red flash, mw shown)
 *     R\n     — reset alarm, return to standby
 *     P\n     — ping (MCU replies "E,pong\n")
 */

#include <Wire.h>
#include <Arduino_LSM6DSOX.h>   // Modulino Movement uses LSM6DSOX

// ─── Config ────────────────────────────────────────────────────────────
#define FW_VERSION         "0.1.0-cdt2026"
#define SAMPLE_RATE_HZ     100
#define SAMPLE_INTERVAL_US 10000

// STA/LTA recursive coefficients (rescaled for 100 Hz from S3 50 Hz tuning)
#define ALPHA_STA          0.02f      // 1 / (0.5 s · 100 Hz)
#define ALPHA_LTA          0.000333f  // 1 / (30  s · 100 Hz)
#define ALPHA_DC           0.001f     // DC tracker τ ≈ 10 s @ 100 Hz
#define RATIO_TRIGGER      6.0f       // STEAD grid-search optimum
#define RATIO_DETRIGGER    1.5f
#define MIN_TRIG_COUNT     3          // 30 ms at 100 Hz
#define SPIKE_LIMIT        50.0f
#define LTA_FLOOR          1e-9f
#define MIN_TRIG_CF_ABS    2e-4f      // reject sub-mg taps (S3 v1.3.1 carry-over)

// Buzzer pre-tone (local fast-path before Linux Mw decision arrives)
#define PRETONE_FREQ_HZ    1500
#define PRETONE_MS         150

// Pixels FSM (Modulino Pixels = 8 NeoPixel-like LEDs over I²C)
#define PIX_GREEN  0x00FF00
#define PIX_YELLOW 0xFFAA00
#define PIX_RED    0xFF0000
#define PIX_OFF    0x000000

// Alarm timeouts (rubber-band against stuck alarm — S3 v1.3.1 carry-over)
#define ALARM_MAX_MS    15000UL
#define LOCKOUT_MAX_MS   5000UL

// I²C addresses (Modulino factory defaults — verify with i2cdetect on UNO Q)
#define ADDR_MOVEMENT 0x6A
#define ADDR_BUZZER   0x3C   // placeholder — confirm at unbox
#define ADDR_PIXELS   0x6C   // placeholder — confirm at unbox

// ─── State ─────────────────────────────────────────────────────────────
enum DetState : uint8_t { STANDBY = 0, DETECTING = 1, ALARMING = 2, LOCKOUT = 3 };
DetState state = STANDBY;

float sta = 0.0f, lta = 1.0f, ltaQuiet = 1.0f;
float smoothedX = 0.0f, smoothedY = 0.0f, smoothedZ = 0.0f;
bool  smoothedZInit = false;
int   trigCount = 0;
float peakRatio = 0.0f;
float curRatio  = 0.0f;
uint32_t alarmStartMs = 0, lockoutStartMs = 0;

unsigned long lastSampleUs = 0;
unsigned long sampleCount  = 0;

// ─── Pixels driver (minimal — write 8 RGB bytes to Modulino Pixels) ──
// Modulino Pixels protocol: write 24 bytes (8×RGB) starting at reg 0x00.
// If your unit uses different reg layout, adjust here.
void pixelsSetAll(uint32_t rgb) {
  Wire.beginTransmission(ADDR_PIXELS);
  Wire.write(0x00);                       // start register
  for (int i = 0; i < 8; i++) {
    Wire.write((rgb >> 16) & 0xFF);       // R
    Wire.write((rgb >>  8) & 0xFF);       // G
    Wire.write( rgb        & 0xFF);       // B
  }
  Wire.endTransmission();
}

void pixelsAlarmFlash(unsigned long t) {
  bool on = ((t / 200) & 1);              // 2.5 Hz flash
  pixelsSetAll(on ? PIX_RED : PIX_OFF);
}

// ─── Buzzer driver (Modulino Buzzer: write freq + duration as uint16) ─
void buzzerTone(uint16_t freq_hz, uint16_t duration_ms) {
  Wire.beginTransmission(ADDR_BUZZER);
  Wire.write(0x00);
  Wire.write(freq_hz & 0xFF);     Wire.write((freq_hz >> 8) & 0xFF);
  Wire.write(duration_ms & 0xFF); Wire.write((duration_ms >> 8) & 0xFF);
  Wire.endTransmission();
}
inline void buzzerOff()    { buzzerTone(0, 0); }
inline void buzzerPreTone(){ buzzerTone(PRETONE_FREQ_HZ, PRETONE_MS); }
inline void buzzerSiren()  {
  static unsigned long lastToggle = 0;
  static bool hi = false;
  unsigned long now = millis();
  if (now - lastToggle > 250) {
    hi = !hi;
    buzzerTone(hi ? 2500 : 1500, 250);
    lastToggle = now;
  }
}

// ─── Setup ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && (millis() - t0) < 2000) delay(10);

  Wire.begin();
  Wire.setClock(400000);

  if (!IMU.begin()) {
    Serial.println("E,fatal,imu_init_failed");
    while (1) {                            // blink pixels red forever
      pixelsSetAll(PIX_RED); delay(300);
      pixelsSetAll(PIX_OFF); delay(300);
    }
  }

  pixelsSetAll(PIX_GREEN);
  buzzerOff();

  // Quick calibration — 3 s still, average for DC + LTA seed
  Serial.println("E,calib,start");
  float sumSq = 0.0f;
  int n = 0;
  unsigned long calibT0 = millis();
  while (millis() - calibT0 < 3000) {
    if (IMU.accelerationAvailable()) {
      float ax, ay, az;
      IMU.readAcceleration(ax, ay, az);    // returns g — convert to m/s² later
      if (!smoothedZInit) {
        smoothedX = ax; smoothedY = ay; smoothedZ = az;
        smoothedZInit = true;
      } else {
        smoothedX = 0.05f * ax + 0.95f * smoothedX;
        smoothedY = 0.05f * ay + 0.95f * smoothedY;
        smoothedZ = 0.05f * az + 0.95f * smoothedZ;
      }
      float dz = (az - smoothedZ) * 9.80665f;   // g → m/s²
      sumSq += dz * dz;
      n++;
    }
  }
  float meanCf = (n > 0) ? (sumSq / n) : LTA_FLOOR;
  if (meanCf < LTA_FLOOR) meanCf = LTA_FLOOR;
  sta = lta = ltaQuiet = meanCf;

  Serial.print("E,boot,"); Serial.println(FW_VERSION);
  Serial.print("E,calib,done,lta=");  Serial.println(meanCf, 9);

  lastSampleUs = micros();
}

// ─── Sample processing (per IMU sample) ───────────────────────────────
void processSample(float ax_g, float ay_g, float az_g) {
  // g → m/s²
  float ax = ax_g * 9.80665f;
  float ay = ay_g * 9.80665f;
  float az = az_g * 9.80665f;

  // DC tracker (freeze during ALARMING/LOCKOUT to avoid baseline drag)
  if (state == STANDBY || state == DETECTING) {
    smoothedX = ALPHA_DC * ax_g + (1.0f - ALPHA_DC) * smoothedX;
    smoothedY = ALPHA_DC * ay_g + (1.0f - ALPHA_DC) * smoothedY;
    smoothedZ = ALPHA_DC * az_g + (1.0f - ALPHA_DC) * smoothedZ;
  }
  float dz = (az_g - smoothedZ) * 9.80665f;

  // CF = dz² (Z-only — same as S3 grid-search optimum)
  float ltaRef = (lta > LTA_FLOOR) ? lta : LTA_FLOOR;
  float cf = dz * dz;
  if (cf > SPIKE_LIMIT * ltaRef) cf = SPIKE_LIMIT * ltaRef;

  sta = ALPHA_STA * cf + (1.0f - ALPHA_STA) * sta;
  if (state == STANDBY) {
    lta = ALPHA_LTA * cf + (1.0f - ALPHA_LTA) * lta;
  }

  curRatio = (lta > LTA_FLOOR) ? (sta / lta) : 0.0f;

  // State machine
  unsigned long now = millis();
  switch (state) {
    case STANDBY:
      if (curRatio >= RATIO_TRIGGER && cf >= MIN_TRIG_CF_ABS) {
        if (++trigCount >= MIN_TRIG_COUNT) {
          state = DETECTING;
          peakRatio = curRatio;
          buzzerPreTone();                // local heads-up — Linux Mw decides T2
          pixelsSetAll(PIX_YELLOW);
          Serial.print("E,trigger,"); Serial.println(peakRatio, 2);
        }
      } else {
        trigCount = 0;
      }
      break;

    case DETECTING:
      if (curRatio > peakRatio) peakRatio = curRatio;
      if (curRatio < RATIO_DETRIGGER) {
        state = STANDBY;
        trigCount = 0;
        peakRatio = 0.0f;
        pixelsSetAll(PIX_GREEN);
        Serial.println("E,detrigger");
      }
      break;

    case ALARMING:
      buzzerSiren();
      pixelsAlarmFlash(now);
      if (now - alarmStartMs > ALARM_MAX_MS) {
        state = LOCKOUT;
        lockoutStartMs = now;
        buzzerOff();
        Serial.println("E,alarm_timeout");
      }
      break;

    case LOCKOUT:
      pixelsSetAll(PIX_OFF);
      if (now - lockoutStartMs > LOCKOUT_MAX_MS) {
        state = STANDBY;
        lta = ltaQuiet;                   // reseed clean LTA
        sta = ltaQuiet;
        pixelsSetAll(PIX_GREEN);
        Serial.println("E,reset");
      }
      break;
  }

  // Stream sample line (compact CSV) — Linux side parses
  Serial.print("S,");  Serial.print(now);
  Serial.print(",");   Serial.print(ax, 4);
  Serial.print(",");   Serial.print(ay, 4);
  Serial.print(",");   Serial.print(az, 4);
  Serial.print(",");   Serial.print(curRatio, 2);
  Serial.print(",");   Serial.println((int)state);
}

// ─── Command parser (Linux → MCU) ─────────────────────────────────────
void handleCommand(const String &line) {
  if (line.length() == 0) return;
  char c = line.charAt(0);
  if (c == 'A') {
    int tier = line.substring(2, 3).toInt();
    if (tier == 1) {
      buzzerPreTone();
      pixelsSetAll(PIX_YELLOW);
      Serial.println("E,ack,t1");
    } else if (tier == 2) {
      state = ALARMING;
      alarmStartMs = millis();
      Serial.print("E,ack,t2");
      int comma = line.indexOf(',', 2);
      if (comma > 0) { Serial.print(","); Serial.print(line.substring(comma + 1)); }
      Serial.println();
    }
  } else if (c == 'R') {
    state = STANDBY;
    trigCount = 0;
    peakRatio = 0.0f;
    buzzerOff();
    pixelsSetAll(PIX_GREEN);
    Serial.println("E,ack,reset");
  } else if (c == 'P') {
    Serial.println("E,pong");
  }
}

// ─── Loop ─────────────────────────────────────────────────────────────
void loop() {
  // 1. Drain any Linux commands
  static String inBuf;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n') { handleCommand(inBuf); inBuf = ""; }
    else if (ch != '\r' && inBuf.length() < 64) { inBuf += ch; }
  }

  // 2. Tight 100 Hz sample loop
  unsigned long nowUs = micros();
  if (nowUs - lastSampleUs >= SAMPLE_INTERVAL_US) {
    lastSampleUs += SAMPLE_INTERVAL_US;
    if (IMU.accelerationAvailable()) {
      float ax, ay, az;
      IMU.readAcceleration(ax, ay, az);
      processSample(ax, ay, az);
      sampleCount++;
    }
  }
}
