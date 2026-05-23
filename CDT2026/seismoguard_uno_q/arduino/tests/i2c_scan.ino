/*
 * i2c_scan.ino — debug aid for the CDT2026 build day.
 *
 * Run this BEFORE flashing the main sketch. Confirms every Modulino on the
 * Qwiic chain is alive and prints its 7-bit address. If a Modulino is
 * missing or its address differs from what Arduino_Modulino expects, you
 * find out here in 30 seconds rather than chasing a silent failure later.
 *
 * Wiring: chain Qwiic cables UNO Q -> Movement -> Buzzer -> Pixels.
 *
 * Expected output (defaults from the Arduino_Modulino lib at time of writing):
 *   [scan] 0x29   (Distance ToF, if attached)
 *   [scan] 0x44   (Thermo, if attached)
 *   [scan] 0x6A   (Movement / LSM6DSOX)
 *   [scan] 0x6C   (Pixels)
 *   [scan] 0x77   (Buzzer)
 *
 * If your hardware reports different addresses, note them and patch
 * Arduino_Modulino if needed (rare). For raw I2C drivers in
 * seismoguard_uno_q.ino (v0.1.0), use the addresses you see here.
 *
 * Copyright (c) 2026 SeismoGuard CDT2026 team. MIT.
 */

#include <Wire.h>

void setup() {
  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && millis() - t0 < 2000) delay(10);

  Wire.begin();
  Wire.setClock(400000);
  Serial.println("[scan] I2C bus scan @ 400 kHz");
  Serial.println("[scan] addr  decimal  name (guess)");
}

const char* guessName(uint8_t a) {
  switch (a) {
    case 0x29: return "ToF / Distance";
    case 0x44: return "Thermo (HS3001)";
    case 0x6A: case 0x6B: return "Movement (LSM6DSOX)";
    case 0x6C: case 0x6D: return "Pixels";
    case 0x76: case 0x77: return "Buzzer";
    default:   return "?";
  }
}

void loop() {
  int found = 0;
  Serial.println();
  Serial.println("--- scan begin ---");
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();
    if (err == 0) {
      char buf[60];
      snprintf(buf, sizeof(buf), "  0x%02X  (%3u)  %s",
               (unsigned)addr, (unsigned)addr, guessName(addr));
      Serial.println(buf);
      found++;
    }
  }
  if (found == 0) {
    Serial.println("  no devices — check Qwiic cable + power");
  } else {
    Serial.print("  total: ");
    Serial.println(found);
  }
  Serial.println("--- scan end ---  next pass in 3 s");
  delay(3000);
}
