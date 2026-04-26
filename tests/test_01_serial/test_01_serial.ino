/**
 * test_01_serial.ino  —  Phase 3 Smoke Test #1
 * ───────────────────────────────────────────────
 * PASS criteria: Serial Monitor shows "Hello #N" every second at 115200 baud.
 *
 * Board setting required:
 *   USB CDC On Boot = Enabled   (otherwise Serial won't work on ESP32-S3 USB)
 *
 * This confirms:
 *   ✓ USB cable is data-capable (not charge-only)
 *   ✓ ESP32-S3 board package installed correctly
 *   ✓ Board settings are correct
 *   ✓ USB CDC On Boot is Enabled
 */

unsigned long n = 0;

void setup() {
  Serial.begin(115200);
  delay(1500);  // wait for USB CDC to connect
  Serial.println("\n[test_01] Serial OK — ESP32-S3 is alive!");
  Serial.println("Chip: " + String(ESP.getChipModel()));
  Serial.printf("Flash: %u MB  |  PSRAM: %u KB\n",
                ESP.getFlashChipSize() / (1024 * 1024),
                ESP.getPsramSize() / 1024);
}

void loop() {
  n++;
  Serial.printf("[%4lu] Hello from ESP32-S3!  Free heap: %u bytes\n",
                n, ESP.getFreeHeap());
  delay(1000);
}
