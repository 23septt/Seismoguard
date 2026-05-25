#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include "test_data.h" 

// =============================================================================
// [SETTINGS]
// =============================================================================
const bool IS_SIMULATION = true; 
const uint8_t BUZZER_PIN = 9;

// ─── STA/LTA Parameters ──────────────────────────────────────────────────────
const uint16_t SAMPLE_RATE_HZ     = 50;
const uint16_t SAMPLE_INTERVAL_MS = 1000 / SAMPLE_RATE_HZ; 
const float STA_WINDOW_SEC = 0.5f;  // best from grid search
const float LTA_WINDOW_SEC = 30.0f; 
const float ALPHA_STA = 1.0f / (STA_WINDOW_SEC * SAMPLE_RATE_HZ);
const float ALPHA_LTA = 1.0f / (LTA_WINDOW_SEC * SAMPLE_RATE_HZ);

const float ALPHA_LTA_BLEED = 0.0001f; 
const float SPIKE_REJECT_FACTOR = 100.0f; // grid search optimal

const uint32_t ALARM_DURATION_MS  = 3000UL; 
const uint16_t ALARM_BEEP_PERIOD  = 150; 
const uint16_t ALARM_BEEP_ON      = 75; 
const uint32_t POST_ALARM_LOCKOUT = 5000UL; 

enum class State : uint8_t { STANDBY, DETECTING, ALARMING, LOCKOUT };
State systemState = State::STANDBY;

float sta = 0.0f, lta = 0.0f, smoothedZ = 0.0f;
uint8_t triggerCount = 0;
uint32_t stateEnteredAt = 0;
uint32_t lastSampleTime = 0;

Adafruit_MPU6050 mpu;

const float RATIO_TRIGGER   = 5.0f;   // grid search optimal
const float RATIO_DETRIGGER = 1.5f;
const uint8_t MIN_TRIGGER_SAMPLES = 10; // grid search optimal

// ─── Core Logic ──────────────────────────────────────────────────────────────

// Run one sample through the STA/LTA detector. Returns the sample index
// (relative to detection window start) when alarm fires, or -1 if no alarm.
int runOneSample(const float* samplePtr, bool isNoise) {
  const int warmupLen = isNoise ? 1750 : 0;
  const int detectLen = 250;

  // Warm up LTA/STA directly — no detection state machine during warmup.
  float firstVal = pgm_read_float(samplePtr);
  float firstCF  = firstVal * firstVal;
  sta = firstCF; lta = firstCF;
  systemState = State::STANDBY; triggerCount = 0;

  for (int i = 0; i < warmupLen; i++) {
    float wv  = pgm_read_float(samplePtr + i);
    float wcf = wv * wv;
    lta = (ALPHA_LTA * wcf) + ((1.0f - ALPHA_LTA) * lta);
    sta = (ALPHA_STA * wcf) + ((1.0f - ALPHA_STA) * sta);
  }

  // Detection window
  for (int i = warmupLen; i < warmupLen + detectLen; i++) {
    float val = pgm_read_float(samplePtr + i);
    float cf  = val * val;
    uint32_t now = millis();
    updateDetector(cf, now);
    if (systemState == State::ALARMING) return i - warmupLen;
  }
  return -1;
}

void runSimulation() {
  Serial.println(F("\n========== SIMULATION START =========="));

  // ── P-wave test: all 100 samples ─────────────────────────────────────────
  Serial.println(F("\n--- P-WAVE TEST (100 samples) ---"));
  uint8_t pwDetected = 0;
  for (uint8_t n = 0; n < 77; n++) {
    const float* ptr = (const float*)pgm_read_ptr(&pwave_samples_all[n]);
    int detAt = runOneSample(ptr, false);
    if (detAt >= 0) {
      pwDetected++;
      Serial.print(F("  P")); Serial.print(n + 1);
      Serial.print(F(" DETECTED @")); Serial.println(detAt);
    } else {
      Serial.print(F("  P")); Serial.print(n + 1);
      Serial.println(F(" MISSED"));
    }
  }
  Serial.print(F("\nP-wave result: "));
  Serial.print(pwDetected); Serial.println(F(" / 77 detected"));

  // ── Noise test: all 50 samples ────────────────────────────────────────────
  Serial.println(F("\n--- NOISE TEST (50 samples) ---"));
  uint8_t noiseFA = 0;
  for (uint8_t n = 0; n < 77; n++) {
    const float* ptr = (const float*)pgm_read_ptr(&noise_samples_all[n]);
    int detAt = runOneSample(ptr, true);
    if (detAt >= 0) {
      noiseFA++;
      Serial.print(F("  N")); Serial.print(n + 1);
      Serial.print(F(" FALSE ALARM @")); Serial.println(detAt);
    }
  }
  Serial.print(F("\nNoise result: "));
  Serial.print(noiseFA); Serial.println(F(" / 38 false alarms"));

  Serial.println(F("\n========== SIMULATION END =========="));
}

void setState(State s, uint32_t now) {
  systemState = s;
  stateEnteredAt = now;
}

void fatalError(const __FlashStringHelper* msg) {
  Serial.println(msg);
  // ปิดเสียงใน Error ด้วย
  while (true) { delay(100); }
}

float readCF() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  // Use vertical (Z) axis only — matches STEAD single-component vertical format.
  // Remove DC offset (gravity) with a slow smoother, then square the residual.
  // This is equivalent to simulation's  cf = val²  where val is already de-meaned.
  float dz = a.acceleration.z - smoothedZ;
  smoothedZ = (0.002f * a.acceleration.z) + (0.998f * smoothedZ); // τ ≈ 10s
  return dz * dz;
}

void updateDetector(float cf, uint32_t now) {
  float ltaRef = max(lta, 1e-9f);
  if (cf > SPIKE_REJECT_FACTOR * ltaRef) cf = SPIKE_REJECT_FACTOR * ltaRef;

  sta = (ALPHA_STA * cf) + ((1.0f - ALPHA_STA) * sta);
  float ratio = (lta > 1e-9f) ? (sta / lta) : 0.0f;

  switch (systemState) {
    case State::STANDBY:
      lta = (ALPHA_LTA * cf) + ((1.0f - ALPHA_LTA) * lta);
      if (ratio >= RATIO_TRIGGER) {
        triggerCount++;
        setState(State::DETECTING, now);
      }
      break;
    case State::DETECTING:
      lta = (ALPHA_LTA_BLEED * cf) + ((1.0f - ALPHA_LTA_BLEED) * lta);
      if (ratio >= RATIO_TRIGGER) {
        triggerCount++;
        if (triggerCount >= MIN_TRIGGER_SAMPLES) setState(State::ALARMING, now);
      } else {
        triggerCount = 0;
        setState(State::STANDBY, now);
      }
      break;
    case State::ALARMING:
      lta = (ALPHA_LTA_BLEED * cf) + ((1.0f - ALPHA_LTA_BLEED) * lta);
      if (ratio < RATIO_DETRIGGER) setState(State::LOCKOUT, now);
      break;
    case State::LOCKOUT:
      lta = (ALPHA_LTA * cf) + ((1.0f - ALPHA_LTA) * lta);
      break;
  }
}

void manageAlarm(uint32_t now) {
  uint32_t elapsed = now - stateEnteredAt;
  if (systemState == State::ALARMING) {
    if (elapsed < ALARM_DURATION_MS) {
      // ปิดเสียงตรงนี้: digitalWrite(BUZZER_PIN, (elapsed % ALARM_BEEP_PERIOD) < ALARM_BEEP_ON);
      digitalWrite(BUZZER_PIN, LOW); // บังคับให้เป็น LOW เสมอ
    } else {
      digitalWrite(BUZZER_PIN, LOW);
      setState(State::LOCKOUT, now);
    }
  }
  if (systemState == State::LOCKOUT) {
    digitalWrite(BUZZER_PIN, LOW);
    if (elapsed >= POST_ALARM_LOCKOUT) setState(State::STANDBY, now);
  }
}


// ─── Standard Arduino Functions ──────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW); // ปิดเสียงตอนเริ่ม

  if (!IS_SIMULATION) {
    if (!mpu.begin()) fatalError(F("MPU6050 not found!"));
    mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
    mpu.setFilterBandwidth(MPU6050_BAND_10_HZ);
    smoothedZ = 9.81f;   // seed with gravity so DC smoother starts near true mean
    lta = 0.1f; sta = 0.1f;
  } else {
    lta = 10.0f; sta = 10.0f;
  }
}

void loop() {
  if (IS_SIMULATION) {
    runSimulation();
    while(1); 
  } else {
    uint32_t now = millis();
    if (now - lastSampleTime >= SAMPLE_INTERVAL_MS) {
      lastSampleTime = now;
      updateDetector(readCF(), now);
    }
    manageAlarm(millis());
  }
}