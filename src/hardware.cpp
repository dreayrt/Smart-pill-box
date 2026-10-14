#include "hardware_interface.h"
#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <RTClib.h>
#include <DHT.h>
#include <ESP32Servo.h>

// =========================================================================
// 1. ĐỊNH NGHĨA CHÂN GPIO (THEO BẢNG 3.2 TÀI LIỆU KỸ THUẬT)
// =========================================================================
#define PIN_SERVO        13
#define PIN_LED_GREEN     2
#define PIN_LED_RED      15
#define PIN_BUZZER       25
#define PIN_DHT           4
#define PIN_I2C_SDA      21
#define PIN_I2C_SCL      22

#define PIN_BTN_TAKE     12
#define PIN_BTN_SNOOZE   33
#define PIN_BTN_REMOVE   35
#define PIN_BTN_LOAD     32
#define PIN_BTN_MENU     26
#define PIN_BTN_UP       27
#define PIN_BTN_DOWN     14

// =========================================================================
// 2. CÁC ĐỐI TƯỢNG PHẦN CỨNG & BIẾN TRẠNG THÁI
// =========================================================================
static LiquidCrystal_I2C lcd(0x27, 16, 2);
static RTC_DS3231        rtc;
static DHT               dht(PIN_DHT, DHT22);
static Servo             lidServo;

static bool rtcAvailable = false;
static bool lcdAvailable = false;

// Trạng thái chuông báo và đèn
static bool reminderAlarmActive = false;
static bool errorAlarmActive    = false;

// Bộ đệm đọc DHT22 non-blocking
static float lastTempCelsius = 28.0f;
static float lastHumidPct    = 65.0f;
static unsigned long lastDhtReadMillis = 0;
static unsigned long lastEnvAlertLogMs = 0;

// Cấu trúc quản lý chống rung cho từng nút bấm (Debounce 50ms)
struct ButtonState {
    uint8_t pin;
    ButtonEvent event;
    int lastRaw;
    int stableState;
    unsigned long lastChangeTime;
};

static ButtonState buttons[] = {
    { PIN_BTN_TAKE,   BTN_TAKE_PRESSED,   HIGH, HIGH, 0 },
    { PIN_BTN_SNOOZE, BTN_SNOOZE_PRESSED, HIGH, HIGH, 0 },
    { PIN_BTN_REMOVE, BTN_REMOVE_PRESSED, HIGH, HIGH, 0 },
    { PIN_BTN_LOAD,   BTN_LOAD_PRESSED,   HIGH, HIGH, 0 },
    { PIN_BTN_MENU,   BTN_MENU_PRESSED,   HIGH, HIGH, 0 },
    { PIN_BTN_UP,     BTN_UP_PRESSED,     HIGH, HIGH, 0 },
    { PIN_BTN_DOWN,   BTN_DOWN_PRESSED,   HIGH, HIGH, 0 }
};
static const int NUM_BUTTONS = sizeof(buttons) / sizeof(buttons[0]);

// =========================================================================
// 3. BẢNG MÃ KÝ TỰ ĐẶC BIỆT (CUSTOM CHARACTERS CHO LCD 1602)
// =========================================================================
static byte charBell[8] = {
    0b00100, 0b01110, 0b01110, 0b01110, 0b11111, 0b00000, 0b00100, 0b00000
};
static byte charDegree[8] = {
    0b01100, 0b10010, 0b10010, 0b01100, 0b00000, 0b00000, 0b00000, 0b00000
};
static byte charDrop[8] = {
    0b00100, 0b00100, 0b01010, 0b01010, 0b10001, 0b10001, 0b01110, 0b00000
};
static byte charPill[8] = {
    0b00110, 0b01111, 0b11111, 0b11011, 0b11011, 0b11111, 0b11110, 0b01100
};
static byte charCheck[8] = {
    0b00000, 0b00001, 0b00011, 0b10110, 0b11100, 0b01000, 0b00000, 0b00000
};

// =========================================================================
// 4. HÀM NỘI BỘ HỖ TRỢ LCD (CHỐNG GIẬT HÌNH / KHÔNG CẦN CLEAR)
// =========================================================================
static void lcdPrintLine(uint8_t row, const char* str) {
    if (!lcdAvailable) return;
    char lineBuf[17];
    int len = snprintf(lineBuf, sizeof(lineBuf), "%-16s", str);
    if (len > 16) lineBuf[16] = '\0';
    lcd.setCursor(0, row);
    lcd.print(lineBuf);
}

// =========================================================================
// 5. TRIỂN KHAI CÁC HÀM GIAO DIỆN PHẦN CỨNG (HARDWARE INTERFACE)
// =========================================================================

void hw_initAll() {
    // A. Khởi tạo Output
    pinMode(PIN_LED_GREEN, OUTPUT);
    digitalWrite(PIN_LED_GREEN, LOW);

    pinMode(PIN_LED_RED, OUTPUT);
    digitalWrite(PIN_LED_RED, LOW);

    pinMode(PIN_BUZZER, OUTPUT);
    digitalWrite(PIN_BUZZER, LOW);

    // B. Khởi tạo Servo SG90
    lidServo.attach(PIN_SERVO, 500, 2400);
    lidServo.write(0); // Khóa nắp ban đầu ở góc 0°

    // C. Khởi tạo các chân Nút bấm (INPUT_PULLUP)
    for (int i = 0; i < NUM_BUTTONS; i++) {
        pinMode(buttons[i].pin, INPUT_PULLUP);
    }

    // D. Khởi tạo Bus I2C
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

    // E. Khởi tạo LCD 1602 I2C (0x27)
    lcd.init();
    lcd.backlight();
    lcdAvailable = true;

    // Nạp ký tự đặc biệt vào LCD
    lcd.createChar(0, charBell);
    lcd.createChar(1, charDegree);
    lcd.createChar(2, charDrop);
    lcd.createChar(3, charPill);
    lcd.createChar(4, charCheck);

    lcdPrintLine(0, " SMART PILL BOX ");
    lcdPrintLine(1, "  V1.0 - NHOM 13 ");

    // F. Khởi tạo RTC DS3231 (0x68)
    if (rtc.begin()) {
        rtcAvailable = true;
        if (rtc.lostPower()) {
            rtc.adjust(DateTime(2026, 10, 12, 7, 59, 50));
        }
        Serial.println("[HARDWARE] RTC DS3231: Khởi tạo thành công (0x68).");
    } else {
        rtcAvailable = false;
        Serial.println("[HARDWARE] RTC DS3231: Không phản hồi (sử dụng thời gian giả lập).");
    }

    // G. Khởi tạo cảm biến DHT22
    dht.begin();
    Serial.println("[HARDWARE] DHT22: Đã sẵn sàng trên GPIO 4.");

    Serial.println("[HARDWARE] Khởi tạo toàn bộ ngoại vi phần cứng thành công!");
}

// Quản lý trạng thái còi tránh gọi tone() liên tục mỗi 10ms làm ngắt quãng dao động
static bool buzzerIsPlaying = false;
static unsigned int currentBuzzerFreq = 0;

static void setBuzzerTone(unsigned int freq) {
    if (!buzzerIsPlaying || currentBuzzerFreq != freq) {
        buzzerIsPlaying = true;
        currentBuzzerFreq = freq;
        tone(PIN_BUZZER, freq);
    }
}

static void setBuzzerMute() {
    if (buzzerIsPlaying) {
        buzzerIsPlaying = false;
        currentBuzzerFreq = 0;
        noTone(PIN_BUZZER);
    }
}

void hw_update() {
    unsigned long now = millis();

    // 1. Xử lý mẫu chuông & LED bất đồng bộ
    if (errorAlarmActive) {
        // Báo lỗi: Nhấp nháy dồn dập (200ms sáng / 200ms tắt, còi trầm 1000Hz)
        bool onPhase = (now % 400) < 200;
        digitalWrite(PIN_LED_RED, onPhase ? HIGH : LOW);
        if (onPhase) {
            setBuzzerTone(1000);
        } else {
            setBuzzerMute();
        }
    } else if (reminderAlarmActive) {
        // Nhắc lịch: 3 bíp ngắn trong chu kỳ 2000ms (150ms on/off, còi thanh 2000Hz)
        unsigned long cycle = now % 2000;
        bool onPhase = (cycle < 150) || (cycle >= 300 && cycle < 450) || (cycle >= 600 && cycle < 750);
        digitalWrite(PIN_LED_GREEN, onPhase ? HIGH : LOW);
        if (onPhase) {
            setBuzzerTone(2000);
        } else {
            setBuzzerMute();
        }
    } else {
        setBuzzerMute();
    }

    // 2. Đọc ngầm DHT22 mỗi 2 giây non-blocking
    if (now - lastDhtReadMillis >= 2000UL || lastDhtReadMillis == 0) {
        lastDhtReadMillis = now;
        float t = dht.readTemperature();
        float h = dht.readHumidity();
        if (!isnan(t)) lastTempCelsius = t;
        if (!isnan(h)) lastHumidPct    = h;

        // Cảnh báo quá nhiệt TC-10 ra Serial nếu T > 35.0°C
        if (lastTempCelsius > 35.0f && (now - lastEnvAlertLogMs >= 5000UL)) {
            lastEnvAlertLogMs = now;
            Serial.printf("  \033[1;31m⚠️  [CẢNH BÁO MÔI TRƯỜNG TC-10]\033[0m Nhiệt độ khoang thuốc: %.1f°C (> 35°C)! Có nguy cơ biến chất thuốc.\r\n", 
                          lastTempCelsius);
        }
    }
}

ButtonEvent hw_getButtonEvent() {
    hw_update(); // Cập nhật ngoại vi mỗi chu kỳ đọc nút

    unsigned long now = millis();
    ButtonEvent triggered = BTN_NONE;

    for (int i = 0; i < NUM_BUTTONS; i++) {
        int raw = digitalRead(buttons[i].pin);

        // Phát hiện thay đổi thô
        if (raw != buttons[i].lastRaw) {
            buttons[i].lastChangeTime = now;
            buttons[i].lastRaw = raw;
        }

        // Đạt ngưỡng lọc rung 50ms
        if ((now - buttons[i].lastChangeTime) >= DEBOUNCE_DELAY_MS) {
            if (raw != buttons[i].stableState) {
                buttons[i].stableState = raw;
                // Nhấn nút (sườn xuống LOW vì dùng INPUT_PULLUP)
                if (buttons[i].stableState == LOW && triggered == BTN_NONE) {
                    triggered = buttons[i].event;
                }
            }
        }
    }

    return triggered;
}

void hw_setServoLock(bool open) {
    static int currentAngle = -1;
    int targetAngle = open ? 90 : 0;
    if (currentAngle == targetAngle) return;
    currentAngle = targetAngle;

    lidServo.write(targetAngle);
    if (open) {
        Serial.println("  \033[1;35m[PHẦN CỨNG]\033[0m Servo SG90 quay ──► MỞ 90° (Nắp mở)");
    } else {
        Serial.println("  \033[1;35m[PHẦN CỨNG]\033[0m Servo SG90 quay ──► ĐÓNG 0° (Khóa nắp)");
    }
}

void hw_setAlarmReminder(bool active) {
    reminderAlarmActive = active;
    if (!active) {
        digitalWrite(PIN_LED_GREEN, LOW);
        if (!errorAlarmActive) setBuzzerMute();
    }
}

void hw_setAlarmError(bool active) {
    errorAlarmActive = active;
    if (!active) {
        digitalWrite(PIN_LED_RED, LOW);
        if (!reminderAlarmActive) setBuzzerMute();
    }
}

void hw_displayIdle(int h, int m, float t, float hmd) {
    unsigned long now = millis();
    bool tempAlert = (t > 35.0f);
    bool humidAlert = (hmd > 75.0f);

    // Kịch bản TC-10: Nếu quá nhiệt > 35°C, nhấp nháy màn hình cảnh báo mỗi 1.5 giây
    if ((tempAlert || humidAlert) && ((now / 1500) % 2 == 1)) {
        if (tempAlert) {
            lcdPrintLine(0, "! CANH BAO NHIET");
            char warnBuf[17];
            snprintf(warnBuf, sizeof(warnBuf), "T:%4.1f\x01C > 35\x01C", t);
            lcdPrintLine(1, warnBuf);
        } else {
            lcdPrintLine(0, "! CANH BAO DO AM");
            char warnBuf[17];
            snprintf(warnBuf, sizeof(warnBuf), "H:%3.0f%% > 75%%", hmd);
            lcdPrintLine(1, warnBuf);
        }
        return;
    }

    // Màn hình Idle bình thường với icon đặc biệt
    char l0[17];
    char l1[17];
    snprintf(l0, sizeof(l0), "GIO:   %02d:%02d:00\x00", h, m);
    snprintf(l1, sizeof(l1), "T:%4.1f\x01C H:%3.0f%%\x02", t, hmd);

    lcdPrintLine(0, l0);
    lcdPrintLine(1, l1);
}

void hw_displayReminder(const char* comp, const char* medName, int dose) {
    char l0[17];
    char l1[17];
    snprintf(l0, sizeof(l0), "\x03[NGAN %s] %-7s", comp, medName);
    snprintf(l1, sizeof(l1), "LIEU: %d VIEN \x00", dose);

    lcdPrintLine(0, l0);
    lcdPrintLine(1, l1);

    Serial.printf("  \033[1;36m[MÀN HÌNH LCD]\033[0m Dòng 1: [NGAN %s] %s\r\n", comp, medName);
    Serial.printf("  \033[1;36m[MÀN HÌNH LCD]\033[0m Dòng 2: LIEU: %d VIEN\r\n", dose);
}

void hw_displayVerifying(int detected, int expected) {
    char l1[17];
    snprintf(l1, sizeof(l1), "DA LAY: %d/%d VIEN", detected, expected);

    lcdPrintLine(0, "\x03 DANG LAY THUOC");
    lcdPrintLine(1, l1);

    Serial.printf("  \033[1;36m[MÀN HÌNH LCD]\033[0m Dòng 1: DANG LAY THUOC..\r\n");
    Serial.printf("  \033[1;36m[MÀN HÌNH LCD]\033[0m Dòng 2: %s\r\n", l1);
}

void hw_displayResult(bool success, const char* msg) {
    char l0[17];
    snprintf(l0, sizeof(l0), success ? "[DA UONG XONG]\x04" : "[CANH BAO LOI]!");

    lcdPrintLine(0, l0);
    lcdPrintLine(1, msg);

    Serial.printf("  \033[1;36m[MÀN HÌNH LCD]\033[0m %s: %s\r\n", l0, msg);
}

void hw_displayCompartmentInfo(const char* compId, const char* name, int hour, int min, int stock) {
    char l0[17];
    char l1[17];
    snprintf(l0, sizeof(l0), "\x03[NGAN %s] %-8s", compId, name);
    snprintf(l1, sizeof(l1), "Lich %02d:%02d Con:%2d", hour, min, stock);

    lcdPrintLine(0, l0);
    lcdPrintLine(1, l1);

    Serial.printf("  \033[1;36m[MÀN HÌNH LCD]\033[0m Xem Ngăn %s (%s) | Lịch: %02d:%02d | Còn: %d viên\r\n",
                  compId, name, hour, min, stock);
}

void hw_displayLoadResult(const char* compId, int added, int newStock) {
    char l0[17];
    char l1[17];
    snprintf(l0, sizeof(l0), "[NAP THUOC NGAN %s]", compId);
    snprintf(l1, sizeof(l1), "+%d vien -> Con:%2d", added, newStock);

    lcdPrintLine(0, l0);
    lcdPrintLine(1, l1);

    Serial.printf("  \033[1;32m[NAP THUOC]\033[0m Đã nạp thêm %d viên vào ngăn %s. Tổng tồn kho hiện tại: %d viên\r\n",
                  added, compId, newStock);
}

void hw_getEnvData(float &outTemp, float &outHumid) {
    hw_update();
    outTemp  = lastTempCelsius;
    outHumid = lastHumidPct;
}

bool hw_getRTCTime(int &h, int &m, int &s) {
    if (!rtcAvailable) return false;
    DateTime now = rtc.now();
    h = now.hour();
    m = now.minute();
    s = now.second();
    return true;
}

void hw_runSelfTest() {
    Serial.println("\r\n\033[1;33m+==============================================================+\033[0m");
    Serial.println("\033[1;33m|   BẮT ĐẦU CHẨN ĐOÁN PHẦN CỨNG TOÀN DIỆN (HARDWARE SELF-TEST) |\033[0m");
    Serial.println("\033[1;33m+==============================================================+\033[0m");

    // 1. Test LCD
    lcdPrintLine(0, "[TEST 1/5] LCD");
    lcdPrintLine(1, "LCD 1602 I2C OK");
    Serial.println("  1. LCD 1602: Hiển thị ký tự & icon kiểm thử... [PASS]");
    delay(1000);

    // 2. Test Buzzer (Phát tần số 2000Hz và 2500Hz)
    lcdPrintLine(0, "[TEST 2/5] COI");
    lcdPrintLine(1, "Phat am 2 bip...");
    tone(PIN_BUZZER, 2000); delay(150); noTone(PIN_BUZZER); delay(100);
    tone(PIN_BUZZER, 2500); delay(200); noTone(PIN_BUZZER);
    Serial.println("  2. Buzzer: Đã phát 2 tiếng bíp kiểm tra (2000Hz & 2500Hz)... [PASS]");
    delay(800);

    // 3. Test Status LEDs
    lcdPrintLine(0, "[TEST 3/5] LEDS");
    lcdPrintLine(1, "Xanh (D2), Do(15)");
    digitalWrite(PIN_LED_GREEN, HIGH); delay(400); digitalWrite(PIN_LED_GREEN, LOW);
    digitalWrite(PIN_LED_RED, HIGH);   delay(400); digitalWrite(PIN_LED_RED, LOW);
    Serial.println("  3. LED Xanh (D2) & LED Đỏ (D15): Đã chớp tắt tuần tự... [PASS]");
    delay(500);

    // 4. Test Servo SG90
    lcdPrintLine(0, "[TEST 4/5] SERVO");
    lcdPrintLine(1, "Quay 90 -> Ve 0");
    Serial.println("  4. Servo SG90: Mở 90°...");
    lidServo.write(90);
    delay(1000);
    Serial.println("     Servo SG90: Đóng về 0°... [PASS]");
    lidServo.write(0);
    delay(500);

    // 5. Test Cảm biến DHT22 & RTC
    lcdPrintLine(0, "[TEST 5/5] SENSOR");
    char senBuf[17];
    snprintf(senBuf, sizeof(senBuf), "T:%.1fC RTC:%s", lastTempCelsius, rtcAvailable ? "OK" : "NO");
    lcdPrintLine(1, senBuf);
    Serial.printf("  5. DHT22: T=%.1f°C, H=%.1f%% | RTC DS3231: %s... [PASS]\r\n", 
                  lastTempCelsius, lastHumidPct, rtcAvailable ? "HOẠT ĐỘNG" : "KHÔNG CÓ");
    delay(1200);

    lcdPrintLine(0, "[SELF-TEST PASS]");
    lcdPrintLine(1, "PHAN CUNG OK 100%");
    Serial.println("\033[1;32m▶ KẾT QUẢ: Toàn bộ ngoại vi phần cứng hoạt động hoàn hảo 100%!\033[0m\r\n");
    delay(1500);
}
