/**
 * test_03_mpu6050.ino  —  Phase 3 Smoke Test #3
 * ─────────────────────────────────────────────────
 * PASS criteria:
 *   - Serial Monitor: az ≈ +9.81 m/s² when sensor flat (Z points up)
 *   - Serial Plotter: az line stays near 9.81, dz near 0.0 when still
 *   - When you tap the sensor: spikes visible in both az and dz
 *
 * Open Serial Plotter (Tools → Serial Plotter) for best view.
 *
 * Wiring: SDA=GPIO8, SCL=GPIO9, VCC=3.3V, GND=GND, AD0=GND
 */

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

#define PIN_SDA  8
#define PIN_SCL  9

Adafruit_MPU6050 mpu;

float smoothedZ  = 0.0f;
const float ALPHA_DC = 0.002f;   // same as firmware

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("[test_03] MPU6050 test");

  Wire.begin(PIN_SDA, PIN_SCL);
  if (!mpu.begin()) {
    Serial.println("ERROR: MPU6050 not found! Check wiring.");
    while (true) { delay(500); }
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
  mpu.setFilterBandwidth(MPU6050_BAND_10_HZ);
  Serial.println("MPU6050 OK  (range=±2g, filter=10Hz)");
  Serial.println();

  // Seed DC tracker
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);
  smoothedZ = a.acceleration.z;
  Serial.println("az_ms2:dz_ms2:cf");   // Serial Plotter labels
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float az = a.acceleration.z;
  float dz = az - smoothedZ;
  smoothedZ = ALPHA_DC * az + (1.0f - ALPHA_DC) * smoothedZ;
  float cf = dz * dz;

  // Serial Plotter format  (label:value,label:value,...)
  Serial.printf("az_ms2:%.3f,dz_ms2:%.3f,cf:%.4f\n", az, dz, cf);

  delay(20);   // 50 Hz
}
