/**
 * seismoguard_s3.ino   —   v1.3.0-s3
 * SeismoGuard EEW — ESP32-S3 N16R8 port with rich TFT seismograph + ntfy.sh alert.
 *
 * Hardware:
 *   - ESP32-S3 N16R8 (16MB Flash + 8MB PSRAM)
 *   - MPU6050 on I²C          (SDA=GPIO8, SCL=GPIO9, VCC=3.3V)
 *   - Passive buzzer          (GPIO4 via LEDC PWM)
 *   - TFT 1.8" ST7735         (SCK=12, MOSI=11, CS=10, DC=13, RST=14, BL=15, VCC=3.3V)
 *
 * Arduino IDE board settings:
 *   Board:           "ESP32S3 Dev Module"
 *   PSRAM:           "OPI PSRAM"
 *   Flash Size:      "16MB (128Mb)"
 *   Partition:       "16M Flash (3MB APP/9.9MB FATFS)"
 *   USB CDC On Boot: "Enabled"
 *   Core Version:    esp32 by Espressif >= 3.0.0
 *
 * Required libraries:
 *   Adafruit MPU6050, Adafruit Unified Sensor, Adafruit GFX, Adafruit ST7735/ST7789
 *
 * ntfy.sh: install app, subscribe to NTFY_TOPIC (see config.h). Topics are PUBLIC.
 *
 * TFT variant: override TFT_VARIANT in config.h if colours look wrong.
 *   Options: INITR_BLACKTAB (default), INITR_GREENTAB, INITR_REDTAB
 *
 * Algorithm: STA/LTA recursive on Z-axis CF, tau_STA=0.5s, tau_LTA=30s,
 *   RATIO_TRIGGER=6.0, MIN_TRIG=3, SPIKE=50xLTA, RATIO_DETRIGGER=1.5
 *   Grid-search optimal on STEAD 439P+250N: F1=0.995, AUC=0.9919
 *
 * Magnitude-gated alert (Tier 0★):
 *   STA/LTA trigger opens 3 s Pd estimation window — does NOT alert immediately.
 *   Window accumulates peak displacement (Pd) via HPF→integrate→HPF×2 pipeline.
 *   Mw estimated: Wu & Kanamori (2005) Taiwan — PRELIMINARY, calibrate for Thailand.
 *   Alert (Mw >= MW_ALERT_THRESHOLD) -> buzzer + ntfy
 *   Alert (Mw >= MW_ALERT_THRESHOLD) -> buzzer + ntfy push
 *   Below both thresholds        -> silent reset, no alert
 *   Overridable: #define MW_ALERT_THRESHOLD in config.h
 */

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <FS.h>
#include <FFat.h>
#include <esp_task_wdt.h>
#include <math.h>
#include <time.h>

// ═══════════════════════════════════════════════════════════════════════════
// USER CONFIGURATION — credentials + optional overrides live in config.h
//   Copy config.h.template -> config.h and fill in before flashing.
//   Required: WIFI_SSID, WIFI_PASSWORD, NTFY_TOPIC
//   Optional overrides: MW_ALERT_THRESHOLD, MW_R_KM, TFT_VARIANT
// ═══════════════════════════════════════════════════════════════════════════
#if __has_include("config.h")
  #include "config.h"
#else
  #error "Missing config.h — copy config.h.template to config.h and fill in credentials."
#endif

#define NTFY_HOST   "ntfy.sh"
#define NTFY_PORT   443
#define FW_VERSION  "1.4.1-s3"

// ═══════════════════════════════════════════════════════════════════════════
// PIN ASSIGNMENTS (ESP32-S3)
// ═══════════════════════════════════════════════════════════════════════════
#define PIN_I2C_SDA    8
#define PIN_I2C_SCL    9
#define PIN_BUZZER     4
#define PIN_TFT_SCK   12
#define PIN_TFT_MOSI  11
#define PIN_TFT_CS    10
#define PIN_TFT_DC    13
#define PIN_TFT_RST   14
#define PIN_TFT_BL    15

// ═══════════════════════════════════════════════════════════════════════════
// BUZZER
// ═══════════════════════════════════════════════════════════════════════════
#define BUZZER_PWM_BASE_FREQ 2000
#define BUZZER_PWM_RES       10
#define BUZZER_FREQ_LO       1500
#define BUZZER_FREQ_HI       2500
#define BUZZER_DUTY_ON       512   // 50% of 1024

// ═══════════════════════════════════════════════════════════════════════════
// STA/LTA PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════
#define SAMPLE_RATE_HZ     50
#define SAMPLE_INTERVAL_US 20000        // 1e6 / 50
#define ALPHA_STA          0.04f        // 1 / (0.5s * 50Hz)
#define ALPHA_LTA          0.000667f    // 1 / (30s  * 50Hz)
#define ALPHA_LTA_BLEED    0.0001f
#define ALPHA_DC           0.002f       // DC tracker tau ~10s @ 50Hz
#define RATIO_TRIGGER      6.0f
#define RATIO_DETRIGGER    1.5f
#define MIN_TRIG_COUNT     3
#define SPIKE_LIMIT        50.0f

// Named constants replacing former magic numbers
#define SIGN_THRESHOLD    0.01f     // dz deadband for ZC sign detection
#define LTA_FLOOR         1e-9f     // prevent div-by-zero in ratio
#define SIREN_TOGGLE_MS   250       // buzzer alternation half-period (ms)
#define CALIB_NOISE_MAX   2.0f      // noiseRatio limit before retry
#define CALIB_LTA_FAST    0.02f     // calibration LTA EMA fast coeff
#define CALIB_LTA_SLOW    0.98f     // calibration LTA EMA slow coeff
#define LOCKOUT_EXIT_FRAC 0.8f      // ratio < RATIO_DETRIGGER*this -> STANDBY

// ── v1.3.1 bench-tap rejection + alarm/lockout timeouts ──
// Why: still sensor -> LTA ~1e-6 -> spike clamp ratio ceiling=50 -> tiny tap fires T2.
//      LOCKOUT only exits via ratio<1.2 -> sustained shaking stuck, no re-arm path.
#define MIN_TRIG_CF_ABS      2e-4f      // absolute CF floor — reject sub-mg taps
#define ALARM_MAX_MS         15000UL    // max alarm duration -> forced LOCKOUT
#define LOCKOUT_MAX_MS       5000UL     // max LOCKOUT -> forced STANDBY
#define LOCKOUT_BREAK_FACTOR 2.0f       // ratio >= peak*this in LOCKOUT -> ALARMING

// Tier thresholds — overridable in config.h before first #include
#ifndef RATIO_TIER1
  #define RATIO_TIER1   8.0f
#endif
#ifndef RATIO_TIER2
  #define RATIO_TIER2  25.0f
#endif

// ── Magnitude-gated alert (Pd window) ──
// Two tiers only: Mw >= MW_ALERT_THRESHOLD → buzzer + ntfy; below → silent reset.
// Integration: HPF→∫→HPF→∫→HPF on Z-axis only (drift-kill).
// Formula: Wu & Kanamori (2005) BSSA Taiwan — PRELIMINARY for Thailand deployment.
//   Mw = MW_PD_A*log10(Pd_m) + MW_PD_B*log10(R_km) + MW_PD_C
#define MAG_WINDOW_SAMPLES    150       // 3 s at 50 Hz
#define HPF_ALPHA             0.9804f   // 1 Hz HPF corner @ dt=20 ms: tau/(tau+dt)
#define MW_PD_A               0.813f   // 1/1.23
#define MW_PD_B               1.512f   // 1.86/1.23
#define MW_PD_C               5.130f   // 6.31/1.23
#define MW_R_KM               10.0f    // assumed hypocentral distance (single-station)
#ifndef MW_ALERT_THRESHOLD
  #define MW_ALERT_THRESHOLD  5.0f     // Mw >= this -> buzzer + ntfy
#endif

#define ALERT_COOLDOWN_MS     30000UL   // ntfy re-arm cooldown
#define WIFI_RECONNECT_MS     30000UL
#define HB_INTERVAL_SAMPLES   (SAMPLE_RATE_HZ * 10)   // 10s
#define HB_NTFY_MS            (6UL * 3600UL * 1000UL)  // 6h

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LOG
// ═══════════════════════════════════════════════════════════════════════════
#define CSV_MAX_BYTES  (500UL * 1024UL)   // rotate at 500 KB

// ═══════════════════════════════════════════════════════════════════════════
// SERIAL LOG QUEUE (deferred prints — keeps processSample non-blocking)
// ═══════════════════════════════════════════════════════════════════════════
#define SERIAL_LOG_MAX  8
#define SERIAL_LOG_LEN  128

// ═══════════════════════════════════════════════════════════════════════════
// TFT LAYOUT (landscape 160x128)
// ═══════════════════════════════════════════════════════════════════════════
#define TFT_W    160
#define TFT_H    128
#define WAVE_W   (TFT_W - 8)   // waveform canvas width

#ifndef TFT_VARIANT
  #define TFT_VARIANT INITR_BLACKTAB
#endif

#define HDR_Y     0
#define HDR_H    12
#define STATUS_Y 15
#define STATUS_H 13
#define WAVE_TOP 31
#define WAVE_BOT 79
#define WAVE_H   (WAVE_BOT - WAVE_TOP)
#define WAVE_MID ((WAVE_TOP + WAVE_BOT) / 2)
#define METER_Y  83
#define METER_H   9
#define METER_X  32
#define METER_W  (TFT_W - METER_X - 4)
#define STATS_Y  96
#define STATS_H  30

#define DZ_DISPLAY_MAX  0.6f   // +/-0.6 m/s2 -> full deflection
#define REFRESH_MS      100    // 10 Hz

// ═══════════════════════════════════════════════════════════════════════════
// ZC FILTER
// ═══════════════════════════════════════════════════════════════════════════
#define ZC_WINDOW        10
#define ZC_MIN_FOR_PWAVE  2

// ═══════════════════════════════════════════════════════════════════════════
// COLOURS (RGB565)
// ═══════════════════════════════════════════════════════════════════════════
#define COLOR_BLACK     0x0000
#define COLOR_WHITE     0xFFFF
#define COLOR_RED       0xF800
#define COLOR_GREEN     0x07E0
#define COLOR_BLUE      0x001F
#define COLOR_CYAN      0x07FF
#define COLOR_YELLOW    0xFFE0
#define COLOR_MAGENTA   0xF81F
#define COLOR_ORANGE    0xFD20
#define COLOR_DARKGREY  0x39E7
#define COLOR_DIM       0x52AA
#define COLOR_DARKRED   0x7800
#define COLOR_DARKGREEN 0x0400
#define COLOR_DIMGREEN  0x03E0
#define COLOR_DIMCYAN   0x04B3
#define COLOR_GRID      0x2104
#define COLOR_ACCENT    0x04FF
#define COLOR_METER_LO  0x03E0
#define COLOR_METER_MID 0xFD20
#define COLOR_METER_HI  0xF800

// ═══════════════════════════════════════════════════════════════════════════
// GLOBALS
// ═══════════════════════════════════════════════════════════════════════════
Adafruit_MPU6050 mpu;
Adafruit_ST7735  tft(PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST);
GFXcanvas16     *waveCanvas = nullptr;   // allocated after PSRAM available

hw_timer_t   *samplerTimer = nullptr;
portMUX_TYPE  samplerMux   = portMUX_INITIALIZER_UNLOCKED;
volatile uint32_t tickCount = 0;

enum DetState : uint8_t { STANDBY = 0, DETECTING = 1, ALARMING = 2, LOCKOUT = 3 };
DetState state = STANDBY;

float sta          = 0.0f;
float lta          = 1.0f;
float ltaQuiet     = 1.0f;   // calibrated quiet-ambient baseline — reseed lta on LOCKOUT exit
float smoothedX    = 0.0f;
float smoothedY    = 0.0f;
float smoothedZ    = 0.0f;
bool  smoothedZInit = false;
int   trigCount    = 0;
float peakRatio    = 0.0f;
bool  alertArmed   = false;
bool  ntfySent     = false;

int zcBuf[ZC_WINDOW];
int zcHead    = 0;
int zcRunning = 0;   // maintained running sum — O(1) per sample
int lastDzSign = 0;

unsigned long lastAlertMs     = 0;
unsigned long sampleCount     = 0;
unsigned long missedSamples   = 0;
unsigned long lastWifiCheckMs = 0;
unsigned long lastHbNtfyMs    = 0;

float waveBuf[TFT_W];
int   waveHead = 0;

float         curRatio      = 0.0f;
unsigned long lastRefreshMs = 0;

uint32_t currentBuzzerFreq = 0;

unsigned long bootMs     = 0;
uint32_t      eventCount = 0;   // uint32 — no wraparound

// ntfy job queue
struct NtfyJob {
  char title[48];
  char body[256];
  char priority[16];
  char tags[64];
};
QueueHandle_t ntfyQueue      = NULL;
TaskHandle_t  ntfyTaskHandle = NULL;

WiFiClientSecure ntfyClient;           // persistent TLS session across sends
bool             ntfyClientReady = false;

char ntfyTopicFull[48] = NTFY_TOPIC;

bool        fsOk         = false;
const char *LOG_PATH     = "/events.csv";
unsigned long alarmStartMs   = 0;
unsigned long lockoutStartMs = 0;
int           alarmZcAtTrig  = 0;

time_t bootEpoch = 0;   // NTP epoch at boot for CSV timestamps

// Serial log queue — processSample enqueues, loop() drains
struct SerialLog { char msg[SERIAL_LOG_LEN]; };
static SerialLog serialLogBuf[SERIAL_LOG_MAX];
static uint8_t   serialLogHead = 0;
static uint8_t   serialLogTail = 0;

// Shared across processSample sub-functions
static float s_cf     = 0.0f;
static int   s_zcCount = 0;
static float s_ratio  = 0.0f;

// ── Integration pipeline: HPF→∫→HPF→∫→HPF (runs every sample) ──
static float hpf_a_in  = 0.0f;   // previous raw dz input to first HPF
static float hpf_a_out = 0.0f;   // previous output of first HPF (on accel)
static float vel       = 0.0f;   // velocity (integrated from HPF-filtered accel)
static float hpf_v_in  = 0.0f;   // previous vel input to second HPF
static float hpf_v_out = 0.0f;   // previous output of second HPF (on velocity)
static float disp      = 0.0f;   // displacement (integrated from HPF-filtered vel)
static float hpf_d_in  = 0.0f;   // previous disp input to third HPF
static float hpf_d_out = 0.0f;   // previous output of third HPF (on displacement)

// ── Pd window accumulators (reset each ALARMING entry) ──
static float  tc_num     = 0.0f;
static float  tc_den     = 0.0f;
static float  pd_max     = 0.0f;
static int    mag_samples = 0;
static float  mw_est     = -99.0f;

// ═══════════════════════════════════════════════════════════════════════════
// SERIAL LOG QUEUE HELPERS
// ═══════════════════════════════════════════════════════════════════════════
static void serialLogEnqueue(const char *msg) {
  uint8_t next = (serialLogHead + 1) % SERIAL_LOG_MAX;
  if (next == serialLogTail) return;   // full — drop rather than block
  strncpy(serialLogBuf[serialLogHead].msg, msg, SERIAL_LOG_LEN - 1);
  serialLogBuf[serialLogHead].msg[SERIAL_LOG_LEN - 1] = '\0';
  serialLogHead = next;
}

static void serialLogDrain() {
  while (serialLogTail != serialLogHead) {
    Serial.print(serialLogBuf[serialLogTail].msg);
    serialLogTail = (serialLogTail + 1) % SERIAL_LOG_MAX;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMER ISR
// ═══════════════════════════════════════════════════════════════════════════
void IRAM_ATTR onSamplerTimer() {
  portENTER_CRITICAL_ISR(&samplerMux);
  tickCount++;
  portEXIT_CRITICAL_ISR(&samplerMux);
}

// ═══════════════════════════════════════════════════════════════════════════
// BUZZER HELPERS
// ═══════════════════════════════════════════════════════════════════════════
void buzzerSetTone(uint32_t freq) {
  if (freq == currentBuzzerFreq) return;
  currentBuzzerFreq = freq;
  if (freq == 0) ledcWrite(PIN_BUZZER, 0);
  else           ledcWriteTone(PIN_BUZZER, freq);
}
inline void buzzerOff() { buzzerSetTone(0); }

void buzzerSiren(unsigned long t) {
  bool high = ((t / SIREN_TOGGLE_MS) & 1);
  buzzerSetTone(high ? BUZZER_FREQ_HI : BUZZER_FREQ_LO);
}

// ═══════════════════════════════════════════════════════════════════════════
// NTFY SENDER — persistent TLS client, complete write loop
// ═══════════════════════════════════════════════════════════════════════════
static bool writeAll(WiFiClientSecure &c, const uint8_t *buf, size_t len) {
  size_t sent = 0;
  unsigned long t0 = millis();
  while (sent < len) {
    if (millis() - t0 > 5000) return false;
    int n = c.write(buf + sent, len - sent);
    if (n <= 0) return false;
    sent += n;
  }
  return true;
}

void sendNtfy(const char *title, const String &body,
              const char *priority, const char *tags) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[ntfy] WiFi offline — skip"));
    return;
  }

  // 1. ตรวจสอบ RAM ก่อนเริ่มงาน HTTPS (TLS กินแรมเยอะมาก)
  size_t freeHeap = ESP.getFreeHeap();
  if (freeHeap < 15000) { // หากแรมน้อยกว่า 15KB อาจจะทำ TLS Handshake ไม่สำเร็จ
    Serial.printf("[ntfy] WARNING: Low memory (%u bytes)\n", freeHeap);
  }

  // 2. ถ้าเป็นข้อความด่วน (Urgent/High) ให้ Force Reconnect เสมอ
  // เพื่อป้องกันปัญหา "การเชื่อมต่อค้างแต่ใช้ไม่ได้" (Zombie Connection)
  bool isUrgent = (strcmp(priority, "urgent") == 0 || strcmp(priority, "high") == 0);
  if (isUrgent || !ntfyClient.connected()) {
    if (ntfyClient.connected()) {
      Serial.println(F("[ntfy] Urgent msg: Closing old connection for fresh start"));
      ntfyClient.stop();
    }
    ntfyClientReady = false;
  }

  if (!ntfyClientReady || !ntfyClient.connected()) {
    ntfyClient.stop();
    ntfyClient.setInsecure(); // ข้ามการเช็ค Cert เพื่อความเร็ว
    ntfyClient.setHandshakeTimeout(10);
    ntfyClient.setTimeout(5000);
    
    ntfyClientReady = ntfyClient.connect(NTFY_HOST, NTFY_PORT);
    if (!ntfyClientReady) {
      Serial.println(F("[ntfy] Connection failed"));
      return;
    }
  }

  // 3. ป้องกันบัฟเฟอร์ล้น (Header Construction)
  char hdr[512];
  int hdrLen = snprintf(hdr, sizeof(hdr),
    "POST /%s HTTP/1.1\r\n"
    "Host: %s\r\n"
    "Title: %s\r\n"
    "Priority: %s\r\n"
    "Tags: %s\r\n"
    "Content-Type: text/plain; charset=utf-8\r\n"
    "Content-Length: %u\r\n"
    "Connection: keep-alive\r\n\r\n",
    ntfyTopicFull, NTFY_HOST, title, priority, tags, (unsigned)body.length());

  if (hdrLen < 0 || hdrLen >= (int)sizeof(hdr)) {
    Serial.println(F("[ntfy] Header too long"));
    ntfyClient.stop(); ntfyClientReady = false;
    return;
  }

  // 4. ส่งข้อมูลและเช็คสถานะทันที
  bool ok = writeAll(ntfyClient, (const uint8_t*)hdr, hdrLen) &&
            writeAll(ntfyClient, (const uint8_t*)body.c_str(), body.length());
            
  if (!ok) {
    Serial.println(F("[ntfy] Write failed"));
    ntfyClient.stop(); ntfyClientReady = false;
    return;
  }

  // 5. อ่าน Response แบบใจเย็นขึ้น (เผื่อ Hotspot ช้า)
  unsigned long t0 = millis();
  bool gotResponse = false;
  while (ntfyClient.connected() && (millis() - t0) < 3000) { // รอคำตอบ 3 วินาที
    if (ntfyClient.available()) {
      String line = ntfyClient.readStringUntil('\n');
      if (line.indexOf("HTTP/1.1 200") != -1) {
        Serial.println(F("[ntfy] Success 200 OK"));
        gotResponse = true;
        break;
      }
    }
    delay(10);
  }

  if (!gotResponse) {
    Serial.println(F("[ntfy] No response or error"));
    ntfyClient.stop(); ntfyClientReady = false;
  }
}

void enqueueNtfy(const char *title, const String &body,
                 const char *priority, const char *tags) {
  if (!ntfyQueue) { Serial.println(F("[ntfy] queue not ready")); return; }
  NtfyJob job;
  strncpy(job.title,    title,        sizeof(job.title)    - 1); job.title[sizeof(job.title)-1]       = '\0';
  strncpy(job.body,     body.c_str(), sizeof(job.body)     - 1); job.body[sizeof(job.body)-1]         = '\0';
  strncpy(job.priority, priority,     sizeof(job.priority) - 1); job.priority[sizeof(job.priority)-1] = '\0';
  strncpy(job.tags,     tags,         sizeof(job.tags)     - 1); job.tags[sizeof(job.tags)-1]         = '\0';
  if (xQueueSend(ntfyQueue, &job, 0) != pdTRUE)
    Serial.println(F("[ntfy] queue full — dropping"));
}

// Core 0, priority 3 (above loopTask=1), 12KB stack (TLS handshake ~6KB peak)
void ntfyTask(void *pv) {
  NtfyJob job;
  for (;;) {
    if (xQueueReceive(ntfyQueue, &job, portMAX_DELAY) == pdTRUE)
      sendNtfy(job.title, String(job.body), job.priority, job.tags);
  }
}

void generateNtfyTopic() {
  uint64_t mac = ESP.getEfuseMac();
  char suffix[10];
  snprintf(suffix, sizeof(suffix), "%08X", (unsigned)(mac & 0xFFFFFFFFUL));  // 32-bit suffix
  snprintf(ntfyTopicFull, sizeof(ntfyTopicFull), "%s-%s", NTFY_TOPIC, suffix);
  Serial.printf("[ntfy] Topic: %s\n", ntfyTopicFull);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LOGGER — CSV on FFat with size cap + NTP epoch timestamps
// ═══════════════════════════════════════════════════════════════════════════
void initEventLog() {
  if (!FFat.begin()) {
    Serial.println(F("[FS] FFat mount failed — formatting..."));
    if (!FFat.begin(true)) {
      Serial.println(F("[FS] format failed — logging disabled"));
      return;
    }
  }
  fsOk = true;
  Serial.printf("[FS] FFat  total=%u  used=%u bytes\n",
                (unsigned)FFat.totalBytes(), (unsigned)FFat.usedBytes());
  if (!FFat.exists(LOG_PATH)) {
    File f = FFat.open(LOG_PATH, FILE_WRITE);
    if (f) { f.println(F("epoch,event,peak_ratio,lta,zc,dur_s,t1,t2")); f.close(); }
  }
  File f = FFat.open(LOG_PATH, FILE_READ);
  if (f) {
    int n = 0;
    while (f.available()) { if (f.read() == '\n') n++; }
    f.close();
    if (n > 1) Serial.printf("[FS] existing events: %d\n", n - 1);
  }
}

static void rotateLog() {
  FFat.remove("/events_old.csv");
  FFat.rename(LOG_PATH, "/events_old.csv");
  File f = FFat.open(LOG_PATH, FILE_WRITE);
  if (f) { f.println(F("epoch,event,peak_ratio,lta,zc,dur_s,t1,t2")); f.close(); }
  Serial.println(F("[FS] log rotated -> events_old.csv"));
}

void logEvent(uint32_t evt, float peak, float ltaVal,
              int zc, float durSec, bool t1, bool t2) {
  if (!fsOk) return;

  File fChk = FFat.open(LOG_PATH, FILE_READ);
  if (fChk) {
    if (fChk.size() > CSV_MAX_BYTES) { fChk.close(); rotateLog(); }
    else fChk.close();
  }

  File f = FFat.open(LOG_PATH, FILE_APPEND);
  if (!f) { Serial.println(F("[FS] log open failed")); return; }
  time_t now = time(nullptr);
  f.printf("%lu,%u,%.2f,%.6f,%d,%.2f,%d,%d\n",
           (unsigned long)now, (unsigned)evt, (double)peak, (double)ltaVal,
           zc, (double)durSec, t1 ? 1 : 0, t2 ? 1 : 0);
  f.close();
  Serial.printf("[FS] event#%u  peak=%.2f  dur=%.1fs\n",
                (unsigned)evt, (double)peak, (double)durSec);
}

// ═══════════════════════════════════════════════════════════════════════════
// TFT HELPERS
// ═══════════════════════════════════════════════════════════════════════════
uint16_t stateColor(DetState s) {
  switch (s) {
    case STANDBY:   return COLOR_GREEN;
    case DETECTING: return COLOR_YELLOW;
    case ALARMING:  return COLOR_RED;
    case LOCKOUT:   return COLOR_BLUE;
    default: __builtin_unreachable();
  }
}

const char* stateName(DetState s) {
  switch (s) {
    case STANDBY:   return "STANDBY";
    case DETECTING: return "DETECTING";
    case ALARMING:  return "ALARMING";
    case LOCKOUT:   return "LOCKOUT";
    default: __builtin_unreachable();
  }
}

void drawLightningIcon(int x, int y, uint16_t c) {
  tft.drawLine(x + 4, y,     x,     y + 5, c);
  tft.drawLine(x,     y + 5, x + 3, y + 5, c);
  tft.drawLine(x + 3, y + 5, x + 2, y + 8, c);
  tft.drawLine(x + 2, y + 8, x + 6, y + 3, c);
  tft.drawLine(x + 6, y + 3, x + 3, y + 3, c);
  tft.drawLine(x + 3, y + 3, x + 4, y,     c);
  tft.drawPixel(x + 3, y + 2, c);
  tft.drawPixel(x + 2, y + 4, c);
  tft.drawPixel(x + 4, y + 4, c);
  tft.drawPixel(x + 3, y + 6, c);
}

void drawWiFiBars(int x, int y, int rssi, bool connected) {
  int level = 0;
  if (connected) {
    if      (rssi > -55) level = 4;
    else if (rssi > -65) level = 3;
    else if (rssi > -75) level = 2;
    else                 level = 1;
  }
  tft.fillRect(x, y, 11, 9, COLOR_BLACK);
  uint16_t onC = connected ? COLOR_CYAN : COLOR_DARKGREY;
  for (int b = 0; b < 4; b++) {
    int h  = 2 + b * 2;
    int bx = x + b * 3;
    int by = y + 8 - h;
    tft.fillRect(bx, by, 2, h, (b < level) ? onC : COLOR_GRID);
  }
}

void drawStatusBadge() {
  uint16_t bg = stateColor(state);
  uint16_t fg = COLOR_BLACK;
  if (state == ALARMING) {
    fg = COLOR_WHITE;
    if (alertArmed) {
      bool flash = ((millis() / SIREN_TOGGLE_MS) & 1);
      bg = flash ? COLOR_RED : COLOR_DARKRED;
    }
  }
  tft.fillRoundRect(2, STATUS_Y, TFT_W - 4, STATUS_H, 2, bg);
  tft.drawRoundRect(2, STATUS_Y, TFT_W - 4, STATUS_H, 2, COLOR_WHITE);
  const char *name = stateName(state);
  int tx = (TFT_W - (int)strlen(name) * 6) / 2;
  tft.setCursor(tx, STATUS_Y + 3);
  tft.setTextColor(fg, bg);
  tft.setTextSize(1);
  tft.print(name);
  if (state == ALARMING && alertArmed) {
    tft.setCursor(6, STATUS_Y + 3);           tft.print('!');
    tft.setCursor(TFT_W - 12, STATUS_Y + 3);  tft.print('!');
  }
}

uint16_t meterColor(float r) {
  if (r >= RATIO_TIER2)   return COLOR_METER_HI;
  if (r >= RATIO_TIER1)   return COLOR_METER_MID;
  if (r >= RATIO_TRIGGER) return COLOR_YELLOW;
  return COLOR_METER_LO;
}

void drawRatioMeter() {
  tft.setCursor(2, METER_Y + 1);
  tft.setTextColor(COLOR_WHITE, COLOR_BLACK);
  tft.print(F("R:"));
  tft.setTextColor(meterColor(curRatio), COLOR_BLACK);
  char buf[8];
  snprintf(buf, sizeof(buf), "%4.1f", (double)curRatio);
  tft.print(buf);

  tft.drawRect(METER_X, METER_Y, METER_W, METER_H, COLOR_DARKGREY);
  tft.fillRect(METER_X + 1, METER_Y + 1, METER_W - 2, METER_H - 2, COLOR_BLACK);

  float full = RATIO_TIER2 + 5.0f;
  float frac = curRatio / full;
  if (frac > 1.0f) frac = 1.0f;
  if (frac < 0.0f) frac = 0.0f;
  int filled = (int)(frac * (METER_W - 2));
  for (int i = 0; i < filled; i++) {
    float rAt = (float)i / (METER_W - 2) * full;
    tft.drawFastVLine(METER_X + 1 + i, METER_Y + 1, METER_H - 2, meterColor(rAt));
  }

  int t1x = METER_X + (int)((RATIO_TIER1 / full) * (METER_W - 2));
  tft.drawFastVLine(t1x, METER_Y - 1, 1, COLOR_WHITE);
  tft.drawFastVLine(t1x, METER_Y + METER_H, 1, COLOR_WHITE);

  int t2x = METER_X + (int)((RATIO_TIER2 / full) * (METER_W - 2));
  tft.drawFastVLine(t2x, METER_Y - 1, 1, COLOR_RED);
  tft.drawFastVLine(t2x, METER_Y + METER_H, 1, COLOR_RED);

  if (peakRatio > 0.1f) {
    float pk = (peakRatio < full) ? peakRatio : full;
    int px = METER_X + 1 + (int)((pk / full) * (METER_W - 2));
    tft.drawFastVLine(px, METER_Y + 1, METER_H - 2, COLOR_WHITE);
  }
}

void formatUptime(uint32_t ms, char *out, size_t n) {
  uint32_t sec = ms / 1000;
  uint32_t hh  = sec / 3600;
  uint32_t mm  = (sec % 3600) / 60;
  uint32_t ss  = sec % 60;
  if (hh > 0) snprintf(out, n, "%02u:%02u:%02u", (unsigned)hh, (unsigned)mm, (unsigned)ss);
  else        snprintf(out, n, "%02u:%02u", (unsigned)mm, (unsigned)ss);
}

int dzToY(float dz) {
  float clamped = fminf(fmaxf(dz, -DZ_DISPLAY_MAX), DZ_DISPLAY_MAX);
  float norm    = (clamped + DZ_DISPLAY_MAX) / (2.0f * DZ_DISPLAY_MAX);
  int   y       = WAVE_BOT - (int)(norm * WAVE_H);
  if (y < WAVE_TOP) y = WAVE_TOP;
  if (y > WAVE_BOT) y = WAVE_BOT;
  return y;
}

void tftDrawChrome() {
  tft.fillScreen(COLOR_BLACK);
  tft.setTextSize(1);
  drawLightningIcon(2, 1, COLOR_YELLOW);
  tft.setCursor(12, 2);
  tft.setTextColor(COLOR_WHITE, COLOR_BLACK);
  tft.print(F("SeismoGuard"));
  tft.setTextColor(COLOR_DIM, COLOR_BLACK);
  tft.print(' ');
  tft.print(F(FW_VERSION));
  tft.drawFastHLine(0, HDR_H + 1, TFT_W, COLOR_ACCENT);
  tft.setTextColor(COLOR_DIM, COLOR_BLACK);
  tft.setCursor(1, WAVE_TOP);     tft.print('+');
  tft.setCursor(1, WAVE_MID - 3); tft.print('0');
  tft.setCursor(1, WAVE_BOT - 7); tft.print('-');
  for (int x = 12; x < TFT_W; x += 10)
    for (int y = WAVE_TOP + 4; y < WAVE_BOT; y += 8)
      tft.drawPixel(x, y, COLOR_GRID);
  tft.drawFastHLine(8, WAVE_MID, TFT_W - 8, COLOR_DIM);
  tft.drawFastHLine(0, WAVE_BOT + 1, TFT_W, COLOR_DARKGREY);
  tft.drawFastHLine(0, STATS_Y - 2, TFT_W, COLOR_DARKGREY);
}

// Refresh dynamic elements ~10 Hz.
// Waveform rendered into GFXcanvas16 then blitted — no per-pixel SPI flicker.
void tftRefresh() {
  unsigned long now = millis();

  int rssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : -127;
  drawWiFiBars(TFT_W - 13, HDR_Y + 2, rssi, WiFi.status() == WL_CONNECTED);
  drawStatusBadge();

  if (waveCanvas) {
    waveCanvas->fillScreen(COLOR_BLACK);

    // Grid dots
    for (int x = 4; x < WAVE_W; x += 10)
      for (int y = 4; y < WAVE_H; y += 8)
        waveCanvas->drawPixel(x, y, COLOR_GRID);

    // Centerline
    waveCanvas->drawFastHLine(0, WAVE_H / 2, WAVE_W, COLOR_DIM);

    uint16_t wcolor = stateColor(state);
    if (state == ALARMING && alertArmed) {
      for (int x = 0; x < WAVE_W; x++) {
        int i0  = (waveHead + x) % TFT_W;
        int raw = dzToY(waveBuf[i0]) - WAVE_TOP;
        int mid = WAVE_H / 2;
        if (raw < mid) waveCanvas->drawFastVLine(x, raw,     mid - raw,     COLOR_DARKRED);
        else if (raw > mid) waveCanvas->drawFastVLine(x, mid + 1, raw - mid, COLOR_DARKRED);
        waveCanvas->drawPixel(x, raw, wcolor);
      }
    } else {
      for (int x = 0; x < WAVE_W - 1; x++) {
        int i0 = (waveHead + x)     % TFT_W;
        int i1 = (waveHead + x + 1) % TFT_W;
        waveCanvas->drawLine(x,     dzToY(waveBuf[i0]) - WAVE_TOP,
                             x + 1, dzToY(waveBuf[i1]) - WAVE_TOP, wcolor);
      }
    }
    tft.drawRGBBitmap(8, WAVE_TOP, waveCanvas->getBuffer(), WAVE_W, WAVE_H + 1);
  }

  drawRatioMeter();

  tft.setCursor(2, STATS_Y);
  tft.setTextColor(alertArmed ? COLOR_RED : COLOR_WHITE, COLOR_BLACK);
  if (state == ALARMING && mw_est > -90.0f) {
    tft.printf("Mw:%4.1f ", (double)mw_est);
  } else {
    tft.printf("P:%5.1f ", (double)peakRatio);
  }
  tft.setTextColor(COLOR_CYAN, COLOR_BLACK);
  tft.printf("E%04u ", (unsigned)eventCount);
  tft.setTextColor(COLOR_DIM, COLOR_BLACK);
  char upbuf[12];
  formatUptime(now - bootMs, upbuf, sizeof(upbuf));
  tft.printf("%-8s", upbuf);

  tft.setCursor(2, STATS_Y + 12);
  tft.setTextColor(ntfySent ? COLOR_CYAN : (alertArmed ? COLOR_RED : COLOR_DARKGREY), COLOR_BLACK);
  tft.print(ntfySent ? F("ALRT* ") : (alertArmed ? F("ALRT  ") : F("      ")));
  tft.setTextColor(COLOR_DIM, COLOR_BLACK);
  if (WiFi.status() == WL_CONNECTED) {
    IPAddress ip = WiFi.localIP();
    tft.printf("%d.%d.%d.%-3d   ", ip[0], ip[1], ip[2], ip[3]);
  } else {
    tft.print(F("offline       "));
  }
}

void showSplash() {
  tft.fillScreen(COLOR_BLACK);
  int cx = TFT_W / 2 - 3;
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++)
      drawLightningIcon(cx + dx, 28 + dy, COLOR_ORANGE);
  drawLightningIcon(cx, 28, COLOR_YELLOW);
  tft.setTextSize(2);
  tft.setTextColor(COLOR_WHITE, COLOR_BLACK);
  tft.setCursor(14, 50);
  tft.print(F("SeismoGuard"));
  tft.setTextSize(1);
  tft.setTextColor(COLOR_CYAN, COLOR_BLACK);
  tft.setCursor(50, 70);
  tft.print(F("EEW v")); tft.print(F(FW_VERSION));
  tft.setTextColor(COLOR_DIM, COLOR_BLACK);
  tft.setCursor(18, 82);
  tft.print(F("STA/LTA  F1 = 0.995"));
  tft.drawRect(20, 100, 120, 8, COLOR_WHITE);
  for (int p = 0; p < 118; p++) {
    uint16_t c = (p < 40) ? COLOR_DIMGREEN : (p < 80) ? COLOR_CYAN : COLOR_ACCENT;
    tft.drawFastVLine(21 + p, 101, 6, c);
    delay(6);
  }
  tft.setCursor(48, 114);
  tft.setTextColor(COLOR_ORANGE, COLOR_BLACK);
  tft.print(F("ready."));
  delay(250);
}

// ═══════════════════════════════════════════════════════════════════════════
// WIFI RECONNECT
// ═══════════════════════════════════════════════════════════════════════════
void checkWiFi(unsigned long now) {
  if (now - lastWifiCheckMs < WIFI_RECONNECT_MS) return;
  lastWifiCheckMs = now;
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.println(F("[WiFi] Lost — reconnecting..."));
  WiFi.disconnect(false, false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ═══════════════════════════════════════════════════════════════════════════
// CALIBRATION — extracted to allow retry on high noise
// Returns true if noiseRatio acceptable.
// ═══════════════════════════════════════════════════════════════════════════
bool runCalibration(int barX, int barY, int barW, int barH) {
  sensors_event_t a, g, tmp;
  mpu.getEvent(&a, &g, &tmp);
  smoothedX     = a.acceleration.x;
  smoothedY     = a.acceleration.y;
  smoothedZ     = a.acceleration.z;
  smoothedZInit = true;

  const int CALIB_N = 1500;   // 30s * 50Hz
  float ltaInit = 0.0f;
  float sumSq   = 0.0f;
  float sumSqSq = 0.0f;

  for (int i = 0; i < CALIB_N; i++) {
    mpu.getEvent(&a, &g, &tmp);
    float dx = a.acceleration.x - smoothedX;
    float dy = a.acceleration.y - smoothedY;
    float dz = a.acceleration.z - smoothedZ;
    smoothedX = ALPHA_DC * a.acceleration.x + (1.0f - ALPHA_DC) * smoothedX;
    smoothedY = ALPHA_DC * a.acceleration.y + (1.0f - ALPHA_DC) * smoothedY;
    smoothedZ = ALPHA_DC * a.acceleration.z + (1.0f - ALPHA_DC) * smoothedZ;
    float cf0  = dx * dx + dy * dy + dz * dz;
    sumSq    += cf0;
    sumSqSq  += cf0 * cf0;
    ltaInit   = (i == 0) ? cf0 : (CALIB_LTA_FAST * cf0 + CALIB_LTA_SLOW * ltaInit);
    if ((i % 20) == 0) {
      int filled = (int)((float)i / CALIB_N * (barW - 2));
      tft.fillRect(barX + 1, barY + 1, filled, barH - 2, COLOR_CYAN);
    }
    delay(20);
  }

  float meanCf    = sumSq / CALIB_N;
  float varCf     = (sumSqSq / CALIB_N) - (meanCf * meanCf);
  float noiseRatio = (meanCf > LTA_FLOOR) ? (sqrtf(varCf) / meanCf) : 0.0f;
  if (ltaInit < LTA_FLOOR) ltaInit = LTA_FLOOR;
  sta      = ltaInit;
  lta      = ltaInit;
  ltaQuiet = ltaInit;   // baseline for post-event LTA reseed

  Serial.printf("[CALIB] LTA=%.6f  xyz=%.3f,%.3f,%.3f  noise=%.2f\n",
                ltaInit, smoothedX, smoothedY, smoothedZ, noiseRatio);

  if (noiseRatio > CALIB_NOISE_MAX) {
    Serial.printf("[CALIB] WARN noise=%.1f > %.1f\n", noiseRatio, CALIB_NOISE_MAX);
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// setup()
// ═══════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && (millis() - t0) < 2000) delay(10);
  Serial.println();
  Serial.print(F("[SeismoGuard-S3] Booting v")); Serial.println(F(FW_VERSION));

  generateNtfyTopic();
  initEventLog();

  ledcAttach(PIN_BUZZER, BUZZER_PWM_BASE_FREQ, BUZZER_PWM_RES);
  buzzerOff();

  pinMode(PIN_TFT_BL, OUTPUT);
  digitalWrite(PIN_TFT_BL, HIGH);
  SPI.begin(PIN_TFT_SCK, -1, PIN_TFT_MOSI);
  tft.initR(TFT_VARIANT);
  tft.setRotation(1);

  bootMs = millis();
  showSplash();
  tftDrawChrome();
  tft.setCursor(44, STATUS_Y + 3);
  tft.setTextColor(COLOR_YELLOW, COLOR_BLACK);
  tft.print(F("Booting..."));

  // MPU6050
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(400000);
  if (!mpu.begin()) {
    Serial.println(F("[FATAL] MPU6050 not found on I2C"));
    tft.fillRect(0, WAVE_TOP, TFT_W, 20, COLOR_BLACK);
    tft.setCursor(2, WAVE_TOP + 4);
    tft.setTextColor(COLOR_RED, COLOR_BLACK);
    tft.print(F("MPU6050 MISSING!"));
    tft.setCursor(2, WAVE_TOP + 14);
    tft.setTextColor(COLOR_WHITE, COLOR_BLACK);
    tft.print(F("Check I2C wiring"));
    unsigned long haltStart = millis();
    while (millis() - haltStart < 10000) {   // blink 10s then restart
      digitalWrite(PIN_TFT_BL, HIGH); delay(300);
      digitalWrite(PIN_TFT_BL, LOW);  delay(300);
    }
    esp_restart();
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);   // 21 Hz DLPF preserves P-wave band
  Serial.println(F("[OK] MPU6050 init"));
  tft.setCursor(2, WAVE_TOP + 2);
  tft.setTextColor(COLOR_GREEN, COLOR_BLACK);
  tft.print(F("[OK] MPU6050"));

  // WiFi
  tft.setCursor(2, WAVE_TOP + 14);
  tft.setTextColor(COLOR_WHITE, COLOR_BLACK);
  tft.print(F("WiFi: connecting..."));
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) { delay(500); Serial.print('.'); tries++; }

  tft.fillRect(0, WAVE_TOP + 14, TFT_W, 10, COLOR_BLACK);
  tft.setCursor(2, WAVE_TOP + 14);
  if (WiFi.status() == WL_CONNECTED) {
    tft.setTextColor(COLOR_GREEN, COLOR_BLACK);
    tft.print(F("[OK] WiFi "));
    tft.print(WiFi.localIP());
    Serial.print(F("\n[WiFi] ")); Serial.println(WiFi.localIP());

    // NTP sync — epoch timestamps for CSV (UTC+7 for Thailand)
    configTime(7 * 3600, 0, "pool.ntp.org", "time.cloudflare.com");
    struct tm ti;
    int ntpTries = 0;
    while (!getLocalTime(&ti) && ntpTries++ < 10) delay(500);
    bootEpoch = time(nullptr);
    if (bootEpoch > 1700000000UL)
      Serial.printf("[NTP] synced  epoch=%lu\n", (unsigned long)bootEpoch);
    else
      Serial.println(F("[NTP] sync failed — epoch=0 in CSV"));
  } else {
    tft.setTextColor(COLOR_RED, COLOR_BLACK);
    tft.print(F("[--] WiFi offline"));
    Serial.println(F("\n[WiFi] FAILED — offline mode"));
  }

  // ntfy worker — Core 0, pri 3, 12KB stack
  ntfyQueue = xQueueCreate(4, sizeof(NtfyJob));
  if (ntfyQueue) {
    xTaskCreatePinnedToCore(ntfyTask, "ntfyTask", 12288, NULL, 3, &ntfyTaskHandle, 0);
    Serial.println(F("[OK] ntfy worker Core0 stack=12KB pri=3"));
  } else {
    Serial.println(F("[FAIL] ntfy queue create"));
  }

  if (WiFi.status() == WL_CONNECTED && ntfyQueue) {
    char body[200];
    snprintf(body, sizeof(body),
             "SeismoGuard EEW v%s online\nTopic: %s\nIP: %s",
             FW_VERSION, ntfyTopicFull, WiFi.localIP().toString().c_str());
    enqueueNtfy("SeismoGuard online", String(body), "default", "white_check_mark");
  }

  // GFXcanvas16 for waveform — eliminates per-pixel SPI flicker
  waveCanvas = new GFXcanvas16(WAVE_W, WAVE_H + 1);
  if (!waveCanvas) Serial.println(F("[WARN] waveCanvas alloc failed — direct draw fallback"));

  // Calibration: up to 2 passes; retry if noiseRatio too high
  const int CAL_BAR_X = 2, CAL_BAR_Y = WAVE_TOP + 38, CAL_BAR_W = TFT_W - 6, CAL_BAR_H = 6;
  for (int pass = 0; pass < 2; pass++) {
    tft.fillRect(0, WAVE_TOP + 24, TFT_W, 30, COLOR_BLACK);
    tft.setCursor(2, WAVE_TOP + 26);
    tft.setTextColor(COLOR_YELLOW, COLOR_BLACK);
    tft.printf("Calib 30s (pass %d)...", pass + 1);
    tft.drawRect(CAL_BAR_X, CAL_BAR_Y, CAL_BAR_W, CAL_BAR_H, COLOR_WHITE);
    tft.fillRect(CAL_BAR_X + 1, CAL_BAR_Y + 1, CAL_BAR_W - 2, CAL_BAR_H - 2, COLOR_BLACK);
    Serial.printf("[CALIB] pass %d — keep still 30s\n", pass + 1);

    bool ok = runCalibration(CAL_BAR_X, CAL_BAR_Y, CAL_BAR_W, CAL_BAR_H);
    if (ok) break;

    tft.fillRect(CAL_BAR_X, CAL_BAR_Y, CAL_BAR_W, CAL_BAR_H + 4, COLOR_BLACK);
    tft.setCursor(CAL_BAR_X, CAL_BAR_Y);
    tft.setTextColor(COLOR_RED, COLOR_BLACK);
    tft.print(pass == 0 ? F("NOISY — retrying...") : F("CALIB noisy! Proceeding."));
    delay(pass == 0 ? 1000 : 800);
  }

  for (int i = 0; i < TFT_W; i++) waveBuf[i] = 0.0f;

  // 50 Hz hardware timer
  samplerTimer = timerBegin(1000000);
  if (!samplerTimer) {
    Serial.println(F("[FATAL] timerBegin returned null"));
    esp_restart();
  }
  timerAttachInterrupt(samplerTimer, &onSamplerTimer);
  timerAlarm(samplerTimer, SAMPLE_INTERVAL_US, true, 0);

  delay(300);
  tftDrawChrome();
  bootMs = millis();

  esp_task_wdt_config_t wdtCfg = {
    .timeout_ms     = 10000,
    .idle_core_mask = 0,
    .trigger_panic  = true,
  };
  esp_task_wdt_reconfigure(&wdtCfg);
  esp_task_wdt_add(NULL);
  Serial.println(F("[OK] Watchdog armed 10s"));
  Serial.printf("[OK] Running  TRIG=%.1f  Pd-window=%ds  MW_ALERT=%.1f  Z-only\n",
                RATIO_TRIGGER, MAG_WINDOW_SAMPLES / SAMPLE_RATE_HZ,
                (double)MW_ALERT_THRESHOLD);
}

// ═══════════════════════════════════════════════════════════════════════════
// processSample SUB-FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// DC removal, waveform push, CF computation, STA update
void updateFilters(float ax, float ay, float az, float &dz_out) {
  float dx = ax - smoothedX;
  float dy = ay - smoothedY;
  float dz = az - smoothedZ;
  // F6: freeze DC tracker during ALARMING+LOCKOUT — prevents post-event baseline shift
  // contaminating next-event detection (otherwise hard shake post-alarm reads dz~0)
  if (state == STANDBY || state == DETECTING) {
    smoothedX = ALPHA_DC * ax + (1.0f - ALPHA_DC) * smoothedX;
    smoothedY = ALPHA_DC * ay + (1.0f - ALPHA_DC) * smoothedY;
    smoothedZ = ALPHA_DC * az + (1.0f - ALPHA_DC) * smoothedZ;
  }

  waveBuf[waveHead] = dz;
  waveHead = (waveHead + 1) % TFT_W;
  dz_out = dz;

  float ltaRef = (lta > LTA_FLOOR) ? lta : LTA_FLOOR;
  float cf = dz * dz;   // Z-axis only
  if (cf > SPIKE_LIMIT * ltaRef) cf = SPIKE_LIMIT * ltaRef;
  s_cf = cf;

  sta = ALPHA_STA * cf + (1.0f - ALPHA_STA) * sta;
  s_ratio  = (lta > LTA_FLOOR) ? (sta / lta) : 0.0f;
  curRatio = s_ratio;
}

// Zero-crossing filter — O(1) running sum, no per-sample array scan
void updateZC(float dz) {
  int curSign = (dz >  SIGN_THRESHOLD) ?  1 :
                (dz < -SIGN_THRESHOLD) ? -1 : 0;
  int newZC = (curSign != 0 && lastDzSign != 0 && curSign != lastDzSign) ? 1 : 0;
  int oldZC = zcBuf[zcHead];
  zcRunning    += (newZC - oldZC);
  zcBuf[zcHead] = newZC;
  zcHead = (zcHead + 1) % ZC_WINDOW;
  if (curSign != 0) lastDzSign = curSign;
  s_zcCount = zcRunning;
}

// Double integration with HPF after each stage (drift-kill for MEMS).
// Runs every sample so HPF is always settled. Only accumulators are reset on trigger.
void updateIntegration(float dz) {
  const float dt = 1.0f / SAMPLE_RATE_HZ;
  // Stage 1: HPF on acceleration
  float a_hpf   = HPF_ALPHA * (hpf_a_out + dz - hpf_a_in);
  hpf_a_in      = dz;
  hpf_a_out     = a_hpf;
  // Stage 2: integrate → velocity
  vel          += a_hpf * dt;
  // Stage 3: HPF on velocity
  float v_hpf   = HPF_ALPHA * (hpf_v_out + vel - hpf_v_in);
  hpf_v_in      = vel;
  hpf_v_out     = v_hpf;
  // Stage 4: integrate → displacement
  disp         += v_hpf * dt;
  // Stage 5: HPF on displacement
  float d_hpf   = HPF_ALPHA * (hpf_d_out + disp - hpf_d_in);
  hpf_d_in      = disp;
  hpf_d_out     = d_hpf;
}

// Detector state machine — Serial output via queue (non-blocking)
void runStateMachine() {
  float cf    = s_cf;
  float ratio = s_ratio;
  int   zc    = s_zcCount;
  char  logbuf[SERIAL_LOG_LEN];

  switch (state) {
    case STANDBY:
      lta = ALPHA_LTA * cf + (1.0f - ALPHA_LTA) * lta;
      // Track quiet baseline slowly (tau ~2000s @ 50 Hz) — only in true standby
      ltaQuiet = 0.00001f * lta + 0.99999f * ltaQuiet;
      if (ratio >= RATIO_TRIGGER) { trigCount = 1; state = DETECTING; }
      break;

    case DETECTING:
      lta = ALPHA_LTA_BLEED * cf + (1.0f - ALPHA_LTA_BLEED) * lta;
      if (ratio >= RATIO_TRIGGER) {
        if (++trigCount >= MIN_TRIG_COUNT) {
          if (zc < ZC_MIN_FOR_PWAVE) {
            snprintf(logbuf, sizeof(logbuf),
                     "[REJECT] thump  ratio=%.2f  zc=%d\n", ratio, zc);
            serialLogEnqueue(logbuf);
            state = LOCKOUT; lockoutStartMs = millis(); trigCount = 0;
            break;
          }
          // F1: reject sub-mg taps even with valid ratio (still-sensor false-pos)
          if (cf < MIN_TRIG_CF_ABS) {
            snprintf(logbuf, sizeof(logbuf),
                     "[REJECT] tiny  cf=%.5f < %.5f\n",
                     (double)cf, (double)MIN_TRIG_CF_ABS);
            serialLogEnqueue(logbuf);
            state = LOCKOUT; lockoutStartMs = millis(); trigCount = 0;
            break;
          }
          state         = ALARMING;
          peakRatio     = ratio;
          alertArmed    = false;
          ntfySent      = false;
          alarmStartMs  = millis();
          alarmZcAtTrig = zc;
          tc_num = tc_den = pd_max = 0.0f;
          mag_samples = 0;
          mw_est = -99.0f;
          snprintf(logbuf, sizeof(logbuf),
                   "[ALARM] P-onset  s=%lu  ratio=%.2f  zc=%d\n",
                   sampleCount, ratio, zc);
          serialLogEnqueue(logbuf);
        }
      } else {
        trigCount = 0; state = STANDBY;
      }
      break;

    case ALARMING:
      lta = ALPHA_LTA_BLEED * cf + (1.0f - ALPHA_LTA_BLEED) * lta;
      if (ratio > peakRatio) peakRatio = ratio;

      // ── Pd window: accumulate up to MAG_WINDOW_SAMPLES, then decide alert ──
      if (mag_samples < MAG_WINDOW_SAMPLES) {
        float d = hpf_d_out;
        float v = hpf_v_out;
        tc_num += d * d;
        tc_den += v * v;
        if (fabsf(d) > pd_max) pd_max = fabsf(d);
        mag_samples++;

        if (mag_samples == MAG_WINDOW_SAMPLES) {
          // Compute tau_c (Allen & Kanamori 2003)
          float tau_c = (tc_den > 0.0f) ? (2.0f * (float)M_PI * sqrtf(tc_num / tc_den)) : 0.0f;
          // Compute Mw from Pd (Wu & Kanamori 2005 Taiwan — PRELIMINARY)
          mw_est = -99.0f;
          if (pd_max > 1e-9f) {
            mw_est = MW_PD_A * log10f(pd_max)
                   + MW_PD_B * log10f(MW_R_KM)
                   + MW_PD_C;
          }
          snprintf(logbuf, sizeof(logbuf),
                   "[MAG] Pd=%.5fm  tau_c=%.2fs  Mw=%.2f  R=%dkm(fixed)\n",
                   (double)pd_max, (double)tau_c, (double)mw_est, (int)MW_R_KM);
          serialLogEnqueue(logbuf);

          if (mw_est >= MW_ALERT_THRESHOLD) {
            // Alert: buzzer + ntfy
            alertArmed = true;
            eventCount++;
            if (WiFi.status() == WL_CONNECTED &&
                (millis() - lastAlertMs) > ALERT_COOLDOWN_MS) {
              ntfySent    = true;
              lastAlertMs = millis();
              char body[256];
              snprintf(body, sizeof(body),
                       "ตรวจพบแผ่นดินไหว!\nMw ≈ %.1f (ประมาณการ, R≈%d km)\n"
                       "Peak ratio: %.1f\nโปรดหาที่กำบัง ห่างจากหน้าต่าง\n"
                       "SeismoGuard EEW %s",
                       (double)mw_est, (int)MW_R_KM, (double)peakRatio, FW_VERSION);
              enqueueNtfy("SeismoGuard EEW ALERT", String(body), "urgent",
                          "rotating_light,earthquake");
              snprintf(logbuf, sizeof(logbuf),
                       "[ALERT] Mw=%.2f ntfy queued  event#%u\n",
                       (double)mw_est, (unsigned)eventCount);
            } else {
              snprintf(logbuf, sizeof(logbuf),
                       "[ALERT] Mw=%.2f WiFi offline/cooldown — buzzer only  event#%u\n",
                       (double)mw_est, (unsigned)eventCount);
            }
            serialLogEnqueue(logbuf);

          } else {
            // Below threshold: silent reset
            snprintf(logbuf, sizeof(logbuf),
                     "[SILENT] Mw=%.2f < MW_ALERT=%.1f  no alert\n",
                     (double)mw_est, (double)MW_ALERT_THRESHOLD);
            serialLogEnqueue(logbuf);
            float durSec = (millis() - alarmStartMs) / 1000.0f;
            logEvent(eventCount, peakRatio, lta, alarmZcAtTrig, durSec, false, false);
            state          = LOCKOUT;
            lockoutStartMs = millis();
            break;
          }
        }
      }

      // F2: detrigger by ratio drop OR ALARM_MAX_MS timeout (kills stuck-beep)
      {
        bool detrig  = (ratio < RATIO_DETRIGGER);
        bool timeout = (millis() - alarmStartMs) > ALARM_MAX_MS;
        if (detrig || timeout) {
          if (alertArmed) {
            float durSec = (millis() - alarmStartMs) / 1000.0f;
            logEvent(eventCount, peakRatio, lta, alarmZcAtTrig, durSec, alertArmed, ntfySent);
          } else if (mag_samples < MAG_WINDOW_SAMPLES) {
            // Alarm ended before Pd window complete — silent (no Mw data)
            snprintf(logbuf, sizeof(logbuf),
                     "[SILENT] alarm end before Pd window (%d/%d samples)\n",
                     mag_samples, MAG_WINDOW_SAMPLES);
            serialLogEnqueue(logbuf);
          }
          state          = LOCKOUT;
          lockoutStartMs = millis();
          serialLogEnqueue(timeout ? "[LOCKOUT] alarm timeout (forced)\n"
                                   : "[LOCKOUT] Detrigger\n");
        }
      }
      break;

    case LOCKOUT: {
      lta = ALPHA_LTA * cf + (1.0f - ALPHA_LTA) * lta;

      // F4: re-arm — STRONGER event during LOCKOUT breaks through to ALARMING
      // (prevents deafness if user shakes harder while detector is locked out)
      if (peakRatio > 0.1f && ratio >= peakRatio * LOCKOUT_BREAK_FACTOR &&
          cf >= MIN_TRIG_CF_ABS && zc >= ZC_MIN_FOR_PWAVE) {
        state         = ALARMING;
        peakRatio     = ratio;
        alertArmed    = false;
        ntfySent      = false;
        alarmStartMs  = millis();
        alarmZcAtTrig = zc;
        tc_num = tc_den = pd_max = 0.0f;
        mag_samples = 0;
        mw_est = -99.0f;
        snprintf(logbuf, sizeof(logbuf),
                 "[ALARM] lockout broken — newRatio=%.2f cf=%.4f\n",
                 ratio, (double)cf);
        serialLogEnqueue(logbuf);
        break;
      }

      // F3: exit by ratio drop OR by LOCKOUT_MAX_MS timeout (anti-stuck)
      bool ratioLow = (ratio < RATIO_DETRIGGER * LOCKOUT_EXIT_FRAC);
      bool timedOut = (millis() - lockoutStartMs) > LOCKOUT_MAX_MS;
      if (ratioLow || timedOut) {
        // Reseed LTA to quiet baseline — prevents post-event dead zone (inflated LTA)
        lta        = ltaQuiet;
        state      = STANDBY;
        trigCount  = 0;
        peakRatio  = 0.0f;
        alertArmed = false;
        ntfySent   = false;
        serialLogEnqueue(timedOut ? "[STANDBY] LOCKOUT timeout (forced)\n"
                                  : "[STANDBY] Detector reset\n");
      }
      break;
    }

    default: __builtin_unreachable();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// processSample — single sample @ 50 Hz
// ═══════════════════════════════════════════════════════════════════════════
void processSample() {
  sensors_event_t a, g, tmp;
  mpu.getEvent(&a, &g, &tmp);

  float dz;
  updateFilters(a.acceleration.x, a.acceleration.y, a.acceleration.z, dz);
  updateZC(dz);
  updateIntegration(dz);
  runStateMachine();
  sampleCount++;

  if (sampleCount % HB_INTERVAL_SAMPLES == 0) {
    char buf[SERIAL_LOG_LEN];
    snprintf(buf, sizeof(buf),
             "[hb] t=%lus  state=%u  sta=%.5f  lta=%.5f  ratio=%.3f  missed=%lu\n",
             sampleCount / SAMPLE_RATE_HZ, (unsigned)state,
             sta, lta, s_ratio, missedSamples);
    serialLogEnqueue(buf);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// loop()
// ═══════════════════════════════════════════════════════════════════════════
void loop() {
  // Drain ISR ticks — cap to 1 to prevent feeding duplicate MPU data into
  // STA/LTA when loop falls behind (ticks > 1 = genuine missed samples).
  uint32_t ticks;
  portENTER_CRITICAL(&samplerMux);
  ticks     = tickCount;
  tickCount = 0;
  portEXIT_CRITICAL(&samplerMux);

  if (ticks > 1) missedSamples += (ticks - 1);
  if (ticks > 0) processSample();   // read fresh MPU data once

  unsigned long now = millis();

  if (state == ALARMING && alertArmed) buzzerSiren(now);
  else                                  buzzerOff();

  if (now - lastRefreshMs >= REFRESH_MS) {
    lastRefreshMs = now;
    tftRefresh();
  }

  // Drain deferred serial log (safe here: enqueue and drain both in loop context)
  serialLogDrain();

  checkWiFi(now);

  if ((now - lastHbNtfyMs) >= HB_NTFY_MS && WiFi.status() == WL_CONNECTED && ntfyQueue) {
    lastHbNtfyMs = now;
    char upbuf[12]; formatUptime(now - bootMs, upbuf, sizeof(upbuf));
    IPAddress ip = WiFi.localIP();
    char body[160];
    snprintf(body, sizeof(body),
             "Device alive.\nUptime: %s\nEvents: %u\nLTA: %.4f\nIP: %d.%d.%d.%d",
             upbuf, (unsigned)eventCount, (double)lta, ip[0], ip[1], ip[2], ip[3]);
    enqueueNtfy("SeismoGuard heartbeat", String(body), "min", "green_heart");
    serialLogEnqueue("[hb-ntfy] queued\n");
  }

  esp_task_wdt_reset();
}
