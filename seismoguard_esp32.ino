/**
 * seismoguard_esp32.ino
 * SeismoGuard — ESP32 port with WiFi + LINE Notify alert.
 *
 * Hardware:
 *   - ESP32 DevKit (any variant)
 *   - MPU6050 accelerometer/gyroscope via I²C (SDA=GPIO21, SCL=GPIO22)
 *   - Buzzer on GPIO25 (active-low or active-high, see BUZZER_ACTIVE_HIGH)
 *   - LED on GPIO2 (onboard LED, HIGH=on)
 *
 * Dependencies (install via Library Manager):
 *   - Adafruit MPU6050         (Adafruit)
 *   - Adafruit Unified Sensor  (Adafruit)
 *   - ArduinoJson              (Benoit Blanchon) — used only for JSON payload
 *
 * LINE Notify setup:
 *   1. Go to https://notify-bot.line.me/  → "Generate access token"
 *   2. Paste token into LINE_TOKEN below.
 *   3. Add "LINE Notify" to a LINE group or 1-on-1 chat.
 *
 * Algorithm:
 *   STA/LTA recursive, τ_STA=0.5s, τ_LTA=30s, RATIO=6.0,
 *   MIN_TRIG=3, SPIKE=50×LTA, RATIO_DETRIGGER=1.5
 *   Pd (Wu & Kanamori 2005) computed after P-onset but used for Serial
 *   logging only — unreliable on MEMS due to double-integration noise.
 *
 * 2-Tier Alert (ratio-based):
 *   Tier 1 — peakRatio >= RATIO_TIER1  →  Buzzer + LED        (local warning)
 *   Tier 2 — peakRatio >= RATIO_TIER2  →  Buzzer + LED + LINE (remote alert)
 *   Sub-threshold peakRatio < RATIO_TIER1 → P-wave detected, no alarm (logged)
 *
 *   Both thresholds are initial estimates; calibrate with real earthquake data.
 *
 * Sampling: hardware timer ISR at 50 Hz, non-blocking main loop.
 */

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <math.h>

// ── USER CONFIGURATION ───────────────────────────────────────────────────────
//   Credentials live in config.h (gitignored). Copy config.h.template → config.h
//   and edit before flashing. config.h must define:
//     WIFI_SSID, WIFI_PASSWORD, LINE_TOKEN
#if __has_include("config.h")
  #include "config.h"
#else
  #error "Missing config.h — copy config.h.template to config.h and fill in credentials."
#endif

#define BUZZER_PIN           25
#define LED_PIN               2
#define BUZZER_ACTIVE_HIGH    true    // set false if buzzer sounds when LOW

// ── STA/LTA parameters (tuned by grid search on STEAD dataset) ───────────────
#define SAMPLE_RATE_HZ       50
#define DT                   (1.0f / SAMPLE_RATE_HZ)
#define STA_WINDOW_SEC       0.5f
#define LTA_WINDOW_SEC       30.0f
#define ALPHA_STA            (1.0f / (STA_WINDOW_SEC * SAMPLE_RATE_HZ))   // 0.04
#define ALPHA_LTA            (1.0f / (LTA_WINDOW_SEC * SAMPLE_RATE_HZ))   // 0.000667
#define ALPHA_LTA_BLEED      0.0001f
#define RATIO_TRIGGER        6.0f      // grid-search optimal (439P+250N stratified STEAD)
#define RATIO_DETRIGGER      1.5f
#define MIN_TRIG_COUNT       3         // 3×20ms = 60ms latency
#define SPIKE_LIMIT          50.0f     // grid-search optimal

// ── 2-Tier alert thresholds (ratio-based) ────────────────────────────────────
// Pd double-integration is unreliable on MEMS: noise floor is ~400× higher
// than broadband seismometers, causing gross Mw overestimation on small events.
// Peak STA/LTA ratio during the ALARMING window is used as shaking-intensity
// proxy — no integration required, already normalized to local noise floor.
// Both values are initial estimates — CALIBRATE WITH REAL EARTHQUAKE DATA.
#define RATIO_TIER1          8.0f      // Tier 1: buzzer + LED        (UNTESTED)
#define RATIO_TIER2          25.0f     // Tier 2: buzzer + LED + LINE (UNTESTED)

// ── Pd magnitude estimation (logging only — not used for tier decisions) ─────
#define PD_WINDOW_SAMPLES    150       // 3 s × 50 Hz
#define MPU6050_SCALE_CMS2   (9.80665f / 16384.0f * 100.0f)  // ±2g → cm/s²
#define WK_INTERCEPT         5.39f     // Wu & Kanamori (2005): log10(Mw)=log10(Pd)+5.39

// ── LINE Notify endpoint ──────────────────────────────────────────────────────
#define LINE_HOST            "notify-api.line.me"
#define LINE_PORT            443

// ── Alert cooldown ────────────────────────────────────────────────────────────
#define ALERT_COOLDOWN_MS    30000UL   // 30 s between LINE notifications

// ── State machine ────────────────────────────────────────────────────────────
typedef enum { STANDBY, DETECTING, ALARMING, LOCKOUT } DetectorState;

// ── Globals ──────────────────────────────────────────────────────────────────
Adafruit_MPU6050 mpu;

volatile bool   sampleReady = false;
hw_timer_t     *samplerTimer = NULL;
portMUX_TYPE    mux = portMUX_INITIALIZER_UNLOCKED;

// Detector state
float           sta = 0.0f, lta = 1e-6f;
DetectorState   state = STANDBY;
int             trigCount = 0;
bool            firstSample = true;

// Peak ratio tracker (shaking-intensity proxy for tier decisions)
float           peakRatio   = 0.0f;
bool            alertArmed  = false;   // true when peakRatio >= RATIO_TIER1
bool            lineSent    = false;   // true when LINE notification was sent

// Pd buffer (informational Mw logging only — not used for alarm decisions)
float           pdBuf[PD_WINDOW_SAMPLES];
int             pdBufIdx    = 0;
bool            pdCollecting = false;
int             sampleCount = 0;

unsigned long   lastAlertMs = 0;

// ── Timer ISR: flag @ 50 Hz ───────────────────────────────────────────────────
void IRAM_ATTR onTimer() {
  portENTER_CRITICAL_ISR(&mux);
  sampleReady = true;
  portEXIT_CRITICAL_ISR(&mux);
}

// ── Send LINE Notify message ──────────────────────────────────────────────────
// SECURITY WARNING: This client skips TLS certificate verification.
//   An attacker on the same network (rogue AP, ARP spoofing, compromised router)
//   can intercept the LINE_TOKEN bearer header and impersonate the device.
//   To harden: replace setInsecure() with setCACert() using a pinned root CA
//   (e.g. ISRG Root X1 for Let's Encrypt-issued certs). For local-LAN-only
//   deployments behind a trusted gateway, the risk is reduced.
//   NOTE: LINE Notify was discontinued by LINE on 2025-03-31.
void sendLineNotify(const String &msg) {
  WiFiClientSecure client;
  client.setInsecure();

  if (!client.connect(LINE_HOST, LINE_PORT)) {
    Serial.println("[LINE] Connection failed");
    return;
  }

  String body = "message=" + msg;
  String req =
    String("POST /api/notify HTTP/1.1\r\n") +
    "Host: " LINE_HOST "\r\n" +
    "Authorization: Bearer " LINE_TOKEN "\r\n" +
    "Content-Type: application/x-www-form-urlencoded\r\n" +
    "Content-Length: " + String(body.length()) + "\r\n" +
    "Connection: close\r\n\r\n" +
    body;

  client.print(req);

  unsigned long t0 = millis();
  while (client.connected() && (millis() - t0) < 5000) {
    if (client.available()) {
      String line = client.readStringUntil('\n');
      if (line.startsWith("HTTP/1.1")) {
        Serial.print("[LINE] HTTP status: ");
        Serial.println(line);
        break;
      }
    }
  }
  client.stop();
}

// ── Pd magnitude: Wu & Kanamori (2005) — for Serial logging only ─────────────
float computeMw(float *buf, int n) {
  if (n < 10) return 0.0f;

  // 1. Detrend (remove mean) + scale to cm/s²
  float mean = 0.0f;
  for (int i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  float accel[PD_WINDOW_SAMPLES];
  for (int i = 0; i < n; i++) accel[i] = (buf[i] - mean) * MPU6050_SCALE_CMS2;

  // 2. Integrate → velocity (trapezoidal)
  float vel[PD_WINDOW_SAMPLES] = {0};
  for (int i = 1; i < n; i++)
    vel[i] = vel[i-1] + 0.5f * (accel[i-1] + accel[i]) * DT;

  // 3. Detrend velocity
  float vMean = 0.0f;
  for (int i = 0; i < n; i++) vMean += vel[i];
  vMean /= n;
  for (int i = 0; i < n; i++) vel[i] -= vMean;

  // 4. Integrate → displacement
  float disp[PD_WINDOW_SAMPLES] = {0};
  for (int i = 1; i < n; i++)
    disp[i] = disp[i-1] + 0.5f * (vel[i-1] + vel[i]) * DT;

  // 5. Peak absolute displacement = Pd
  float Pd = 0.0f;
  for (int i = 0; i < n; i++) {
    float d = fabsf(disp[i]);
    if (d > Pd) Pd = d;
  }

  if (Pd <= 0.0f) return 0.0f;
  return log10f(Pd) + WK_INTERCEPT;
}

// ── Buzzer / LED helpers ──────────────────────────────────────────────────────
void alertOn() {
  digitalWrite(LED_PIN,    HIGH);
  digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? HIGH : LOW);
}

void alertOff() {
  digitalWrite(LED_PIN,    LOW);
  digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? LOW : HIGH);
}

// ── setup() ──────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[SeismoGuard ESP32] Booting...");

  // GPIO
  pinMode(LED_PIN,    OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  alertOff();

  // MPU6050
  Wire.begin(21, 22);
  if (!mpu.begin()) {
    Serial.println("[ERROR] MPU6050 not found. Check wiring.");
    while (1) { delay(500); digitalWrite(LED_PIN, !digitalRead(LED_PIN)); }
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
  mpu.setFilterBandwidth(MPU6050_BAND_10_HZ);
  Serial.println("[OK] MPU6050 initialised (+-2g, 10Hz filter)");

  // WiFi
  Serial.print("[WiFi] Connecting to " WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int wifiTries = 0;
  while (WiFi.status() != WL_CONNECTED && wifiTries < 40) {
    delay(500); Serial.print('.'); wifiTries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected. IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] FAILED — running offline (local alert only)");
  }

  // 50 Hz hardware timer
  samplerTimer = timerBegin(0, 80, true);       // Timer0, prescaler=80 → 1 MHz tick
  timerAttachInterrupt(samplerTimer, &onTimer, true);
  timerAlarmWrite(samplerTimer, 20000, true);   // 1,000,000/20,000 = 50 Hz
  timerAlarmEnable(samplerTimer);

  Serial.println("[OK] Sampling timer started @ 50 Hz");
  Serial.println("[OK] SeismoGuard running.  RATIO_TRIGGER=" + String(RATIO_TRIGGER, 1) +
                 "  RATIO_TIER1=" + String(RATIO_TIER1, 1) +
                 "  RATIO_TIER2=" + String(RATIO_TIER2, 1));
}

// ── loop() ───────────────────────────────────────────────────────────────────
void loop() {
  bool ready;
  portENTER_CRITICAL(&mux);
  ready = sampleReady;
  sampleReady = false;
  portEXIT_CRITICAL(&mux);

  if (!ready) return;

  // Read accelerometer
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  float az = a.acceleration.z;    // m/s² (Z-axis)

  // ── STA/LTA ───────────────────────────────────────────────────────────────
  if (firstSample) {
    float cf0 = az * az;
    sta = cf0; lta = cf0;
    firstSample = false;
  }

  float cf = az * az;
  float ltaRef = (lta > 1e-9f) ? lta : 1e-9f;
  if (cf > SPIKE_LIMIT * ltaRef) cf = SPIKE_LIMIT * ltaRef;

  sta = ALPHA_STA * cf + (1.0f - ALPHA_STA) * sta;
  float ratio = (lta > 1e-9f) ? (sta / lta) : 0.0f;

  switch (state) {

    case STANDBY:
      lta = ALPHA_LTA * cf + (1.0f - ALPHA_LTA) * lta;
      if (ratio >= RATIO_TRIGGER) { trigCount++; state = DETECTING; }
      break;

    case DETECTING:
      lta = ALPHA_LTA_BLEED * cf + (1.0f - ALPHA_LTA_BLEED) * lta;
      if (ratio >= RATIO_TRIGGER) {
        trigCount++;
        if (trigCount >= MIN_TRIG_COUNT) {
          state        = ALARMING;
          peakRatio    = ratio;    // seed peak tracker with onset ratio
          alertArmed   = false;
          lineSent     = false;
          pdBufIdx     = 0;
          pdCollecting = true;
          Serial.printf("[ALARM] P-onset at sample %d  ratio=%.2f\n", sampleCount, ratio);
        }
      } else {
        trigCount = 0;
        state = STANDBY;
      }
      break;

    case ALARMING:
      lta = ALPHA_LTA_BLEED * cf + (1.0f - ALPHA_LTA_BLEED) * lta;

      // ── Track peak ratio (shaking-intensity proxy) ─────────────────────
      if (ratio > peakRatio) peakRatio = ratio;

      // ── Tier 1: arm local alarm immediately at RATIO_TIER1 ────────────
      if (!alertArmed && peakRatio >= RATIO_TIER1) {
        alertArmed = true;
        alertOn();
        Serial.printf("[T1] peakRatio=%.1f >= %.1f — local alarm ON\n",
                      peakRatio, RATIO_TIER1);
      }

      // ── Tier 2: send LINE immediately at RATIO_TIER2 ──────────────────
      if (!lineSent && peakRatio >= RATIO_TIER2 &&
          WiFi.status() == WL_CONNECTED &&
          (millis() - lastAlertMs) > ALERT_COOLDOWN_MS) {
        lineSent    = true;
        lastAlertMs = millis();
        String urgency = (peakRatio >= 60.0f) ? "%0A%F0%9F%9A%A8 อันตราย! อพยพออกจากอาคาร!" :
                                                "%0A%E2%9A%A0%EF%B8%8F อยู่ในที่กำบัง ห่างจากหน้าต่าง";
        String msg = "%0A%F0%9F%8C%8D SeismoGuard ตรวจพบแผ่นดินไหว!" +
                     urgency + "%0A"
                     "SeismoGuard EEW v1.0";
        sendLineNotify(msg);
        Serial.printf("[T2] LINE sent  peakRatio=%.1f\n", peakRatio);
      }

      // ── Collect Pd buffer (informational Mw log only) ─────────────────
      if (pdCollecting && pdBufIdx < PD_WINDOW_SAMPLES) {
        pdBuf[pdBufIdx++] = az;
        if (pdBufIdx == PD_WINDOW_SAMPLES) {
          pdCollecting = false;
          float Mw = computeMw(pdBuf, PD_WINDOW_SAMPLES);
          Serial.printf("[Pd] Estimated Mw = %.2f  (informational — unreliable on MEMS)\n", Mw);
        }
      }

      // ── Detrigger ─────────────────────────────────────────────────────
      if (ratio < RATIO_DETRIGGER) {
        if (!alertArmed) {
          Serial.printf("[SILENT] peakRatio=%.1f < %.1f — below threshold, no alarm\n",
                        peakRatio, RATIO_TIER1);
        }
        state = LOCKOUT;
        Serial.println("[LOCKOUT] Ratio fell below detrigger");
      }
      break;

    case LOCKOUT:
      lta = ALPHA_LTA * cf + (1.0f - ALPHA_LTA) * lta;
      alertOff();
      if (ratio < RATIO_DETRIGGER * 0.8f) {
        state      = STANDBY;
        trigCount  = 0;
        peakRatio  = 0.0f;
        alertArmed = false;
        lineSent   = false;
        Serial.println("[STANDBY] Detector reset");
      }
      break;
  }

  sampleCount++;

  // Heartbeat every 10 s
  if (sampleCount % (SAMPLE_RATE_HZ * 10) == 0) {
    Serial.printf("[hb] t=%ds  state=%d  STA=%.4f  LTA=%.4f  ratio=%.3f\n",
                  sampleCount / SAMPLE_RATE_HZ, (int)state, sta, lta, ratio);
  }
}
