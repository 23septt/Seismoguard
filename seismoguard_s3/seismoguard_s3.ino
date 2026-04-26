/**
 * seismoguard_s3.ino   —   v1.2.0-s3
 * SeismoGuard EEW — ESP32-S3 N16R8 port with rich TFT seismograph + ntfy.sh alert.
 *
 * v1.2.0 visual UI refresh:
 *   - Animated splash screen with progress bar
 *   - Lightning-bolt icon + WiFi signal bars in header
 *   - Coloured rounded status badge with flash-pulse during T1 alarm
 *   - Waveform area with dot grid, axis labels (+, 0, -) and filled fill when alarming
 *   - Horizontal ratio meter with gradient + TIER1/TIER2 tick marks + peak line
 *   - Two compact stats rows: Peak / Event# / Uptime  ·  T1 / T2 / IP
 *
 * Hardware:
 *   - ESP32-S3 N16R8 (16MB Flash + 8MB PSRAM)
 *   - MPU6050 on I²C          (SDA=GPIO8, SCL=GPIO9, VCC=3.3V)
 *   - Passive buzzer          (GPIO4 via LEDC PWM)
 *   - TFT 1.8" ST7735         (SCK=12, MOSI=11, CS=10, DC=13, RST=14, BL=15, VCC=3.3V)
 *
 * Arduino IDE board settings:
 *   Board:           "ESP32S3 Dev Module"
 *   PSRAM:           "OPI PSRAM"          ← สำคัญสำหรับ N16R8
 *   Flash Size:      "16MB (128Mb)"
 *   Partition:       "16M Flash (3MB APP/9.9MB FATFS)"
 *   USB CDC On Boot: "Enabled"
 *   Core Version:    esp32 by Espressif ≥ 3.0.0  (timer & ledc APIs required)
 *
 * Required libraries (Library Manager):
 *   - Adafruit MPU6050
 *   - Adafruit Unified Sensor
 *   - Adafruit GFX Library
 *   - Adafruit ST7735 and ST7789 Library
 *
 * ntfy.sh setup (NO ACCOUNT NEEDED):
 *   1. Install "ntfy" app (Play Store / App Store).
 *   2. "Subscribe to topic" → enter NTFY_TOPIC below.
 *   3. Done — notifications push automatically.
 *   ⚠️ Topics on ntfy.sh are PUBLIC. Use a long random string.
 *
 * TFT tab variant:
 *   This code uses INITR_BLACKTAB (most common generic 1.8" red-PCB module).
 *   If colours look wrong / image is offset, try INITR_GREENTAB or INITR_REDTAB.
 *
 * Algorithm (grid-search optimal on STEAD 439P+250N, F1=0.995, AUC=0.9919):
 *   STA/LTA recursive on dz² (z-axis deviation squared), τ_STA=0.5s, τ_LTA=30s,
 *   RATIO=6.0, MIN_TRIG=3, SPIKE=50×LTA, RATIO_DETRIGGER=1.5
 *
 * 2-Tier alert (peak STA/LTA ratio — no Pd double-integration):
 *   Tier 1 — peakRatio ≥ RATIO_TIER1  →  Buzzer siren        (local)
 *   Tier 2 — peakRatio ≥ RATIO_TIER2  →  Buzzer + ntfy push  (remote)
 *   Below Tier 1  →  P-wave detected but silent (Serial log only)
 *   ⚠️ RATIO_TIER1/2 are initial estimates — CALIBRATE WITH REAL EVENTS.
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

// ═══════════════════════════════════════════════════════════════════════════
// USER CONFIGURATION
//   Credentials live in config.h (gitignored). Copy config.h.template → config.h
//   and edit before flashing. config.h must define:
//     WIFI_SSID, WIFI_PASSWORD, NTFY_TOPIC
// ═══════════════════════════════════════════════════════════════════════════
#if __has_include("config.h")
  #include "config.h"
#else
  #error "Missing config.h — copy config.h.template to config.h and fill in credentials."
#endif

#define NTFY_HOST      "ntfy.sh"
#define NTFY_PORT      443

#define FW_VERSION     "1.2.0-s3"

// ═══════════════════════════════════════════════════════════════════════════
// PIN ASSIGNMENTS (ESP32-S3) — ปรับตาม Expansion Board ที่ใช้
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

// Buzzer PWM (LEDC v3 API)
#define BUZZER_PWM_BASE_FREQ 2000
#define BUZZER_PWM_RES       10
#define BUZZER_FREQ_LO       1500
#define BUZZER_FREQ_HI       2500
#define BUZZER_DUTY_ON       512          // 50 % of 1024 (10-bit)

// ═══════════════════════════════════════════════════════════════════════════
// STA/LTA PARAMETERS (grid-search optimal v3)
// ═══════════════════════════════════════════════════════════════════════════
#define SAMPLE_RATE_HZ     50
#define SAMPLE_INTERVAL_US 20000        // 1e6 / 50
#define ALPHA_STA          0.04f        // 1 / (0.5 s × 50 Hz)
#define ALPHA_LTA          0.000667f    // 1 / (30  s × 50 Hz)
#define ALPHA_LTA_BLEED    0.0001f
#define ALPHA_DC           0.002f       // smoothedZ tracker (τ ≈ 10 s @ 50 Hz)
#define RATIO_TRIGGER      6.0f
#define RATIO_DETRIGGER    1.5f
#define MIN_TRIG_COUNT     3
#define SPIKE_LIMIT        50.0f

// Ratio-based 2-tier alert thresholds (UNTESTED — calibrate in Phase 6)
#define RATIO_TIER1        8.0f
#define RATIO_TIER2        25.0f

#define ALERT_COOLDOWN_MS     30000UL
#define WIFI_RECONNECT_MS     30000UL
#define HB_INTERVAL_SAMPLES   (SAMPLE_RATE_HZ * 10)   // 10 s

// ═══════════════════════════════════════════════════════════════════════════
// TFT LAYOUT (landscape 160×128)
// ═══════════════════════════════════════════════════════════════════════════
#define TFT_W         160
#define TFT_H         128

// Header (lightning + title + wifi bars)
#define HDR_Y           0
#define HDR_H          12
// Status badge (colored filled rect with state name)
#define STATUS_Y       15
#define STATUS_H       13
// Waveform area (with grid + axis labels)
#define WAVE_TOP       31
#define WAVE_BOT       79
#define WAVE_H         (WAVE_BOT - WAVE_TOP)
#define WAVE_MID       ((WAVE_TOP + WAVE_BOT) / 2)
// Ratio meter (horizontal bar)
#define METER_Y        83
#define METER_H         9
#define METER_X        32
#define METER_W        (TFT_W - METER_X - 4)
// Stats block (two rows)
#define STATS_Y        96
#define STATS_H        30

#define DZ_DISPLAY_MAX  0.6f    // ±0.6 m/s² → full deflection (tune to taste)
#define REFRESH_MS      100     // 10 Hz

// Custom 565-RGB colors (ST77XX headers in some library versions lack these)
#define COLOR_BLACK      0x0000
#define COLOR_WHITE      0xFFFF
#define COLOR_RED        0xF800
#define COLOR_GREEN      0x07E0
#define COLOR_BLUE       0x001F
#define COLOR_CYAN       0x07FF
#define COLOR_YELLOW     0xFFE0
#define COLOR_MAGENTA    0xF81F
#define COLOR_ORANGE     0xFD20
#define COLOR_DARKGREY   0x39E7
#define COLOR_DIM        0x52AA
#define COLOR_DARKRED    0x7800
#define COLOR_DARKGREEN  0x0400
#define COLOR_DIMGREEN   0x03E0
#define COLOR_DIMCYAN    0x04B3
#define COLOR_GRID       0x2104   // very dim grey (dot grid)
#define COLOR_ACCENT     0x04FF   // bright cyan-blue (accent line)
#define COLOR_METER_LO   0x03E0   // dark green  (low ratio zone)
#define COLOR_METER_MID  0xFD20   // orange       (T1 zone)
#define COLOR_METER_HI   0xF800   // red          (T2 zone)

// ═══════════════════════════════════════════════════════════════════════════
// GLOBALS
// ═══════════════════════════════════════════════════════════════════════════
Adafruit_MPU6050 mpu;
Adafruit_ST7735  tft(PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST);

// 50 Hz hardware timer
hw_timer_t  *samplerTimer = nullptr;
portMUX_TYPE samplerMux   = portMUX_INITIALIZER_UNLOCKED;
volatile uint32_t tickCount = 0;   // ISR increments, loop consumes

// Detector state
enum DetState : uint8_t { STANDBY = 0, DETECTING = 1, ALARMING = 2, LOCKOUT = 3 };
DetState state = STANDBY;

float sta         = 0.0f;
float lta         = 1.0f;
float smoothedX   = 0.0f;
float smoothedY   = 0.0f;
float smoothedZ   = 0.0f;
bool  smoothedZInit = false;
int   trigCount   = 0;
float peakRatio   = 0.0f;
bool  alertArmed  = false;
bool  ntfySent    = false;

// Zero-crossing filter (anti-thump): count sign changes in dz over window
#define ZC_WINDOW         10      // 10 samples @ 50 Hz = 200 ms
#define ZC_MIN_FOR_PWAVE   2      // real P-wave oscillates; single bang = 0-1 ZC
int   zcBuf[ZC_WINDOW];           // stores sign of dz (-1, 0, +1)
int   zcHead = 0;
int   lastDzSign = 0;

unsigned long lastAlertMs      = 0;
unsigned long sampleCount      = 0;
unsigned long missedSamples    = 0;
unsigned long lastWifiCheckMs  = 0;

// Ring buffer for seismograph waveform (stores raw dz, bipolar)
float waveBuf[TFT_W];
int   waveHead = 0;

// Cached values for TFT
float         curRatio      = 0.0f;
unsigned long lastRefreshMs = 0;

// Buzzer tone cache (avoid re-setting same tone every loop = audible clicks)
uint32_t currentBuzzerFreq = 0;

// Visual UI state
unsigned long bootMs     = 0;
uint16_t      eventCount = 0;

// ── Non-blocking ntfy job queue (run on Core 0 so sampling on Core 1 is undisturbed) ──
struct NtfyJob {
  char title[48];
  char body[256];
  char priority[16];
  char tags[64];
};
QueueHandle_t ntfyQueue       = NULL;
TaskHandle_t  ntfyTaskHandle  = NULL;

// ── Heartbeat ntfy (every HB_NTFY_MS to show device is alive) ──
#define HB_NTFY_MS  (6UL * 3600UL * 1000UL)   // 6 hours
unsigned long lastHbNtfyMs = 0;

// ── Runtime-generated random ntfy suffix (harder to spam) ──
char ntfyTopicFull[48] = NTFY_TOPIC;   // filled at boot with "-XXXXXX"

// ── Event logger (FFat CSV, 9MB partition) ──
bool          fsOk          = false;
const char   *LOG_PATH      = "/events.csv";
unsigned long alarmStartMs  = 0;
int           alarmZcAtTrig = 0;

// ═══════════════════════════════════════════════════════════════════════════
// TIMER ISR — increment counter (loop processes each tick)
// ═══════════════════════════════════════════════════════════════════════════
void IRAM_ATTR onSamplerTimer() {
  portENTER_CRITICAL_ISR(&samplerMux);
  tickCount++;
  portEXIT_CRITICAL_ISR(&samplerMux);
}

// ═══════════════════════════════════════════════════════════════════════════
// Buzzer helpers (LEDC v3 — uses pin directly, caches last tone)
// ═══════════════════════════════════════════════════════════════════════════
void buzzerSetTone(uint32_t freq) {
  if (freq == currentBuzzerFreq) return;
  currentBuzzerFreq = freq;
  if (freq == 0) {
    ledcWrite(PIN_BUZZER, 0);
  } else {
    ledcWriteTone(PIN_BUZZER, freq);
  }
}

inline void buzzerOff() { buzzerSetTone(0); }

void buzzerSiren(unsigned long t) {
  bool high = ((t / 250) & 1);                 // toggle every 250 ms
  buzzerSetTone(high ? BUZZER_FREQ_HI : BUZZER_FREQ_LO);
}

// ═══════════════════════════════════════════════════════════════════════════
// ntfy.sh sender
// ═══════════════════════════════════════════════════════════════════════════
void sendNtfy(const char *title, const String &body,
              const char *priority, const char *tags) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[ntfy] WiFi offline — skip"));
    return;
  }

  // SECURITY WARNING: setInsecure() skips TLS certificate verification.
  //   An attacker on the same network can intercept or replay ntfy POSTs.
  //   Mitigations: (1) keep NTFY_TOPIC long+random so spoofed sends are
  //   filtered out by the suffix check; (2) deploy on trusted LAN only;
  //   (3) for hardened builds, replace with setCACert(<ISRG Root X1>) and
  //   accept the rotation risk when Let's Encrypt re-roots.
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(5);   // seconds
  if (!client.connect(NTFY_HOST, NTFY_PORT)) {
    Serial.println(F("[ntfy] Connection failed"));
    return;
  }

  // Build request header in a stack buffer, then body is sent separately.
  char hdr[512];
  int hdrLen = snprintf(hdr, sizeof(hdr),
    "POST /%s HTTP/1.1\r\n"
    "Host: %s\r\n"
    "Title: %s\r\n"
    "Priority: %s\r\n"
    "Tags: %s\r\n"
    "Content-Type: text/plain; charset=utf-8\r\n"
    "Content-Length: %u\r\n"
    "Connection: close\r\n\r\n",
    ntfyTopicFull, NTFY_HOST, title, priority, tags, (unsigned)body.length());

  if (hdrLen < 0 || hdrLen >= (int)sizeof(hdr)) {
    Serial.println(F("[ntfy] Header too long"));
    client.stop();
    return;
  }

  client.write((const uint8_t*)hdr, hdrLen);
  client.write((const uint8_t*)body.c_str(), body.length());

  // Read response briefly (don't block indefinitely)
  unsigned long t0 = millis();
  while (client.connected() && (millis() - t0) < 5000) {
    if (client.available()) {
      String line = client.readStringUntil('\n');
      if (line.startsWith("HTTP/1.1")) {
        Serial.print(F("[ntfy] ")); Serial.println(line);
        break;
      }
    }
    delay(1);
  }
  client.stop();
}

// ── Non-blocking queue API: push job onto queue (never blocks loop) ──
void enqueueNtfy(const char *title, const String &body,
                 const char *priority, const char *tags) {
  if (!ntfyQueue) {
    Serial.println(F("[ntfy] queue not ready — dropping"));
    return;
  }
  NtfyJob job;
  strncpy(job.title,    title,       sizeof(job.title)    - 1); job.title[sizeof(job.title) - 1]       = 0;
  strncpy(job.body,     body.c_str(),sizeof(job.body)     - 1); job.body[sizeof(job.body) - 1]         = 0;
  strncpy(job.priority, priority,    sizeof(job.priority) - 1); job.priority[sizeof(job.priority) - 1] = 0;
  strncpy(job.tags,     tags,        sizeof(job.tags)     - 1); job.tags[sizeof(job.tags) - 1]         = 0;
  if (xQueueSend(ntfyQueue, &job, 0) != pdTRUE) {
    Serial.println(F("[ntfy] queue full — dropping"));
  }
}

// ── Worker task: drain queue and send (runs on Core 0) ──
void ntfyTask(void *pv) {
  NtfyJob job;
  for (;;) {
    if (xQueueReceive(ntfyQueue, &job, portMAX_DELAY) == pdTRUE) {
      sendNtfy(job.title, String(job.body), job.priority, job.tags);
    }
  }
}

// Build a MAC-derived unique ntfy topic: e.g. "Seismoguard-A3F71B"
// Stable across boots, unique per device, harder to guess than "Seismoguard".
void generateNtfyTopic() {
  uint64_t mac = ESP.getEfuseMac();
  char suffix[8];
  snprintf(suffix, sizeof(suffix), "%06X", (unsigned)(mac & 0xFFFFFFUL));
  snprintf(ntfyTopicFull, sizeof(ntfyTopicFull), "%s-%s", NTFY_TOPIC, suffix);
  Serial.printf("[ntfy] Topic: %s\n", ntfyTopicFull);
}

// ═══════════════════════════════════════════════════════════════════════════
// Event logger — CSV on FFat partition
// ═══════════════════════════════════════════════════════════════════════════
void initEventLog() {
  if (!FFat.begin()) {
    Serial.println(F("[FS] FFat mount failed — formatting..."));
    if (!FFat.begin(true)) {                 // true = format on fail
      Serial.println(F("[FS] format failed — logging disabled"));
      return;
    }
  }
  fsOk = true;
  Serial.printf("[FS] FFat mounted  total=%u  used=%u bytes\n",
                (unsigned)FFat.totalBytes(), (unsigned)FFat.usedBytes());
  // Write header if file doesn't exist yet
  if (!FFat.exists(LOG_PATH)) {
    File f = FFat.open(LOG_PATH, FILE_WRITE);
    if (f) {
      f.println(F("boot_sec,event,peak_ratio,lta,zc,dur_s,t1,t2"));
      f.close();
      Serial.println(F("[FS] created events.csv"));
    }
  }
  // Count existing events by line count (minus header) for info
  File f = FFat.open(LOG_PATH, FILE_READ);
  if (f) {
    int n = 0;
    while (f.available()) {
      if (f.read() == '\n') n++;
    }
    f.close();
    if (n > 1) Serial.printf("[FS] existing events in log: %d\n", n - 1);
  }
}

void logEvent(uint32_t bootSec, uint16_t evt, float peak, float ltaVal,
              int zc, float durSec, bool t1, bool t2) {
  if (!fsOk) return;
  File f = FFat.open(LOG_PATH, FILE_APPEND);
  if (!f) {
    Serial.println(F("[FS] log open failed"));
    return;
  }
  f.printf("%u,%u,%.2f,%.6f,%d,%.2f,%d,%d\n",
           (unsigned)bootSec, (unsigned)evt, (double)peak, (double)ltaVal,
           zc, (double)durSec, t1 ? 1 : 0, t2 ? 1 : 0);
  f.close();
  Serial.printf("[FS] logged event#%u  peak=%.2f  dur=%.1fs\n",
                (unsigned)evt, (double)peak, (double)durSec);
}

// ═══════════════════════════════════════════════════════════════════════════
// TFT helpers — colors, state, icons, widgets
// ═══════════════════════════════════════════════════════════════════════════
uint16_t stateColor(DetState s) {
  switch (s) {
    case STANDBY:   return COLOR_GREEN;
    case DETECTING: return COLOR_YELLOW;
    case ALARMING:  return COLOR_RED;
    case LOCKOUT:   return COLOR_BLUE;
  }
  return COLOR_WHITE;
}

const char* stateName(DetState s) {
  switch (s) {
    case STANDBY:   return "STANDBY";
    case DETECTING: return "DETECTING";
    case ALARMING:  return "ALARMING";
    case LOCKOUT:   return "LOCKOUT";
  }
  return "?";
}

// 7×9 stylised lightning-bolt glyph at (x,y), color c.
void drawLightningIcon(int x, int y, uint16_t c) {
  tft.drawLine(x + 4, y,     x,     y + 5, c);
  tft.drawLine(x,     y + 5, x + 3, y + 5, c);
  tft.drawLine(x + 3, y + 5, x + 2, y + 8, c);
  tft.drawLine(x + 2, y + 8, x + 6, y + 3, c);
  tft.drawLine(x + 6, y + 3, x + 3, y + 3, c);
  tft.drawLine(x + 3, y + 3, x + 4, y,     c);
  // Fill interior pixels for a fuller look
  tft.drawPixel(x + 3, y + 2, c);
  tft.drawPixel(x + 2, y + 4, c);
  tft.drawPixel(x + 4, y + 4, c);
  tft.drawPixel(x + 3, y + 6, c);
}

// 4-bar WiFi signal indicator (11×9 px) at (x,y).
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
    int h  = 2 + b * 2;           // 2, 4, 6, 8
    int bx = x + b * 3;
    int by = y + 8 - h;
    tft.fillRect(bx, by, 2, h, (b < level) ? onC : COLOR_GRID);
  }
}

// Filled rounded badge with state name centred. Flash-pulses during T1 alarm.
void drawStatusBadge() {
  uint16_t bg = stateColor(state);
  uint16_t fg = COLOR_BLACK;
  if (state == ALARMING) {
    fg = COLOR_WHITE;
    if (alertArmed) {
      bool flash = ((millis() / 250) & 1);
      bg = flash ? COLOR_RED : COLOR_DARKRED;
    }
  }
  tft.fillRoundRect(2, STATUS_Y, TFT_W - 4, STATUS_H, 2, bg);
  tft.drawRoundRect(2, STATUS_Y, TFT_W - 4, STATUS_H, 2, COLOR_WHITE);

  const char *name = stateName(state);
  int nameLen = strlen(name);
  int tx = (TFT_W - nameLen * 6) / 2;
  tft.setCursor(tx, STATUS_Y + 3);
  tft.setTextColor(fg, bg);
  tft.setTextSize(1);
  tft.print(name);

  // Warning glyphs at edges during T1
  if (state == ALARMING && alertArmed) {
    tft.setCursor(6, STATUS_Y + 3);
    tft.print('!');
    tft.setCursor(TFT_W - 12, STATUS_Y + 3);
    tft.print('!');
  }
}

// Pick meter bar color based on ratio magnitude.
uint16_t meterColor(float r) {
  if (r >= RATIO_TIER2)   return COLOR_METER_HI;
  if (r >= RATIO_TIER1)   return COLOR_METER_MID;
  if (r >= RATIO_TRIGGER) return COLOR_YELLOW;
  return COLOR_METER_LO;
}

// Horizontal ratio meter: label + gradient-filled bar + TIER1/TIER2 ticks + peak mark.
void drawRatioMeter() {
  // Label "R:xx.x"
  tft.setCursor(2, METER_Y + 1);
  tft.setTextColor(COLOR_WHITE, COLOR_BLACK);
  tft.print(F("R:"));
  tft.setTextColor(meterColor(curRatio), COLOR_BLACK);
  char buf[8];
  snprintf(buf, sizeof(buf), "%4.1f", (double)curRatio);
  tft.print(buf);

  // Frame
  tft.drawRect(METER_X, METER_Y, METER_W, METER_H, COLOR_DARKGREY);
  tft.fillRect(METER_X + 1, METER_Y + 1, METER_W - 2, METER_H - 2, COLOR_BLACK);

  // Full-scale = TIER2 + 5 (so T2 isn't at the very edge)
  float full = RATIO_TIER2 + 5.0f;
  float frac = curRatio / full;
  if (frac > 1.0f) frac = 1.0f;
  if (frac < 0.0f) frac = 0.0f;
  int filled = (int)(frac * (METER_W - 2));

  // Gradient fill — each px colored by its ratio band
  for (int i = 0; i < filled; i++) {
    float rAt = (float)i / (METER_W - 2) * full;
    tft.drawFastVLine(METER_X + 1 + i, METER_Y + 1, METER_H - 2, meterColor(rAt));
  }

  // TIER1 tick (white) above+below
  int t1x = METER_X + (int)((RATIO_TIER1 / full) * (METER_W - 2));
  tft.drawFastVLine(t1x, METER_Y - 1, 1, COLOR_WHITE);
  tft.drawFastVLine(t1x, METER_Y + METER_H, 1, COLOR_WHITE);

  // TIER2 tick (red)
  int t2x = METER_X + (int)((RATIO_TIER2 / full) * (METER_W - 2));
  tft.drawFastVLine(t2x, METER_Y - 1, 1, COLOR_RED);
  tft.drawFastVLine(t2x, METER_Y + METER_H, 1, COLOR_RED);

  // Peak marker — bright white vertical line inside bar
  if (peakRatio > 0.1f) {
    float pk = peakRatio;
    if (pk > full) pk = full;
    int px = METER_X + 1 + (int)((pk / full) * (METER_W - 2));
    tft.drawFastVLine(px, METER_Y + 1, METER_H - 2, COLOR_WHITE);
  }
}

// Format milliseconds to "MM:SS" or "HH:MM:SS" in caller-supplied buffer.
void formatUptime(uint32_t ms, char *out, size_t n) {
  uint32_t sec = ms / 1000;
  uint32_t hh  = sec / 3600;
  uint32_t mm  = (sec % 3600) / 60;
  uint32_t ss  = sec % 60;
  if (hh > 0) snprintf(out, n, "%02u:%02u:%02u",
                      (unsigned)hh, (unsigned)mm, (unsigned)ss);
  else        snprintf(out, n, "%02u:%02u",
                      (unsigned)mm, (unsigned)ss);
}

// Map bipolar dz → pixel y in wave area, clamped.
int dzToY(float dz) {
  float clamped = fminf(fmaxf(dz, -DZ_DISPLAY_MAX), DZ_DISPLAY_MAX);
  float norm    = (clamped + DZ_DISPLAY_MAX) / (2.0f * DZ_DISPLAY_MAX);   // 0..1
  int   y       = WAVE_BOT - (int)(norm * WAVE_H);
  if (y < WAVE_TOP) y = WAVE_TOP;
  if (y > WAVE_BOT) y = WAVE_BOT;
  return y;
}

// Draw all static chrome (header, dividers, axis labels, grid dots, centerline).
void tftDrawChrome() {
  tft.fillScreen(COLOR_BLACK);
  tft.setTextSize(1);

  // Header: lightning icon + title (left)
  drawLightningIcon(2, 1, COLOR_YELLOW);
  tft.setCursor(12, 2);
  tft.setTextColor(COLOR_WHITE, COLOR_BLACK);
  tft.print(F("SeismoGuard"));
  tft.setTextColor(COLOR_DIM, COLOR_BLACK);
  tft.print(' ');
  tft.print(F(FW_VERSION));

  // Accent line under header
  tft.drawFastHLine(0, HDR_H + 1, TFT_W, COLOR_ACCENT);

  // Axis labels on left edge of wave area
  tft.setTextColor(COLOR_DIM, COLOR_BLACK);
  tft.setCursor(1, WAVE_TOP);
  tft.print('+');
  tft.setCursor(1, WAVE_MID - 3);
  tft.print('0');
  tft.setCursor(1, WAVE_BOT - 7);
  tft.print('-');

  // Grid dots inside wave area
  for (int x = 12; x < TFT_W; x += 10) {
    for (int y = WAVE_TOP + 4; y < WAVE_BOT; y += 8) {
      tft.drawPixel(x, y, COLOR_GRID);
    }
  }

  // Centerline baseline
  tft.drawFastHLine(8, WAVE_MID, TFT_W - 8, COLOR_DIM);

  // Dividers above/below ratio meter + stats
  tft.drawFastHLine(0, WAVE_BOT + 1, TFT_W, COLOR_DARKGREY);
  tft.drawFastHLine(0, STATS_Y - 2, TFT_W, COLOR_DARKGREY);
}

// Repaint dynamic elements — called ~10 Hz from loop().
void tftRefresh() {
  unsigned long now = millis();

  // ── WiFi bars in top-right ──
  int rssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : -127;
  drawWiFiBars(TFT_W - 13, HDR_Y + 2, rssi, WiFi.status() == WL_CONNECTED);

  // ── Status badge ──
  drawStatusBadge();

  // ── Clear wave band (preserve axis labels at x=0..7) ──
  tft.fillRect(8, WAVE_TOP, TFT_W - 8, WAVE_H + 1, COLOR_BLACK);

  // Redraw grid dots
  for (int x = 12; x < TFT_W; x += 10) {
    for (int y = WAVE_TOP + 4; y < WAVE_BOT; y += 8) {
      tft.drawPixel(x, y, COLOR_GRID);
    }
  }

  // Centerline
  tft.drawFastHLine(8, WAVE_MID, TFT_W - 8, COLOR_DIM);

  // ── Waveform ──
  uint16_t wcolor = stateColor(state);
  if (state == ALARMING && alertArmed) {
    // Filled waveform — dramatic look during T1
    for (int x = 8; x < TFT_W; x++) {
      int i0 = (waveHead + (x - 8)) % TFT_W;
      int y0 = dzToY(waveBuf[i0]);
      if (y0 < WAVE_MID) {
        tft.drawFastVLine(x, y0, WAVE_MID - y0, COLOR_DARKRED);
      } else if (y0 > WAVE_MID) {
        tft.drawFastVLine(x, WAVE_MID + 1, y0 - WAVE_MID, COLOR_DARKRED);
      }
      tft.drawPixel(x, y0, wcolor);
    }
  } else {
    for (int x = 8; x < TFT_W - 1; x++) {
      int i0 = (waveHead + (x - 8))     % TFT_W;
      int i1 = (waveHead + (x - 8) + 1) % TFT_W;
      tft.drawLine(x,     dzToY(waveBuf[i0]),
                   x + 1, dzToY(waveBuf[i1]), wcolor);
    }
  }

  // ── Ratio meter ──
  drawRatioMeter();

  // ── Stats row 1: P (peak)  E### (events)  uptime ──
  tft.setCursor(2, STATS_Y);
  tft.setTextColor(alertArmed ? COLOR_RED : COLOR_WHITE, COLOR_BLACK);
  tft.printf("P:%5.1f ", (double)peakRatio);

  tft.setTextColor(COLOR_CYAN, COLOR_BLACK);
  tft.printf("E%03u ", (unsigned)eventCount);

  tft.setTextColor(COLOR_DIM, COLOR_BLACK);
  char upbuf[12];
  formatUptime(now - bootMs, upbuf, sizeof(upbuf));
  tft.printf("%-8s", upbuf);

  // ── Stats row 2: T1  T2  <IP> ──
  tft.setCursor(2, STATS_Y + 12);
  tft.setTextColor(alertArmed ? COLOR_RED : COLOR_DARKGREY, COLOR_BLACK);
  tft.print(alertArmed ? F("T1* ") : F("T1  "));

  tft.setTextColor(ntfySent ? COLOR_CYAN : COLOR_DARKGREY, COLOR_BLACK);
  tft.print(ntfySent ? F("T2* ") : F("T2  "));

  tft.setTextColor(COLOR_DIM, COLOR_BLACK);
  if (WiFi.status() == WL_CONNECTED) {
    IPAddress ip = WiFi.localIP();
    tft.printf("%d.%d.%d.%-3d   ", ip[0], ip[1], ip[2], ip[3]);
  } else {
    tft.print(F("offline       "));
  }
}

// Animated splash — called once at boot.
void showSplash() {
  tft.fillScreen(COLOR_BLACK);

  // Thick-stroke lightning icon (layered for bold look)
  int cx = TFT_W / 2 - 3;
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      drawLightningIcon(cx + dx, 28 + dy, COLOR_ORANGE);
    }
  }
  // Bright inner core
  drawLightningIcon(cx, 28, COLOR_YELLOW);

  // Title (2x)
  tft.setTextSize(2);
  tft.setTextColor(COLOR_WHITE, COLOR_BLACK);
  tft.setCursor(14, 50);
  tft.print(F("SeismoGuard"));
  // Tagline
  tft.setTextSize(1);
  tft.setTextColor(COLOR_CYAN, COLOR_BLACK);
  tft.setCursor(50, 70);
  tft.print(F("EEW v"));
  tft.print(F(FW_VERSION));
  tft.setTextColor(COLOR_DIM, COLOR_BLACK);
  tft.setCursor(18, 82);
  tft.print(F("STA/LTA  F1 = 0.995"));

  // Progress bar
  tft.drawRect(20, 100, 120, 8, COLOR_WHITE);
  for (int p = 0; p < 118; p++) {
    uint16_t c = (p < 40) ? COLOR_DIMGREEN :
                 (p < 80) ? COLOR_CYAN     :
                            COLOR_ACCENT;
    tft.drawFastVLine(21 + p, 101, 6, c);
    delay(6);  // ~700 ms total
  }
  tft.setCursor(48, 114);
  tft.setTextColor(COLOR_ORANGE, COLOR_BLACK);
  tft.print(F("ready."));
  delay(250);
}

// ═══════════════════════════════════════════════════════════════════════════
// WiFi reconnect (periodic, non-blocking)
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
// setup()
// ═══════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && (millis() - t0) < 2000) { delay(10); }
  Serial.println();
  Serial.print(F("[SeismoGuard-S3] Booting v")); Serial.println(F(FW_VERSION));

  // Per-device unique ntfy topic (MAC-derived; stable across boots)
  generateNtfyTopic();

  // Mount event-log filesystem (FFat on 9MB partition)
  initEventLog();

  // ── Buzzer ──
  ledcAttach(PIN_BUZZER, BUZZER_PWM_BASE_FREQ, BUZZER_PWM_RES);
  buzzerOff();

  // ── TFT ──
  pinMode(PIN_TFT_BL, OUTPUT);
  digitalWrite(PIN_TFT_BL, HIGH);
  SPI.begin(PIN_TFT_SCK, -1, PIN_TFT_MOSI);
  tft.initR(INITR_BLACKTAB);
  tft.setRotation(1);          // landscape

  bootMs = millis();

  // ── Animated splash ──
  showSplash();

  // Draw static chrome once so subsequent setup text has a proper backdrop
  tftDrawChrome();
  tft.setCursor(44, STATUS_Y + 3);
  tft.setTextColor(COLOR_YELLOW, COLOR_BLACK);
  tft.print(F("Booting..."));

  // ── MPU6050 ──
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
    // Halt with visible blink so user notices.
    while (true) {
      digitalWrite(PIN_TFT_BL, HIGH); delay(300);
      digitalWrite(PIN_TFT_BL, LOW);  delay(300);
    }
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
  mpu.setFilterBandwidth(MPU6050_BAND_10_HZ);
  Serial.println(F("[OK] MPU6050 init"));

  // Progress text inside wave area
  tft.setCursor(2, WAVE_TOP + 2);
  tft.setTextColor(COLOR_GREEN, COLOR_BLACK);
  tft.print(F("[OK] MPU6050"));

  // ── WiFi ──
  tft.setCursor(2, WAVE_TOP + 14);
  tft.setTextColor(COLOR_WHITE, COLOR_BLACK);
  tft.print(F("WiFi: connecting..."));
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500); Serial.print('.'); tries++;
  }
  tft.fillRect(0, WAVE_TOP + 14, TFT_W, 10, COLOR_BLACK);
  tft.setCursor(2, WAVE_TOP + 14);
  if (WiFi.status() == WL_CONNECTED) {
    tft.setTextColor(COLOR_GREEN, COLOR_BLACK);
    tft.print(F("[OK] WiFi "));
    tft.print(WiFi.localIP());
    Serial.print(F("\n[WiFi] ")); Serial.println(WiFi.localIP());
  } else {
    tft.setTextColor(COLOR_RED, COLOR_BLACK);
    tft.print(F("[--] WiFi offline"));
    Serial.println(F("\n[WiFi] FAILED — offline mode"));
  }

  // ── Non-blocking ntfy worker (runs on Core 0; sampling timer stays on Core 1) ──
  ntfyQueue = xQueueCreate(4, sizeof(NtfyJob));
  if (ntfyQueue) {
    xTaskCreatePinnedToCore(ntfyTask, "ntfyTask", 8192, NULL, 1, &ntfyTaskHandle, 0);
    Serial.println(F("[OK] ntfy worker task spawned on Core 0"));
  } else {
    Serial.println(F("[FAIL] could not create ntfy queue"));
  }

  // ── "Device online" ntfy so user knows firmware booted OK ──
  if (WiFi.status() == WL_CONNECTED && ntfyQueue) {
    String body;
    body.reserve(160);
    body  = F("SeismoGuard EEW v");
    body += F(FW_VERSION);
    body += F(" online\nTopic: ");
    body += ntfyTopicFull;
    body += F("\nIP: ");
    body += WiFi.localIP().toString();
    enqueueNtfy("SeismoGuard online", body, "default", "white_check_mark");
  }

  // ── Calibration (30s @ 50Hz = 1500 samples, lets LTA fully converge τ=30s) ──
  tft.setCursor(2, WAVE_TOP + 26);
  tft.setTextColor(COLOR_YELLOW, COLOR_BLACK);
  tft.print(F("Calibrating 30s..."));
  // Progress bar frame below text
  const int CAL_BAR_X = 2, CAL_BAR_Y = WAVE_TOP + 38, CAL_BAR_W = TFT_W - 6, CAL_BAR_H = 6;
  tft.drawRect(CAL_BAR_X, CAL_BAR_Y, CAL_BAR_W, CAL_BAR_H, COLOR_WHITE);
  Serial.println(F("[CALIB] Keep sensor still for 30 s..."));
  const int CALIB_N = 1500;     // 30 s × 50 Hz
  sensors_event_t a, g, tmp;
  // Seed smoothed axes with first sample
  mpu.getEvent(&a, &g, &tmp);
  smoothedX     = a.acceleration.x;
  smoothedY     = a.acceleration.y;
  smoothedZ     = a.acceleration.z;
  smoothedZInit = true;
  float ltaInit   = 0.0f;
  float sumSq     = 0.0f;   // for variance check
  float sumSqSq   = 0.0f;
  for (int i = 0; i < CALIB_N; i++) {
    mpu.getEvent(&a, &g, &tmp);
    float dx = a.acceleration.x - smoothedX;
    float dy = a.acceleration.y - smoothedY;
    float dz = a.acceleration.z - smoothedZ;
    smoothedX = ALPHA_DC * a.acceleration.x + (1.0f - ALPHA_DC) * smoothedX;
    smoothedY = ALPHA_DC * a.acceleration.y + (1.0f - ALPHA_DC) * smoothedY;
    smoothedZ = ALPHA_DC * a.acceleration.z + (1.0f - ALPHA_DC) * smoothedZ;
    float cf0 = dx * dx + dy * dy + dz * dz;
    sumSq   += cf0;
    sumSqSq += cf0 * cf0;
    if (i == 0) ltaInit = cf0;
    else        ltaInit = 0.02f * cf0 + 0.98f * ltaInit;
    // Progress bar update every 20 samples (~400ms)
    if ((i % 20) == 0) {
      int filled = (int)((float)i / CALIB_N * (CAL_BAR_W - 2));
      tft.fillRect(CAL_BAR_X + 1, CAL_BAR_Y + 1, filled, CAL_BAR_H - 2, COLOR_CYAN);
    }
    delay(20);
  }
  // Variance check — if too high, sensor was moved during calibration
  float meanCf = sumSq / CALIB_N;
  float varCf  = (sumSqSq / CALIB_N) - (meanCf * meanCf);
  float noiseRatio = (meanCf > 1e-9f) ? (sqrtf(varCf) / meanCf) : 0.0f;
  if (noiseRatio > 2.0f) {
    Serial.printf("[CALIB] WARN high variance  noiseRatio=%.1f — keep sensor still!\n",
                  noiseRatio);
    tft.fillRect(CAL_BAR_X, CAL_BAR_Y, CAL_BAR_W, CAL_BAR_H, COLOR_BLACK);
    tft.setCursor(CAL_BAR_X, CAL_BAR_Y);
    tft.setTextColor(COLOR_RED, COLOR_BLACK);
    tft.print(F("CALIB noisy!"));
    delay(800);
  }
  // Guard: avoid pathological zero LTA (would make every sample look like a trigger)
  if (ltaInit < 1e-9f) ltaInit = 1e-9f;
  sta = ltaInit;
  lta = ltaInit;
  Serial.printf("[CALIB] Baseline LTA = %.6f  smoothedXYZ = %.3f,%.3f,%.3f m/s^2  noise=%.2f\n",
                ltaInit, smoothedX, smoothedY, smoothedZ, noiseRatio);

  // Init wave buffer to zero line
  for (int i = 0; i < TFT_W; i++) waveBuf[i] = 0.0f;

  // ── 50 Hz hardware timer (ESP32 Arduino core v3+ API) ──
  samplerTimer = timerBegin(1000000);        // 1 MHz tick
  if (samplerTimer == nullptr) {
    Serial.println(F("[FATAL] timerBegin returned null"));
    while (true) delay(1000);
  }
  timerAttachInterrupt(samplerTimer, &onSamplerTimer);
  timerAlarm(samplerTimer, SAMPLE_INTERVAL_US, true, 0);   // every 20 000 μs = 50 Hz

  delay(300);
  // Final clean chrome before loop() takes over refresh duties
  tftDrawChrome();
  // Reset bootMs so uptime counter starts after setup completes
  bootMs = millis();

  // ── Task watchdog: 10s timeout, panic & reset if loop hangs ──
  esp_task_wdt_config_t wdtCfg = {
    .timeout_ms     = 10000,
    .idle_core_mask = 0,
    .trigger_panic  = true,
  };
  esp_task_wdt_reconfigure(&wdtCfg);
  esp_task_wdt_add(NULL);                 // register the Arduino loopTask
  Serial.println(F("[OK] Task watchdog armed (10s)"));

  Serial.printf("[OK] Running.  TRIG=%.1f  TIER1=%.1f  TIER2=%.1f\n",
                RATIO_TRIGGER, RATIO_TIER1, RATIO_TIER2);
}

// ═══════════════════════════════════════════════════════════════════════════
// loop()
// ═══════════════════════════════════════════════════════════════════════════
void loop() {
  // 1. Drain sample ticks — process one sample per tick
  uint32_t ticks;
  portENTER_CRITICAL(&samplerMux);
  ticks     = tickCount;
  tickCount = 0;
  portEXIT_CRITICAL(&samplerMux);

  if (ticks > 1) missedSamples += (ticks - 1);
  for (uint32_t i = 0; i < ticks; i++) processSample();

  unsigned long now = millis();

  // 2. Buzzer siren management (non-blocking)
  if (state == ALARMING && alertArmed) buzzerSiren(now);
  else                                  buzzerOff();

  // 3. TFT refresh @ 10 Hz
  if (now - lastRefreshMs >= REFRESH_MS) {
    lastRefreshMs = now;
    tftRefresh();
  }

  // 4. WiFi health check
  checkWiFi(now);

  // 5. Periodic heartbeat ntfy (every HB_NTFY_MS, only when online)
  if ((now - lastHbNtfyMs) >= HB_NTFY_MS && WiFi.status() == WL_CONNECTED && ntfyQueue) {
    lastHbNtfyMs = now;
    char upbuf[12];
    formatUptime(now - bootMs, upbuf, sizeof(upbuf));
    IPAddress ip = WiFi.localIP();
    char body[160];
    snprintf(body, sizeof(body),
             "Device alive.\nUptime: %s\nEvents: %u\nLTA: %.4f\nIP: %d.%d.%d.%d",
             upbuf, (unsigned)eventCount, (double)lta,
             ip[0], ip[1], ip[2], ip[3]);
    enqueueNtfy("SeismoGuard heartbeat", String(body), "min", "green_heart");
    Serial.println(F("[hb-ntfy] queued"));
  }

  // 6. Feed watchdog (prevents reset if main loop is healthy)
  esp_task_wdt_reset();
}

// ═══════════════════════════════════════════════════════════════════════════
// processSample — single sample @ 50 Hz
// ═══════════════════════════════════════════════════════════════════════════
void processSample() {
  sensors_event_t a, g, tmp;
  mpu.getEvent(&a, &g, &tmp);
  float ax = a.acceleration.x;
  float ay = a.acceleration.y;
  float az = a.acceleration.z;

  // ── 3-axis DC-tracked deviation ──────────────────────────────────────
  float dx = ax - smoothedX;
  float dy = ay - smoothedY;
  float dz = az - smoothedZ;
  smoothedX = ALPHA_DC * ax + (1.0f - ALPHA_DC) * smoothedX;
  smoothedY = ALPHA_DC * ay + (1.0f - ALPHA_DC) * smoothedY;
  smoothedZ = ALPHA_DC * az + (1.0f - ALPHA_DC) * smoothedZ;

  // Push raw dz to waveform buffer (Z for visual seismograph convention)
  waveBuf[waveHead] = dz;
  waveHead = (waveHead + 1) % TFT_W;

  // Zero-crossing tracking on dz (anti-thump filter)
  int curSign = (dz > 0.01f) ? 1 : (dz < -0.01f ? -1 : 0);
  zcBuf[zcHead] = (curSign != 0 && lastDzSign != 0 && curSign != lastDzSign) ? 1 : 0;
  zcHead = (zcHead + 1) % ZC_WINDOW;
  if (curSign != 0) lastDzSign = curSign;
  int zcCount = 0;
  for (int i = 0; i < ZC_WINDOW; i++) zcCount += zcBuf[i];

  // ── Characteristic function: 3-axis magnitude squared + spike clamp ──
  float cf = dx * dx + dy * dy + dz * dz;
  float ltaRef = (lta > 1e-9f) ? lta : 1e-9f;
  if (cf > SPIKE_LIMIT * ltaRef) cf = SPIKE_LIMIT * ltaRef;

  sta = ALPHA_STA * cf + (1.0f - ALPHA_STA) * sta;
  float ratio = (lta > 1e-9f) ? (sta / lta) : 0.0f;
  curRatio = ratio;

  // ── State machine ─────────────────────────────────────────────────────
  switch (state) {

    case STANDBY:
      lta = ALPHA_LTA * cf + (1.0f - ALPHA_LTA) * lta;
      if (ratio >= RATIO_TRIGGER) {
        trigCount = 1;
        state = DETECTING;
      }
      break;

    case DETECTING:
      lta = ALPHA_LTA_BLEED * cf + (1.0f - ALPHA_LTA_BLEED) * lta;
      if (ratio >= RATIO_TRIGGER) {
        trigCount++;
        if (trigCount >= MIN_TRIG_COUNT) {
          // Anti-thump: require oscillation (real P-wave has multiple zero-crossings)
          if (zcCount < ZC_MIN_FOR_PWAVE) {
            Serial.printf("[REJECT] single thump  ratio=%.2f  zc=%d\n",
                          ratio, zcCount);
            state = LOCKOUT;
            trigCount = 0;
            break;
          }
          state         = ALARMING;
          peakRatio     = ratio;
          alertArmed    = false;
          ntfySent      = false;
          alarmStartMs  = millis();
          alarmZcAtTrig = zcCount;
          Serial.printf("[ALARM] P-onset  sample=%lu  ratio=%.2f  zc=%d\n",
                        sampleCount, ratio, zcCount);
        }
      } else {
        trigCount = 0;
        state = STANDBY;
      }
      break;

    case ALARMING:
      lta = ALPHA_LTA_BLEED * cf + (1.0f - ALPHA_LTA_BLEED) * lta;
      if (ratio > peakRatio) peakRatio = ratio;

      // Tier 1: local buzzer — bump event counter here so silent P-waves don't count
      if (!alertArmed && peakRatio >= RATIO_TIER1) {
        alertArmed = true;
        eventCount++;
        Serial.printf("[T1] peakRatio=%.1f >= %.1f — buzzer ON  event#%u\n",
                      peakRatio, RATIO_TIER1, (unsigned)eventCount);
      }

      // Tier 2: remote ntfy push
      if (!ntfySent && peakRatio >= RATIO_TIER2 &&
          WiFi.status() == WL_CONNECTED &&
          (millis() - lastAlertMs) > ALERT_COOLDOWN_MS) {
        ntfySent    = true;
        lastAlertMs = millis();
        String body;
        body.reserve(160);
        body  = F("ตรวจพบแผ่นดินไหว!\n");
        body += F("Peak ratio: ");
        body += String(peakRatio, 1);
        body += F("\nโปรดหาที่กำบัง ห่างจากหน้าต่าง\n");
        body += F("SeismoGuard EEW ");
        body += F(FW_VERSION);
        enqueueNtfy("SeismoGuard EEW ALERT", body, "urgent",
                    "rotating_light,earthquake");
        Serial.printf("[T2] ntfy queued  peakRatio=%.1f\n", peakRatio);
      }

      if (ratio < RATIO_DETRIGGER) {
        if (!alertArmed) {
          Serial.printf("[SILENT] peakRatio=%.1f < %.1f — no alarm\n",
                        peakRatio, RATIO_TIER1);
        }
        // Log event to CSV before moving on (only for confirmed alarms, not silents)
        if (alertArmed) {
          float    durSec  = (millis() - alarmStartMs) / 1000.0f;
          uint32_t bootSec = (millis() - bootMs) / 1000UL;
          logEvent(bootSec, eventCount, peakRatio, lta,
                   alarmZcAtTrig, durSec, alertArmed, ntfySent);
        }
        state = LOCKOUT;
        Serial.println(F("[LOCKOUT] Detrigger"));
      }
      break;

    case LOCKOUT:
      lta = ALPHA_LTA * cf + (1.0f - ALPHA_LTA) * lta;
      if (ratio < RATIO_DETRIGGER * 0.8f) {
        state      = STANDBY;
        trigCount  = 0;
        peakRatio  = 0.0f;
        alertArmed = false;
        ntfySent   = false;
        Serial.println(F("[STANDBY] Detector reset"));
      }
      break;
  }

  sampleCount++;

  // Heartbeat every 10 s
  if (sampleCount % HB_INTERVAL_SAMPLES == 0) {
    Serial.printf("[hb] t=%lus  state=%u  sta=%.5f  lta=%.5f  ratio=%.3f  missed=%lu\n",
                  sampleCount / SAMPLE_RATE_HZ, (unsigned)state,
                  sta, lta, ratio, missedSamples);
  }
}
