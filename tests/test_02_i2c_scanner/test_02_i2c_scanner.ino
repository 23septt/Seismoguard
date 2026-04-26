/**
 * test_02_i2c_scanner.ino  —  Phase 3 Smoke Test #2
 * ────────────────────────────────────────────────────
 * PASS criteria: Serial shows "Found device at 0x68" (MPU6050 address).
 *
 * Wiring to check (MPU6050 → ESP32-S3 Expansion Board):
 *   VCC → 3.3V
 *   GND → GND
 *   SDA → GPIO8
 *   SCL → GPIO9
 *   AD0 → GND  (keeps address at 0x68, not 0x69)
 *
 * If 0x68 not found: re-check jumper wires, re-seat MPU6050, confirm 3.3V (not 5V).
 */

#include <Wire.h>

#define PIN_SDA  8
#define PIN_SCL  9

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("\n[test_02] I²C Scanner starting...");

  Wire.begin(PIN_SDA, PIN_SCL);

  uint8_t found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();
    if (err == 0) {
      Serial.printf("  Found device at 0x%02X", addr);
      if (addr == 0x68) Serial.print("  ← MPU6050 (AD0=GND)");
      if (addr == 0x69) Serial.print("  ← MPU6050 (AD0=3V3)");
      Serial.println();
      found++;
    }
  }

  if (found == 0) {
    Serial.println("  No I2C devices found!");
    Serial.println("  Check: SDA=GPIO8, SCL=GPIO9, VCC=3.3V, GND connected.");
  } else {
    Serial.printf("\n[test_02] Done — %u device(s) found.\n", found);
  }
}

void loop() {
  // scan again every 3 s (useful if you plug in while running)
  delay(3000);
  Serial.println("\n--- Rescanning ---");
  uint8_t found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  0x%02X\n", addr);
      found++;
    }
  }
  if (found == 0) Serial.println("  (none)");
}
