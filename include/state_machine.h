#pragma once
#include "config.h"
#include "schedule.h"
#include "verification.h"

// Khởi tạo máy trạng thái
void fsm_init();

// Cập nhật chu trình FSM theo thời gian thực (gọi liên tục trong loop)
// btn: Sự kiện phím bấm
// currentHour, currentMinute: Giờ phút hiện tại từ RTC (hoặc giả lập)
// currentMillis: millis() hiện tại
void fsm_update(ButtonEvent btn, uint8_t currentHour, uint8_t currentMinute, unsigned long currentMillis);

// Lấy trạng thái hiện tại của hệ thống
SystemState fsm_getState();

// Lấy tên chuỗi của trạng thái để in log
const char* fsm_getStateName(SystemState state);

// Lấy ngăn thuốc đang trong phiên xử lý (nếu có)
MedicationCompartment* fsm_getActiveCompartment();
