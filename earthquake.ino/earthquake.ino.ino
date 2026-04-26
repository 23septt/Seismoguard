#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>

// ─── Hardware ────────────────────────────────────────────────────────────────
Adafruit_MPU6050 mpu;
const uint8_t BUZZER_PIN = 9;

// ─── Sampling ────────────────────────────────────────────────────────────────
// 50 Hz is the minimum practical rate for P-wave onset capture on MEMS sensors.
const uint16_t SAMPLE_RATE_HZ    = 50;
const uint16_t SAMPLE_INTERVAL_MS = 1000 / SAMPLE_RATE_HZ;   // 20 ms

const float STA_WINDOW_SEC = 0.5f;                           // 0.5 s → 25 samples
const float LTA_WINDOW_SEC = 30.0f;                          // 30 s  → 1500 samples

const float ALPHA_STA = 1.0f / (STA_WINDOW_SEC * SAMPLE_RATE_HZ);  // 0.04
const float ALPHA_LTA = 1.0f / (LTA_WINDOW_SEC * SAMPLE_RATE_HZ);  // 0.000667

const float RATIO_TRIGGER   = 5.0f;   // grid-search optimal (validated on STEAD)
const float RATIO_DETRIGGER = 1.5f;

const uint8_t  MIN_TRIGGER_SAMPLES = 10;     // N × 20 ms = 200 ms (grid-search optimal)

const float ALPHA_LTA_BLEED = 0.0001f;

const float SPIKE_REJECT_FACTOR = 100.0f;  // grid-search optimal

// ─── Alarm ─────────────────────────────────────────────────────────
const uint32_t ALARM_DURATION_MS  = 3000UL;  // 3 s alarm window
const uint16_t ALARM_BEEP_PERIOD  = 150;       // ms per beep cycle
const uint16_t ALARM_BEEP_ON      = 75;        // ms buzzer HIGH
const uint32_t POST_ALARM_LOCKOUT = 5000UL;    // Refractory: ignore retriggering for 5 s after alarm

// ─── Calibration ─────────────────────────────────────────────────────────────
const uint16_t CALIB_SAMPLES = 300;      
const float    CALIB_ALPHA   = 0.02f; 

float sta = 0.0f, lta = 0.0f;
float smoothedZ = 0.0f;   // DC-offset tracker for Z-axis (seeded with gravity in setup)
uint8_t triggerCount = 0;

enum class State : uint8_t {
  STANDBY,
  DETECTING,    
  ALARMING,
  LOCKOUT    
};
State systemState = State::STANDBY;
uint32_t stateEnteredAt = 0;
uint32_t lastSampleTime = 0;

float   readCF();
void    updateDetector(float cf, uint32_t now);
void    manageAlarm(uint32_t now);
void    plotData(float cf, float ratio);
void    setState(State s, uint32_t now);
void    fatalError(const __FlashStringHelper* msg);

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
    smoothedZ = a.acceleration.z;   // seed DC tracker with first reading (≈ +9.81 m/s²)
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
    float cf = readCF();
    updateDetector(cf, now);
  }

  manageAlarm(millis());
}

float readCF() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  // Use vertical (Z) axis only — matches STEAD single-component vertical format.
  // Remove DC offset (gravity ≈ 9.81 m/s²) with a slow EMA (τ ≈ 10 s at 50 Hz),
  // then square the residual to form the Characteristic Function.
  float dz = a.acceleration.z - smoothedZ;
  smoothedZ = (0.002f * a.acceleration.z) + (0.998f * smoothedZ);

  return dz * dz;
}

// ─── Recursive STA/LTA Detector  ─────────────────────────────────────
void updateDetector(float cf, uint32_t now) {

  // ── Spike rejection: ป้องกันสัญญาณรบกวนกระชาก ──
  float ltaRef = max(lta, 1e-9f);
  if (cf > SPIKE_REJECT_FACTOR * ltaRef) {
    cf = SPIKE_REJECT_FACTOR * ltaRef;
  }

  // ── คำนวณ STA และ Ratio ──
  sta = (ALPHA_STA * cf) + ((1.0f - ALPHA_STA) * sta);
  float ratio = (lta > 1e-9f) ? (sta / lta) : 0.0f;

  switch (systemState) {

    case State::STANDBY:
      lta = (ALPHA_LTA * cf) + ((1.0f - ALPHA_LTA) * lta);
      if (ratio >= RATIO_TRIGGER) {
        triggerCount++;
        setState(State::DETECTING, now);   // always enter DETECTING first (matches simulation)
      } else {
        triggerCount = 0;                  // reset counter when signal is quiet
      }
      break;

    case State::DETECTING: // <--- ส่วนนี้ที่หายไป!
      lta = (ALPHA_LTA_BLEED * cf) + ((1.0f - ALPHA_LTA_BLEED) * lta);
      if (ratio >= RATIO_TRIGGER) {
        triggerCount++;
        if (triggerCount >= MIN_TRIGGER_SAMPLES) {
          setState(State::ALARMING, now);
          Serial.println(F("\n[ALERT] *** P-WAVE DETECTED! ***"));
        }
      } else {
        triggerCount = 0;
        setState(State::STANDBY, now);
      }
      break;

    case State::ALARMING:
      // ตอน Alarm ให้ LTA อัปเดตช้าๆ เพื่อไม่ให้ฐานข้อมูลเสีย
      lta = (ALPHA_LTA_BLEED * cf) + ((1.0f - ALPHA_LTA_BLEED) * lta);
      
      // ถ้าสั่นเบาลงจนต่ำกว่า Detrig ให้หยุดร้อง
      if (ratio < RATIO_DETRIGGER) {
        triggerCount = 0;   // reset ก่อน lockout เพื่อไม่ให้ค้างข้ามไป STANDBY ถัดไป
        Serial.println(F("[STATUS] Vibration subsided below Detrig threshold."));
        setState(State::LOCKOUT, now);
      }
      break;

    case State::LOCKOUT: // <--- ส่วนพักเครื่องที่หายไป!
      lta = (ALPHA_LTA * cf) + ((1.0f - ALPHA_LTA) * lta);
      break;
  }

  plotData(cf, ratio);
}

void manageAlarm(uint32_t now) {
  uint32_t elapsed = now - stateEnteredAt;

  if (systemState == State::ALARMING) {
    // เงื่อนไขหยุด: (สั่นเบาลงจนต่ำกว่า Detrig) หรือ (ร้องมานานจนครบเวลา 3 วินาที)
    if (elapsed < ALARM_DURATION_MS) {
      digitalWrite(BUZZER_PIN, (elapsed % ALARM_BEEP_PERIOD) < ALARM_BEEP_ON);
    } else {
      digitalWrite(BUZZER_PIN, LOW);
      triggerCount = 0;
      Serial.println(F("[STATUS] Timeout reached — forcing lockout."));
      setState(State::LOCKOUT, now);
    }
  }

  if (systemState == State::LOCKOUT) {
    digitalWrite(BUZZER_PIN, LOW); // มั่นใจว่า Buzzer ปิดสนิท
    if (elapsed >= POST_ALARM_LOCKOUT) {
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
  Serial.print(F("Trig:"));   Serial.print(RATIO_TRIGGER);  Serial.print(F(","));
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


