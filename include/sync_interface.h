#pragma once
#include "config.h"

// =======================================================
// HỢP ĐỒNG GIAO DIỆN CLOUD SYNC (TV3 cung cấp, TV1 sử dụng)
// =======================================================
void cloud_init();
void cloud_loop();                                             // Duy trì kết nối, xử lý hàng đợi
bool cloud_isOnline();                                         // Kiểm tra kết nối Wi-Fi & Firebase
void cloud_pushEvent(const VerificationEvent &ev);             // Đẩy log sự kiện lấy thuốc
void cloud_updateTelemetry(float t, float h, SystemState st);  // Cập nhật trạng thái máy
bool cloud_fetchCompartmentConfig(MedicationCompartment* outList, int maxCount);
bool cloud_hasScheduleConfig();                                // Cấu hình lịch hợp lệ đã được tải hoặc phục hồi từ NVS
// Ghi nhận tồn kho mới trong NVS và xếp lịch đồng bộ Firebase khi có mạng.
void cloud_stockChanged(const char* compartmentId, uint8_t currentStock);
