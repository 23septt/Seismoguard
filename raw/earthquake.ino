#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>

// ─── Hardware ────────────────────────────────────────────────────────────────
Adafruit_MPU6050 mpu;
const uint8_t BUZZER_PIN = 9;

// ─── Sampling ────────────────────────────────────────────────────────────────
// 50 Hz is the minimum practical rate for P-wave onset capture on MEMS sensors.
const uint16_t SAMPLE_RATE_HZ     = 50;
const uint16_t SAMPLE_INTERVAL_MS = 1000 / SAMPLE_RATE_HZ;   // 20 ms

const float STA_WINDOW_SEC = 0.5f;                           // 0.5 s → 25 samples
const float LTA_WINDOW_SEC = 30.0f;                          // 30 s  → 1500 samples

const float ALPHA_STA = 1.0f / (STA_WINDOW_SEC * SAMPLE_RATE_HZ);  // 0.04
const float ALPHA_LTA = 1.0f / (LTA_WINDOW_SEC * SAMPLE_RATE_HZ);  // 0.000667

const float RATIO_TRIGGER   = 6.0f;   // grid-search optimal (439P+250N stratified STEAD)
const float RATIO_DETRIGGER = 1.5f;

const uint8_t  MIN_TRIGGER_SAMPLES = 3;      // N × 20 ms = 60 ms   (grid-search optimal)

const float ALPHA_LTA_BLEED = 0.0001f;

const float SPIKE_REJECT_FACTOR = 50.0f;   // grid-search optimal

// ─── Tier-1 alert threshold (ratio-based) ────────────────────────────────────
// Pd (Wu & Kanamori double-integration) is unreliable on MEMS sensors: noise
// amplification from double integration can exceed real signal displacement for
// Mw <5 events. Peak STA/LTA ratio during the ALARMING window is used instead
// as a shaking-intensity proxy — already computed, no integration required, and
// normalized to the local noise floor.
// RATIO_TIER1 is an initial estimate; calibrate against real earthquake data.
const float RATIO_TIER1 = 8.0f;   // Tier-1 gate → buzzer  (UNTESTED — tune with real events)

// ─── Alarm ────────────────────────────────────────────────────────────────────
const uint32_t ALARM_DURATION_MS  = 3000UL;  // 3 s alarm window
const uint16_t ALARM_BEEP_PERIOD  = 150;      // ms per beep cycle
const uint16_t ALARM_BEEP_ON      = 75;       // ms buzzer HIGH
const uint32_t POST_ALARM_LOCKOUT = 5000UL;   // refractory: 5 s before re-arm

// ─── Calibration ─────────────────────────────────────────────────────────────
const uint16_t CALIB_SAMPLES = 300;
const float    CALIB_ALPHA   = 0.02f;

float   sta = 0.0f, lta = 0.0f;
float   smoothedZ = 0.0f;    // DC-offset tracker (seeded with gravity in setup)
uint8_t triggerCount = 0;
float   peakRatio   = 0.0f;  // highest STA/LTA seen in current ALARMING window
bool    alertArmed  = false;  // true when peakRatio >= RATIO_TIER1

enum class State : uint8_t {
  STANDBY,
  DETECTING,
  ALARMING,
  LOCKOUT
};
State    systemState   = State::STANDBY;
uint32_t stateEnteredAt = 0;
uint32_t lastSampleTime = 0;

float  readCF();
void   updateDetector(float cf, uint32_t now);
void   manageAlarm(uint32_t now);
void   plotData(float cf, float ratio);
void   setState(State s, uint32_t now);
void   fatalError(const __FlashStringHelper* msg);

// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  if (!mpu.begin()) {
    fatalError(F("MPU6050 not found! Check wiring."));
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_10_HZ);

  {
    sensors_event_t a, g, t;
    mpu.getEvent(&a, &g, &t);
    smoothedZ = a.acceleration.z;   // seed DC tracker (≈ +9.81 m/s²)
  }

  Serial.println(F("\n[SETUP] Calibrating — keep sensor perfectly still for 6 s..."));
  lta = readCF();   // seed LTA with first sample to avoid cold-start bias
  for (uint16_t i = 0; i < CALIB_SAMPLES; i++) {
    float cf = readCF();
    lta = (CALIB_ALPHA * cf) + ((1.0f - CALIB_ALPHA) * lta);
    delay(SAMPLE_INTERVAL_MS);
  }
  sta = lta;

  Serial.print(F("[SETUP] Baseline LTA = "));
  Serial.print(lta, 6);
  Serial.println(F("  |  Monitoring started.\n"));
}

// ─────────────────────────────────────────────────────────────────────────────
void loop() {
  uint32_t now = millis();

  if (now - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = now;
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    float az = a.acceleration.z;
    float dz = az - smoothedZ;
    smoothedZ = (0.002f * az) + (0.998f * smoothedZ);
    float cf = dz * dz;
    updateDetector(cf, now);
  }

  manageAlarm(millis());
}

// readCF() — blocking read used only during calibration in setup()
float readCF() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  float dz = a.acceleration.z - smoothedZ;
  smoothedZ = (0.002f * a.acceleration.z) + (0.998f * smoothedZ);
  return dz * dz;
}

// ─── Recursive STA/LTA Detector ──────────────────────────────────────────────
void updateDetector(float cf, uint32_t now) {

  // ── Spike rejection ──────────────────────────────────────────────────────
  float ltaRef = max(lta, 1e-9f);
  if (cf > SPIKE_REJECT_FACTOR * ltaRef) {
    cf = SPIKE_REJECT_FACTOR * ltaRef;
  }

  // ── STA / Ratio ──────────────────────────────────────────────────────────
  sta = (ALPHA_STA * cf) + ((1.0f - ALPHA_STA) * sta);
  float ratio = (lta > 1e-9f) ? (sta / lta) : 0.0f;

  switch (systemState) {

    case State::STANDBY:
      lta = (ALPHA_LTA * cf) + ((1.0f - ALPHA_LTA) * lta);
      if (ratio >= RATIO_TRIGGER) {
        triggerCount++;
        setState(State::DETECTING, now);   // always enter DETECTING first (matches simulation)
      } else {
        triggerCount = 0;
      }
      break;

    case State::DETECTING:
      lta = (ALPHA_LTA_BLEED * cf) + ((1.0f - ALPHA_LTA_BLEED) * lta);
      if (ratio >= RATIO_TRIGGER) {
        triggerCount++;
        if (triggerCount >= MIN_TRIGGER_SAMPLES) {
          peakRatio  = ratio;    // seed peak tracker with onset ratio
          alertArmed = false;
          setState(State::ALARMING, now);
          Serial.println(F("\n[DETECT] P-wave onset confirmed."));
        }
      } else {
        triggerCount = 0;
        setState(State::STANDBY, now);
      }
      break;

    case State::ALARMING:
      lta = (ALPHA_LTA_BLEED * cf) + ((1.0f - ALPHA_LTA_BLEED) * lta);

      // ── Track peak ratio (shaking-intensity proxy) ───────────────────────
      if (ratio > peakRatio) peakRatio = ratio;

      // ── Arm alarm immediately when Tier-1 gate is crossed ───────────────
      if (!alertArmed && peakRatio >= RATIO_TIER1) {
        alertArmed = true;
        Serial.print(F("[T1] Peak ratio "));
        Serial.print(peakRatio, 1);
        Serial.print(F(" >= "));
        Serial.print(RATIO_TIER1, 1);
        Serial.println(F(" — ALARM ON"));
      }

      // ── Detrigger: shaking has subsided ─────────────────────────────────
      if (ratio < RATIO_DETRIGGER) {
        if (!alertArmed) {
          Serial.print(F("[SILENT] Peak ratio "));
          Serial.print(peakRatio, 1);
          Serial.print(F(" < "));
          Serial.print(RATIO_TIER1, 1);
          Serial.println(F(" — below threshold, no alarm"));
        }
        triggerCount = 0;
        setState(State::LOCKOUT, now);
      }
      break;

    case State::LOCKOUT:
      lta = (ALPHA_LTA * cf) + ((1.0f - ALPHA_LTA) * lta);
      break;
  }

  plotData(cf, ratio);
}

// ─── Alarm management (non-blocking beep timer) ───────────────────────────────
void manageAlarm(uint32_t now) {
  uint32_t elapsed = now - stateEnteredAt;

  if (systemState == State::ALARMING && alertArmed) {
    // Tier 1: beep buzzer during alarm window
    if (elapsed < ALARM_DURATION_MS) {
      digitalWrite(BUZZER_PIN, (elapsed % ALARM_BEEP_PERIOD) < ALARM_BEEP_ON);
    } else {
      digitalWrite(BUZZER_PIN, LOW);
      triggerCount = 0;
      Serial.println(F("[STATUS] Alarm timeout — lockout."));
      setState(State::LOCKOUT, now);
    }
  }

  if (systemState == State::LOCKOUT) {
    digitalWrite(BUZZER_PIN, LOW);
    if (elapsed >= POST_ALARM_LOCKOUT) {
      alertArmed = false;
      peakRatio  = 0.0f;
      Serial.println(F("[STATUS] Lockout cleared — standby."));
      setState(State::STANDBY, now);
    }
  }
}

void plotData(float cf, float ratio) {
  Serial.print(F("CF:"));     Serial.print(cf,    6); Serial.print(F(","));
  Serial.print(F("STA:"));    Serial.print(sta,   6); Serial.print(F(","));
  Serial.print(F("LTA:"));    Serial.print(lta,   6); Serial.print(F(","));
  Serial.print(F("Ratio:"));  Serial.print(ratio, 3); Serial.print(F(","));
  Serial.print(F("Trig:"));   Serial.print(RATIO_TRIGGER);   Serial.print(F(","));
  Serial.print(F("Detrig:")); Serial.print(RATIO_DETRIGGER); Serial.print(F(","));
  Serial.print(F("State:"));  Serial.println(static_cast<uint8_t>(systemState));
}

void setState(State s, uint32_t now) {
  systemState    = s;
  stateEnteredAt = now;
}

void fatalError(const __FlashStringHelper* msg) {
  Serial.print(F("[FATAL] ")); Serial.println(msg);
  while (true) {
    digitalWrite(BUZZER_PIN, HIGH); delay(50);
    digitalWrite(BUZZER_PIN, LOW);  delay(50);
  }
}
