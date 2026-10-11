#include "hardware_interface.h"
#include <Arduino.h>
#include <ESP32Servo.h>

// Định nghĩa chân GPIO theo tài liệu kỹ thuật
#define PIN_SERVO        13
#define PIN_LED_GREEN     2
#define PIN_LED_RED      15
#define PIN_BUZZER       25

#define PIN_BTN_TAKE     12
#define PIN_BTN_SNOOZE   33
#define PIN_BTN_REMOVE   35
#define PIN_BTN_MENU     26

// Đối tượng điều khiển Servo
static Servo lidServo;

// Biến lưu trạng thái trước đó của các nút để bắt sườn xuống (Edge Detection)
static int lastTakeState   = HIGH;
static int lastSnoozeState = HIGH;
static int lastRemoveState = HIGH;
static int lastMenuState   = HIGH;

void hw_initAll() {
    // 1. Khởi tạo các chân Output
    pinMode(PIN_LED_GREEN, OUTPUT);
    digitalWrite(PIN_LED_GREEN, LOW);

    // Chân GPIO 15 là chân Strapping pin của ESP32, cần pinMode OUTPUT và kéo LOW ngay để tắt đèn đỏ lúc khởi động
    pinMode(PIN_LED_RED, OUTPUT);
    digitalWrite(PIN_LED_RED, LOW);

    pinMode(PIN_BUZZER, OUTPUT);
    digitalWrite(PIN_BUZZER, LOW);

    // 2. Khởi tạo Servo SG90
    lidServo.attach(PIN_SERVO);
    lidServo.write(0); // Khóa nắp ban đầu ở góc 0°

    // 3. Khởi tạo các nút bấm (INPUT_PULLUP)
    pinMode(PIN_BTN_TAKE, INPUT_PULLUP);
    pinMode(PIN_BTN_SNOOZE, INPUT_PULLUP);
    pinMode(PIN_BTN_REMOVE, INPUT_PULLUP);
    pinMode(PIN_BTN_MENU, INPUT_PULLUP);

    Serial.println("[HARDWARE] Đã khởi tạo toàn bộ chân GPIO, LED, Còi và Servo SG90 thành công.");
}

void hw_setServoLock(bool open) {
    if (open) {
        lidServo.write(90); // Mở nắp 90°
        Serial.println("  \033[1;35m[PHẦN CỨNG]\033[0m Servo SG90 quay ──► MỞ 90° (Nắp mở)");
    } else {
        lidServo.write(0);  // Đóng nắp 0°
        Serial.println("  \033[1;35m[PHẦN CỨNG]\033[0m Servo SG90 quay ──► ĐÓNG 0° (Khóa nắp)");
    }
}

void hw_setAlarmReminder(bool active) {
    if (active) {
        digitalWrite(PIN_LED_GREEN, HIGH); // Sáng LED Xanh
        digitalWrite(PIN_BUZZER, HIGH);    // Bật còi
        Serial.println("  \033[1;35m[PHẦN CỨNG]\033[0m LED Xanh (D2) SÁNG | Còi bíp nhắc lịch");
    } else {
        digitalWrite(PIN_LED_GREEN, LOW);  // Tắt LED Xanh
        digitalWrite(PIN_BUZZER, LOW);     // Tắt còi
        Serial.println("  \033[1;35m[PHẦN CỨNG]\033[0m LED Xanh (D2) TẮT  | Còi nhắc TẮT");
    }
}

void hw_setAlarmError(bool active) {
    if (active) {
        digitalWrite(PIN_LED_RED, HIGH);   // Sáng LED Đỏ cảnh báo lỗi
        digitalWrite(PIN_BUZZER, HIGH);    // Còi hú
        Serial.println("  \033[1;35m[PHẦN CỨNG]\033[0m LED Đỏ (D15) SÁNG CẢNH BÁO | Còi báo động BẬT");
    } else {
        digitalWrite(PIN_LED_RED, LOW);    // Tắt LED Đỏ
        digitalWrite(PIN_BUZZER, LOW);
        Serial.println("  \033[1;35m[PHẦN CỨNG]\033[0m LED Đỏ (D15) TẮT | Còi báo động TẮT");
    }
}

ButtonEvent hw_getButtonEvent() {
    // Đọc trạng thái các nút bấm trên giao diện mạch Wokwi
    int curTake   = digitalRead(PIN_BTN_TAKE);
    int curSnooze = digitalRead(PIN_BTN_SNOOZE);
    int curRemove = digitalRead(PIN_BTN_REMOVE);
    int curMenu   = digitalRead(PIN_BTN_MENU);

    ButtonEvent ev = BTN_NONE;

    // Bắt sườn xuống: Lúc nhấn từ HIGH -> LOW
    if (lastTakeState == HIGH && curTake == LOW) {
        ev = BTN_TAKE_PRESSED;
    } else if (lastSnoozeState == HIGH && curSnooze == LOW) {
        ev = BTN_SNOOZE_PRESSED;
    } else if (lastRemoveState == HIGH && curRemove == LOW) {
        ev = BTN_REMOVE_PRESSED;
    } else if (lastMenuState == HIGH && curMenu == LOW) {
        ev = BTN_MENU_PRESSED;
    }

    lastTakeState   = curTake;
    lastSnoozeState = curSnooze;
    lastRemoveState = curRemove;
    lastMenuState   = curMenu;

    return ev;
}

void hw_displayIdle(int h, int m, float t, float hmd) {}

void hw_displayReminder(const char* comp, const char* medName, int dose) {
    Serial.printf("  \033[1;36m[MÀN HÌNH LCD]\033[0m Dòng 1: [NGĂN %s] %s\r\n", comp, medName);
    Serial.printf("  \033[1;36m[MÀN HÌNH LCD]\033[0m Dòng 2: LIỀU DÙNG: %d VIÊN\r\n", dose);
}

void hw_displayVerifying(int detected, int expected) {
    Serial.printf("  \033[1;36m[MÀN HÌNH LCD]\033[0m Dòng 1: ĐANG LẤY THUỐC...\r\n");
    Serial.printf("  \033[1;36m[MÀN HÌNH LCD]\033[0m Dòng 2: TIẾN ĐỘ: %d/%d VIÊN\r\n", detected, expected);
}

void hw_displayResult(bool success, const char* msg) {
    Serial.printf("  \033[1;36m[MÀN HÌNH LCD]\033[0m Thông báo: %s%s\033[0m\r\n", 
                  success ? "\033[1;32m" : "\033[1;31m", msg);
}

void hw_getEnvData(float &outTemp, float &outHumid) {
    outTemp = 28.0;
    outHumid = 65.0;
}
