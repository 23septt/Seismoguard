/**
 * seismoguard_uno_q.ino  —  v0.2.0-cdt2026
 * SeismoGuard EEW for Arduino UNO Q (STM32 MCU side) + Modulino chain.
 *
 * v0.2.0 changes vs v0.1.0:
 *   - replace raw Wire I²C with official Arduino_Modulino library
 *   - replace Arduino_LSM6DSOX include (LSM6DSOX is wrapped by ModulinoMovement)
 *   - add self-test mode (T command from Linux injects synthetic event)
 *   - add timestamped per-stage diagnostics (D,<stage>,<ms> lines) for latency probe
 *   - clarify: this sketch targets the STM32U585 MCU side; Linux side runs the
 *     Python detector. Two valid wiring options for the MCU↔Linux channel:
 *       (a) Standalone demo: laptop attached via USB-C, Linux side runs on
 *           laptop, sees UNO Q as /dev/ttyACM0. Sketch uses `Serial`.
 *       (b) On-board: UNO Q Linux side runs the detector. The internal
 *           bridge channel is Serial2 (STM32 LPUART1) <-> /dev/ttyHS1.
 *           Conflicts with Arduino-Router bridge service — stop it first.
 *     Default = (a). Toggle by changing `COMM` below.
 *
 * Hardware:
 *   - Arduino UNO Q (Qualcomm QRB2210 Linux + STM32U585 MCU)
 *   - Modulino Movement (LSM6DSOX) on Qwiic
 *   - Modulino Buzzer  on Qwiic
 *   - Modulino Pixels  (8 RGB LEDs) on Qwiic
 *
 * Serial protocol (115200 baud, 8N1):
 *   Out (MCU → Linux):
 *     S,<ms>,<ax>,<ay>,<az>,<ratio>,<state>\n   — sample line, 100 Hz
 *     E,trigger,<peak_ratio>\n                  — STA/LTA window-open
 *     E,detrigger\n                             — return to standby
 *     E,boot,<fw_version>\n                     — once on boot
 *     D,<stage>,<ms>\n                          — latency probe
 *   In (Linux → MCU):
 *     A,1\n            — fire T1 (short tone, pixels yellow)
 *     A,2,<mw>\n       — fire T2 (siren, pixels red flash)
 *     R\n              — reset alarm
 *     P\n              — ping → MCU replies "E,pong\n"
 *     T\n              — self-test: inject synthetic 5 m/s² impulse
 */

#include <Arduino_Modulino.h>

// ─── Choose comm channel ──────────────────────────────────────────────
// Standalone (laptop USB): use `Serial`.  On-board bridge: use `Serial2`.
#define COMM Serial

// ─── Config ────────────────────────────────────────────────────────────
#define FW_VERSION         "0.2.0-cdt2026"
#define SAMPLE_RATE_HZ     100
#define SAMPLE_INTERVAL_US 10000

#define ALPHA_STA          0.02f
#define ALPHA_LTA          0.000333f
#define ALPHA_DC           0.001f
#define RATIO_TRIGGER      6.0f
#define RATIO_DETRIGGER    1.5f
#define MIN_TRIG_COUNT     3
#define SPIKE_LIMIT        50.0f
#define LTA_FLOOR          1e-9f
#define MIN_TRIG_CF_ABS    2e-4f

#define PRETONE_FREQ_HZ    1500
#define PRETONE_MS         150

#define ALARM_MAX_MS    15000UL
#define LOCKOUT_MAX_MS   5000UL

#define PIX_BRIGHT       25

// ─── Modulino objects ─────────────────────────────────────────────────
ModulinoMovement movement;
ModulinoBuzzer   buzzer;
ModulinoPixels   leds;

// ─── State ─────────────────────────────────────────────────────────────
enum DetState : uint8_t { STANDBY = 0, DETECTING = 1, ALARMING = 2, LOCKOUT = 3 };
DetState state = STANDBY;

float sta = LTA_FLOOR, lta = LTA_FLOOR, ltaQuiet = LTA_FLOOR;
float smoothedZ = 0.0f;
bool  smoothedZInit = false;
int   trigCount = 0;
float peakRatio = 0.0f;
float curRatio  = 0.0f;
uint32_t alarmStartMs = 0, lockoutStartMs = 0;

unsigned long lastSampleUs = 0;
unsigned long sampleCount  = 0;

// Self-test injection: 1 sample, 5 m/s² Z-axis impulse
volatile int selfTestPending = 0;

// ─── Pixels driver ────────────────────────────────────────────────────
static void pixelsFill(ModulinoColor c) {
  for (int i = 0; i < 8; i++) leds.set(i, c, PIX_BRIGHT);
  leds.show();
}

static void pixelsAlarmFlash(unsigned long t) {
  bool on = ((t / 200) & 1);
  if (on) pixelsFill(RED);
  else    { for (int i = 0; i < 8; i++) leds.set(i, ModulinoColor(0,0,0), 0); leds.show(); }
}

// ─── Buzzer driver ────────────────────────────────────────────────────
static inline void buzzerPreTone() { buzzer.tone(PRETONE_FREQ_HZ, PRETONE_MS); }
static inline void buzzerOff()     { buzzer.tone(0, 50); }
static void buzzerSiren() {
  static unsigned long lastToggle = 0;
  static bool hi = false;
  unsigned long now = millis();
  if (now - lastToggle > 250) {
    hi = !hi;
    buzzer.tone(hi ? 2500 : 1500, 250);
    lastToggle = now;
  }
}

// ─── Setup ─────────────────────────────────────────────────────────────
void setup() {
  COMM.begin(115200);
  unsigned long t0 = millis();
  while (!COMM && (millis() - t0) < 2000) delay(10);

  Modulino.begin();
  if (!movement.begin()) {
    COMM.println("E,fatal,movement_init_failed");
    while (1) delay(1000);
  }
  buzzer.begin();
  leds.begin();
  pixelsFill(GREEN);
  buzzerOff();

  // Quick noise-floor seed — 3 s still, average dz² as LTA seed
  COMM.println("E,calib,start");
  float sumSq = 0.0f;
  int n = 0;
  unsigned long calibT0 = millis();
  while (millis() - calibT0 < 3000) {
    movement.update();
    float az_g = movement.getZ();
    if (!smoothedZInit) { smoothedZ = az_g; smoothedZInit = true; }
    else smoothedZ = 0.05f * az_g + 0.95f * smoothedZ;
    float dz = (az_g - smoothedZ) * 9.80665f;
    sumSq += dz * dz;
    n++;
    delay(10);
  }
  float meanCf = (n > 0) ? (sumSq / n) : LTA_FLOOR;
  if (meanCf < LTA_FLOOR) meanCf = LTA_FLOOR;
  sta = lta = ltaQuiet = meanCf;

  COMM.print("E,boot,");        COMM.println(FW_VERSION);
  COMM.print("E,calib,done,lta="); COMM.println(meanCf, 9);

  lastSampleUs = micros();
}

// ─── Sample processing ────────────────────────────────────────────────
void processSample(float ax_g, float ay_g, float az_g) {
  // 1. DC tracker (Z only, frozen during ALARMING/LOCKOUT)
  if (state == STANDBY || state == DETECTING) {
    smoothedZ = ALPHA_DC * az_g + (1.0f - ALPHA_DC) * smoothedZ;
  }
  float dz = (az_g - smoothedZ) * 9.80665f;

  // 2. CF + spike clamp (raw retained for anti-tap gate)
  float ltaRef = (lta > LTA_FLOOR) ? lta : LTA_FLOOR;
  float cf_raw = dz * dz;
  float cf = (cf_raw <= SPIKE_LIMIT * ltaRef) ? cf_raw : SPIKE_LIMIT * ltaRef;

  // 3. STA/LTA
  sta = ALPHA_STA * cf + (1.0f - ALPHA_STA) * sta;
  if (state == STANDBY) {
    lta = ALPHA_LTA * cf + (1.0f - ALPHA_LTA) * lta;
  }
  curRatio = (lta > LTA_FLOOR) ? (sta / lta) : 0.0f;

  // 4. State machine (anti-tap uses RAW cf — divergence from S3 documented)
  unsigned long now = millis();
  switch (state) {
    case STANDBY:
      if (curRatio >= RATIO_TRIGGER && cf_raw >= MIN_TRIG_CF_ABS) {
        if (++trigCount >= MIN_TRIG_COUNT) {
          state = DETECTING;
          peakRatio = curRatio;
          buzzerPreTone();
          pixelsFill(ModulinoColor(255, 170, 0));   // yellow
          COMM.print("E,trigger,"); COMM.println(peakRatio, 2);
          COMM.print("D,trigger,"); COMM.println(now);
        }
      } else {
        trigCount = 0;
      }
      break;
    case DETECTING:
      if (curRatio > peakRatio) peakRatio = curRatio;
      if (curRatio < RATIO_DETRIGGER) {
        state = STANDBY;
        trigCount = 0; peakRatio = 0.0f;
        pixelsFill(GREEN);
        COMM.println("E,detrigger");
      }
      break;
    case ALARMING:
      buzzerSiren();
      pixelsAlarmFlash(now);
      if (now - alarmStartMs > ALARM_MAX_MS) {
        state = LOCKOUT; lockoutStartMs = now;
        buzzerOff();
        COMM.println("E,alarm_timeout");
      }
      break;
    case LOCKOUT:
      if (now - lockoutStartMs > LOCKOUT_MAX_MS) {
        state = STANDBY;
        lta = ltaQuiet; sta = ltaQuiet;
        pixelsFill(GREEN);
        COMM.println("E,reset");
      }
      break;
  }

  // 5. Stream sample (compact CSV, matches polyglot SampleRecord fields)
  COMM.print("S,");  COMM.print(now);
  COMM.print(",");   COMM.print(ax_g * 9.80665f, 4);
  COMM.print(",");   COMM.print(ay_g * 9.80665f, 4);
  COMM.print(",");   COMM.print(az_g * 9.80665f, 4);
  COMM.print(",");   COMM.print(curRatio, 2);
  COMM.print(",");   COMM.println((int)state);
}

// ─── Command parser ───────────────────────────────────────────────────
void handleCommand(const String &line) {
  if (line.length() == 0) return;
  char c = line.charAt(0);
  unsigned long now = millis();
  if (c == 'A') {
    int tier = line.length() > 2 ? line.substring(2, 3).toInt() : 0;
    if (tier == 1) {
      buzzerPreTone();
      pixelsFill(ModulinoColor(255, 170, 0));
      COMM.print("D,cmd_t1,"); COMM.println(now);
    } else if (tier == 2) {
      state = ALARMING;
      alarmStartMs = now;
      COMM.print("D,cmd_t2,"); COMM.println(now);
    }
  } else if (c == 'R') {
    state = STANDBY;
    trigCount = 0; peakRatio = 0.0f;
    buzzerOff();
    pixelsFill(GREEN);
    COMM.println("E,ack,reset");
  } else if (c == 'P') {
    COMM.println("E,pong");
  } else if (c == 'T') {
    selfTestPending = 5;       // inject 5 samples of large dz²
    COMM.println("E,ack,selftest");
  }
}

// ─── Loop ─────────────────────────────────────────────────────────────
void loop() {
  // 1. Drain commands
  static String inBuf;
  while (COMM.available()) {
    char ch = (char)COMM.read();
    if (ch == '\n') { handleCommand(inBuf); inBuf = ""; }
    else if (ch != '\r' && inBuf.length() < 64) inBuf += ch;
  }

  // 2. 100 Hz sample loop
  unsigned long nowUs = micros();
  if (nowUs - lastSampleUs >= SAMPLE_INTERVAL_US) {
    lastSampleUs += SAMPLE_INTERVAL_US;
    movement.update();
    float ax = movement.getX();
    float ay = movement.getY();
    float az = movement.getZ();
    // Self-test: override az with synthetic impulse for N samples
    if (selfTestPending > 0) {
      az += 0.51f;                 // ~5 m/s² added to gravity baseline (in g)
      selfTestPending--;
      if (selfTestPending == 0) {
        COMM.print("D,selftest_end,"); COMM.println(millis());
      }
    }
    processSample(ax, ay, az);
    sampleCount++;
  }
}
