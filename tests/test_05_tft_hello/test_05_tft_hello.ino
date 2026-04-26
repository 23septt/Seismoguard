#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <SPI.h>

// ขาที่คุณต่อไว้
#define PIN_TFT_SCK   12
#define PIN_TFT_MOSI  11
#define PIN_TFT_CS    10
#define PIN_TFT_DC    13
#define PIN_TFT_RST   14
#define PIN_TFT_BL    15

// ใช้ Constructor แบบระบุขา
Adafruit_ST7735 tft = Adafruit_ST7735(PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_MOSI, PIN_TFT_SCK, PIN_TFT_RST);

void setup() {
  Serial.begin(115200);
  
  // เปิด Backlight (ถ้ายังเสียบขา 15 อยู่)
  pinMode(PIN_TFT_BL, OUTPUT);
  digitalWrite(PIN_TFT_BL, HIGH);

  // สำคัญ: สำหรับจอ 1.8" ส่วนใหญ่ใช้ INITR_BLACKTAB หรือ INITR_REDTAB
  // ลอง BLACKTAB ก่อน ถ้าสีเพี้ยนค่อยเปลี่ยนเป็น REDTAB หรือ GREENTAB
  tft.initR(INITR_BLACKTAB); 
  
  tft.setRotation(1); // แนวนอน
  tft.fillScreen(ST77XX_BLACK);
  
  // ทดสอบวาดรูปสี่เหลี่ยมสีแดง
  tft.fillRect(10, 10, 50, 50, ST77XX_RED);
  
  tft.setCursor(10, 70);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.println("SeismoGuard");
  
  Serial.println("TFT Initialized");
}

void loop() {
  // บล๊อกสี่เหลี่ยมกระพริบเช็คสถานะ
  tft.fillRect(140, 10, 10, 10, ST77XX_GREEN);
  delay(500);
  tft.fillRect(140, 10, 10, 10, ST77XX_BLACK);
  delay(500);
}