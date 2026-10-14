#pragma once
#include "config.h"

// =======================================================
// HỢP ĐỒNG GIAO DIỆN PHẦN CỨNG (TV2 cung cấp, TV1 & TV3 sử dụng)
// =======================================================
void hw_initAll();
ButtonEvent hw_getButtonEvent();                               // Đọc phím nhấn đã chống rung 50ms
void hw_setServoLock(bool open);                               // true: Mở 90°, false: Đóng 0°
void hw_setAlarmReminder(bool active);                         // Còi + LED Xanh nhắc lịch (non-blocking)
void hw_setAlarmError(bool active);                            // Còi + LED Đỏ cảnh báo lỗi (non-blocking)
void hw_displayIdle(int h, int m, float t, float hmd);         // Hiển thị màn hình chờ + cảnh báo TC-10
void hw_displayReminder(const char* comp, const char* medName, int dose);
void hw_displayVerifying(int detected, int expected);          // Màn hình đếm số viên
void hw_displayResult(bool success, const char* msg);          // Màn hình kết quả
void hw_displayCompartmentInfo(const char* compId, const char* name, int hour, int min, int stock); // Xem ngăn (UP/DOWN)
void hw_displayLoadResult(const char* compId, int added, int newStock); // Thông báo nạp thuốc (LOAD)
void hw_getEnvData(float &outTemp, float &outHumid);           // Đọc DHT22 non-blocking
bool hw_getRTCTime(int &h, int &m, int &s);                    // Đọc thời gian thực tế từ RTC DS3231
void hw_update();                                              // Cập nhật nhịp LED/Còi và cảm biến
void hw_runSelfTest();                                         // Tự kiểm tra toàn diện phần cứng (Self-Test)
