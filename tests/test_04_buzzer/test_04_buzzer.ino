/**
 * test_04_buzzer.ino  —  Phase 3 Smoke Test #4
 * ───────────────────────────────────────────────
 * PASS criteria: Buzzer plays ascending tones 500 Hz → 2000 Hz then silence.
 *
 * Uses ESP32 Arduino Core v3.x LEDC API:
 *   ledcAttach(pin, freq, resolution)   — new API, replaces old ledcSetup+ledcAttachPin
 *   ledcWriteTone(pin, freq)            — sets PWM tone
 *   ledcWrite(pin, 0)                   — silences (duty = 0)
 *
 * Passive buzzer wiring:
 *   + pin → GPIO4
 *   - pin → GND
 *   (no polarity on passive buzzer — either way works)
 *
 * If no sound: confirm it is a PASSIVE buzzer (not active).
 *   Active buzzer: just HIGH/LOW, fixed tone.
 *   Passive buzzer: needs PWM, variable tone. ← we want this one.
 */

#define PIN_BUZZER  4
#define LEDC_FREQ   2000     // initial attach frequency (will be overridden)
#define LEDC_RES    8        // 8-bit resolution (0-255 duty)

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("[test_04] Buzzer test (Core v3 LEDC API)");

  // Core v3: ledcAttach replaces ledcSetup + ledcAttachPin
  ledcAttach(PIN_BUZZER, LEDC_FREQ, LEDC_RES);
  Serial.println("LEDC attached to GPIO4");

  // Play scale
  uint16_t tones[] = {500, 700, 1000, 1200, 1500, 1760, 2000};
  for (int i = 0; i < 7; i++) {
    Serial.printf("  Tone %u Hz\n", tones[i]);
    ledcWriteTone(PIN_BUZZER, tones[i]);
    delay(300);
  }

  // Alarm beep pattern (same as firmware Tier-1)
  Serial.println("  Alarm beep pattern:");
  for (int rep = 0; rep < 6; rep++) {
    ledcWriteTone(PIN_BUZZER, 1000);
    delay(75);
    ledcWrite(PIN_BUZZER, 0);
    delay(75);
  }

  ledcWrite(PIN_BUZZER, 0);   // silence
  Serial.println("[test_04] Done — if you heard tones, buzzer is working.");
}

void loop() {
  // Quick beep every 5 s to confirm it's still alive
  delay(5000);
  ledcWriteTone(PIN_BUZZER, 800);
  delay(50);
  ledcWrite(PIN_BUZZER, 0);
  Serial.println("Heartbeat beep");
}
