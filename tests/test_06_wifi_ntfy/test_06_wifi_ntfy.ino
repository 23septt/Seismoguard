/**
 * test_06_wifi_ntfy.ino  —  Phase 3 Smoke Test #6
 * ──────────────────────────────────────────────────
 * PASS criteria: Phone receives an ntfy notification "SeismoGuard Test OK".
 *
 * Setup (one-time, takes 1 minute):
 *   1. Install "ntfy" app on phone (Play Store / App Store → search "ntfy").
 *   2. Open app → tap "+" → "Subscribe to topic".
 *   3. Enter the NTFY_TOPIC string below (must match exactly).
 *   4. Fill in your WiFi credentials below.
 *   5. Upload and open Serial Monitor at 115200 baud.
 *
 * SECURITY: ntfy.sh topics are PUBLIC.
 *   Use a long random string, e.g. "seismoguard_k7x2m9qw3p"
 *   Anyone who knows your topic can read (and send) notifications.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>

// ── Credentials live in config.h (gitignored) ────────────────────────────────
//   Copy config.h.template → config.h and edit before flashing. config.h must
//   define: WIFI_SSID, WIFI_PASS, NTFY_TOPIC
#if __has_include("config.h")
  #include "config.h"
#else
  #error "Missing config.h — copy config.h.template to config.h and fill in credentials."
#endif
// ─────────────────────────────────────────────────────────────────────────────

#define NTFY_HOST   "ntfy.sh"
#define NTFY_PORT   443

bool sendNtfy(const char* title, const char* body,
              const char* priority = "default",
              const char* tags     = "earthquake") {
  // SECURITY WARNING: setInsecure() skips TLS cert verification → MITM possible
  //   on hostile networks. Test sketch only; production firmware should pin a
  //   root CA via setCACert(). See seismoguard_s3.ino for risk discussion.
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(10);

  if (!client.connect(NTFY_HOST, NTFY_PORT)) {
    Serial.println("  [ntfy] Connection failed");
    return false;
  }

  String bodyStr(body);
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
    NTFY_TOPIC, NTFY_HOST, title, priority, tags,
    (unsigned)bodyStr.length());

  client.write((const uint8_t*)hdr, hdrLen);
  client.write((const uint8_t*)bodyStr.c_str(), bodyStr.length());

  // Read HTTP status line
  unsigned long t0 = millis();
  while (client.connected() && millis() - t0 < 5000) {
    if (client.available()) {
      String line = client.readStringUntil('\n');
      if (line.startsWith("HTTP/")) {
        Serial.printf("  [ntfy] %s\n", line.c_str());
        client.stop();
        return line.indexOf("200") > 0;
      }
    }
  }
  client.stop();
  Serial.println("  [ntfy] No HTTP response");
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("\n[test_06] WiFi + ntfy test");

  // Connect WiFi
  Serial.printf("Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500); Serial.print('.'); tries++;
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("FAILED — check SSID/password.");
    return;
  }
  Serial.printf("WiFi OK  IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());

  // Send test notification
  Serial.printf("Sending ntfy to topic '%s'...\n", NTFY_TOPIC);
  bool ok = sendNtfy(
    "SeismoGuard Test OK",
    "ESP32-S3 firmware smoke test passed.\nYou should receive this on your phone.",
    "low", "white_check_mark"
  );

  if (ok) {
    Serial.println("[test_06] PASS — notification sent! Check your phone.");
  } else {
    Serial.println("[test_06] FAIL — notification not delivered.");
    Serial.println("  Check: NTFY_TOPIC subscribed in ntfy app, internet OK.");
  }
}

void loop() {
  // Resend every 30 s so you can confirm repeatedly
  delay(30000);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Resending test notification...");
    sendNtfy("SeismoGuard Heartbeat", "Still running.", "min", "bell");
  }
}
