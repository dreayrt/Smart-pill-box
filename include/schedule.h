#pragma once
#include "config.h"

// Số lượng ngăn thuốc tối đa trong hệ thống (A, B, C)
const uint8_t NUM_COMPARTMENTS = 3;

// Khởi tạo danh sách các ngăn thuốc với cấu hình mặc định
void schedule_init();

// Lấy danh sách con trỏ các ngăn thuốc
MedicationCompartment* schedule_getCompartments();

// Lấy thông tin một ngăn theo ID ("A", "B", "C")
MedicationCompartment* schedule_getCompartmentById(const char* id);

// Cập nhật cấu hình một ngăn (dùng khi TV3 đồng bộ cấu hình từ Firebase về)
bool schedule_updateCompartment(const MedicationCompartment &comp);

// Kiểm tra xem thời điểm hiện tại (giờ, phút) có ngăn nào đến lịch uống không
// Trả về con trỏ tới ngăn cần uống, hoặc NULL nếu không có ngăn nào
MedicationCompartment* schedule_checkDue(uint8_t currentHour, uint8_t currentMinute);

// Kích hoạt chế độ hoãn báo thức (SNOOZE) cho ngăn hiện tại
void schedule_triggerSnooze(MedicationCompartment* comp, unsigned long currentMillis);

// Kiểm tra xem thời gian hoãn (Snooze) đã hết hạn chưa
bool schedule_isSnoozeExpired(unsigned long currentMillis);

// Lấy ngăn thuốc đang trong chế độ hoãn
MedicationCompartment* schedule_getSnoozedCompartment();

// Xóa trạng thái hoãn sau khi đã kích hoạt lại
void schedule_clearSnooze();

// Giải phóng khóa chống lặp để cho phép test lặp lại nhiều lần
void schedule_resetTriggerLock();
