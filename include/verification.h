#pragma once
#include "config.h"

// Bắt đầu một phiên xác minh khi người dùng bấm nút TAKE mở ngăn
void verify_start(const MedicationCompartment* comp, unsigned long currentMillis);

// Ghi nhận khi người dùng lấy ra 1 viên (nhấn nút REMOVE_UNIT)
void verify_onUnitRemoved();

// Kiểm tra xem đã hết thời gian chờ (Timeout 60s) hay chưa
bool verify_isTimeout(unsigned long currentMillis);

// Đánh giá kết quả xác minh ở thời điểm hiện tại
VerifyResult verify_evaluate(unsigned long currentMillis);

// Lấy số viên hiện tại đã lấy ra
uint8_t verify_getDetectedUnits();

// Lấy số viên chuẩn cần lấy
uint8_t verify_getExpectedUnits();

// Đóng gói đối tượng VerificationEvent hoàn chỉnh để chuẩn bị gửi sang Firebase
void verify_buildEvent(unsigned long currentTimestamp, VerificationEvent &outEvent);
