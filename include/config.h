#pragma once
#include <Arduino.h>

// ==========================================
// 1. DANH SÁCH TRẠNG THÁI HỆ THỐNG (FSM)
// ==========================================
enum SystemState {
    STATE_IDLE,                 // Chờ bình thường, hiển thị đồng hồ + nhiệt ẩm
    STATE_REMINDER,             // Đang báo động đến giờ uống thuốc
    STATE_SNOOZED,              // Tạm hoãn thông báo (hẹn 5 phút)
    STATE_COMPARTMENT_OPEN,     // Nắp ngăn đã mở (Servo 90 deg), chờ lấy thuốc
    STATE_VERIFYING,            // Đang đối chiếu số lượng lấy ra
    STATE_VERIFIED,             // Lấy đúng số lượng, thành công
    STATE_ERROR,                // Sai số lượng (thiếu/thừa) hoặc timeout
    STATE_CLOSED                // Đã đóng nắp (Servo 0 deg), hoàn tất chu trình
};

// ==========================================
// 2. KẾT QUẢ XÁC MINH SỐ LƯỢNG
// ==========================================
enum VerifyResult {
    VERIFY_NONE,
    VERIFY_MATCH,               // Đúng số lượng yêu cầu
    VERIFY_LESS,                // Thiếu viên
    VERIFY_MORE,                // Lấy dư viên
    VERIFY_TIMEOUT              // Hết thời gian chờ mà chưa lấy
};

// ==========================================
// 3. SỰ KIỆN NÚT BẤM (BUTTON EVENTS)
// ==========================================
enum ButtonEvent {
    BTN_NONE,
    BTN_MENU_PRESSED,           // Nút MENU (GPIO 26) - Reset lỗi / vào menu
    BTN_UP_PRESSED,             // Nút UP (GPIO 27)
    BTN_DOWN_PRESSED,           // Nút DOWN (GPIO 14)
    BTN_TAKE_PRESSED,           // Nút TAKE (GPIO 12) - Người dùng bấm uống
    BTN_SNOOZE_PRESSED,         // Nút SNOOZE (GPIO 33) - Hoãn báo thức
    BTN_LOAD_PRESSED,           // Nút LOAD (GPIO 32) - Nạp thêm thuốc
    BTN_REMOVE_PRESSED          // Nút REMOVE (GPIO 35) - Lấy ra 1 viên thuốc
};

// ==========================================
// 4. HẰNG SỐ THỜI GIAN & THIẾT ĐẶT CỐT LÕI
// ==========================================
const unsigned long SNOOZE_DURATION_MS = 5 * 60 * 1000UL;  // 5 phút hoãn chuông
const unsigned long VERIFY_TIMEOUT_MS  = 60 * 1000UL;       // 60 giây chờ lấy thuốc
const unsigned long AUTO_CLOSE_DELAY_MS = 8 * 1000UL;      // 8 giây tự đóng nắp sau khi lấy đủ (cho người dùng kịp quan sát & test quá liều)
const unsigned long DEBOUNCE_DELAY_MS  = 50UL;             // Lọc rung phím bấm

// ==========================================
// 5. CẤU TRÚC DỮ LIỆU (STRUCTS)
// ==========================================
// Cấu hình một ngăn thuốc
struct MedicationCompartment {
    char compartmentId[4];      // "A", "B", "C"
    char medicineCode[16];      // "MED-001"
    char displayName[32];       // "Paracetamol 500mg"
    uint8_t unitsPerDose;       // Liều uống chuẩn (ví dụ: 2 viên)
    uint8_t scheduleHour;       // Giờ uống (0 - 23)
    uint8_t scheduleMinute;     // Phút uống (0 - 59)
    uint8_t currentStock;       // Số viên còn trong ngăn
    bool isLoaded;              // Trạng thái đã nạp thuốc hay chưa
};

// Bản ghi sự kiện xác minh (Log Event đẩy Firebase)
struct VerificationEvent {
    char eventId[48];           // Ví dụ: "EVT-20261011-080000-A"
    char compartmentId[4];      // Ngăn mục tiêu
    char medicineCode[16];      // Mã thuốc
    uint8_t expectedUnits;      // Liều dự kiến
    uint8_t detectedUnits;      // Số lượng cảm biến/mô phỏng đo được
    bool compartmentMatch;      // Đúng ngăn hay không
    bool quantityMatch;         // Đúng số lượng hay không
    bool userConfirmed;         // Người dùng có bấm nút TAKE không
    char status[32];            // "VERIFIED_BY_SIMULATION", "MISMATCH_LESS", v.v.
    unsigned long timestamp;    // Unix timestamp
    bool synced;                // Trạng thái đã đẩy lên Firebase chưa
};
