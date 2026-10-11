#pragma once
#include "config.h"

// =======================================================
// HỢP ĐỒNG GIAO DIỆN PHẦN CỨNG (TV2 cung cấp, TV1 sử dụng)
// =======================================================
void hw_initAll();
ButtonEvent hw_getButtonEvent();                               // Đọc phím nhấn đã chống rung
void hw_setServoLock(bool open);                               // true: Mở 90°, false: Đóng 0°
void hw_setAlarmReminder(bool active);                         // Còi + LED Xanh nhắc lịch
void hw_setAlarmError(bool active);                            // Còi + LED Đỏ cảnh báo lỗi
void hw_displayIdle(int h, int m, float t, float hmd);         // Hiển thị màn hình chờ
void hw_displayReminder(const char* comp, const char* medName, int dose);
void hw_displayVerifying(int detected, int expected);          // Màn hình đếm số viên
void hw_displayResult(bool success, const char* msg);          // Màn hình kết quả
void hw_getEnvData(float &outTemp, float &outHumid);           // Đọc DHT22
