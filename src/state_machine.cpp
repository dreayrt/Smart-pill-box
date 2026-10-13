#include "state_machine.h"
#include "hardware_interface.h"
#include "sync_interface.h"
#include <Arduino.h>

// Định nghĩa mã màu ANSI cho Terminal Wokwi
#define ANSI_RESET   "\033[0m"
#define ANSI_BOLD    "\033[1m"
#define ANSI_RED     "\033[1;31m"
#define ANSI_GREEN   "\033[1;32m"
#define ANSI_YELLOW  "\033[1;33m"
#define ANSI_BLUE    "\033[1;34m"
#define ANSI_MAGENTA "\033[1;35m"
#define ANSI_CYAN    "\033[1;36m"
#define ANSI_WHITE   "\033[1;37m"

// Trạng thái hiện tại
static SystemState currentState = STATE_IDLE;

// Ngăn thuốc đang hoạt động trong phiên
static MedicationCompartment* activeComp = NULL;

// Các mốc đếm thời gian non-blocking
static unsigned long stateTimerMillis = 0;
static unsigned long reminderStartMillis = 0;
const unsigned long REMINDER_TIMEOUT_MS = 10 * 60 * 1000UL; // 10 phút không bấm TAKE coi như Missed

// Hàm in chuyển trạng thái đẹp mắt
static void logTransition(SystemState from, SystemState to, const char* reason) {
    Serial.printf("\r\n" ANSI_BOLD ANSI_CYAN "┌──────────────────────────────────────────────────────────┐\r\n" ANSI_RESET);
    Serial.printf(ANSI_BOLD ANSI_CYAN "│ [FSM STATE] " ANSI_YELLOW "%-14s" ANSI_CYAN " ──► " ANSI_GREEN "%-14s" ANSI_CYAN "       │\r\n" ANSI_RESET, 
                  fsm_getStateName(from), fsm_getStateName(to));
    if (reason) {
        Serial.printf(ANSI_BOLD ANSI_CYAN "│ " ANSI_WHITE "Lý do: %-49s" ANSI_CYAN "│\r\n" ANSI_RESET, reason);
    }
    Serial.printf(ANSI_BOLD ANSI_CYAN "└──────────────────────────────────────────────────────────┘\r\n" ANSI_RESET);
}

// =========================================================================
// MOCK FALLBACK (Hàm dự phòng yếu - Đã định dạng \r\n căn lề chuẩn)
// =========================================================================
__attribute__((weak)) void hw_initAll() {}
__attribute__((weak)) ButtonEvent hw_getButtonEvent() { return BTN_NONE; }

__attribute__((weak)) void hw_setServoLock(bool open) {
    Serial.printf("  " ANSI_MAGENTA "[PHẦN CỨNG]" ANSI_RESET " Servo Khóa Nắp   : %s\r\n", 
                  open ? ANSI_GREEN "MỞ 90°" ANSI_RESET : ANSI_WHITE "ĐÓNG 0°" ANSI_RESET);
}

__attribute__((weak)) void hw_setAlarmReminder(bool active) {
    Serial.printf("  " ANSI_MAGENTA "[PHẦN CỨNG]" ANSI_RESET " Còi & LED Nhắc   : %s\r\n", 
                  active ? ANSI_GREEN "BẬT (Nhấp nháy xanh + Bíp)" ANSI_RESET : ANSI_WHITE "TẮT" ANSI_RESET);
}

__attribute__((weak)) void hw_setAlarmError(bool active) {
    Serial.printf("  " ANSI_MAGENTA "[PHẦN CỨNG]" ANSI_RESET " Còi & LED Báo Lỗi: %s\r\n", 
                  active ? ANSI_RED "BẬT (Nháy đỏ dồn dập + Còi dài)" ANSI_RESET : ANSI_WHITE "TẮT" ANSI_RESET);
}

__attribute__((weak)) void hw_displayIdle(int h, int m, float t, float hmd) {}

__attribute__((weak)) void hw_displayReminder(const char* comp, const char* medName, int dose) {
    Serial.printf("  " ANSI_CYAN "[MÀN HÌNH LCD]" ANSI_RESET " Dòng 1: [NGAN %s] %s\r\n", comp, medName);
    Serial.printf("  " ANSI_CYAN "[MÀN HÌNH LCD]" ANSI_RESET " Dòng 2: LIEU DUNG: %d VIEN\r\n", dose);
}

__attribute__((weak)) void hw_displayVerifying(int detected, int expected) {
    Serial.printf("  " ANSI_CYAN "[MÀN HÌNH LCD]" ANSI_RESET " Dòng 1: DANG LAY THUOC...\r\n");
    Serial.printf("  " ANSI_CYAN "[MÀN HÌNH LCD]" ANSI_RESET " Dòng 2: TIEN DO: %d/%d VIEN\r\n", detected, expected);
}

__attribute__((weak)) void hw_displayResult(bool success, const char* msg) {
    Serial.printf("  " ANSI_CYAN "[MÀN HÌNH LCD]" ANSI_RESET " Thong bao: %s%s" ANSI_RESET "\r\n", 
                  success ? ANSI_GREEN : ANSI_RED, msg);
}

__attribute__((weak)) void hw_getEnvData(float &outTemp, float &outHumid) { outTemp = 28.0; outHumid = 65.0; }

__attribute__((weak)) void cloud_init() {}
__attribute__((weak)) void cloud_loop() {}
__attribute__((weak)) bool cloud_isOnline() { return true; }

__attribute__((weak)) void cloud_pushEvent(const VerificationEvent &ev) {
    Serial.printf("\r\n  " ANSI_BLUE "☁️  [FIREBASE SYNC] Đã đẩy sự kiện lên Cloud:\r\n" ANSI_RESET);
    Serial.printf("      • Event ID  : %s\r\n", ev.eventId);
    Serial.printf("      • Ngăn thuốc: %s (Mã: %s)\r\n", ev.compartmentId, ev.medicineCode);
    Serial.printf("      • Số lượng  : Đã lấy %d/%d viên\r\n", ev.detectedUnits, ev.expectedUnits);
    Serial.printf("      • Trạng thái: %s%s" ANSI_RESET "\r\n\r\n", 
                  ev.quantityMatch ? ANSI_GREEN : ANSI_RED, ev.status);
}

__attribute__((weak)) void cloud_updateTelemetry(float t, float h, SystemState st) {}
__attribute__((weak)) bool cloud_fetchCompartmentConfig(MedicationCompartment* outList, int maxCount) { return false; }

// =========================================================================
// TRIỂN KHAI CỖ MÁY TRẠNG THÁI HỮU HẠN (FSM)
// =========================================================================
void fsm_init() {
    hw_initAll();
    schedule_init();
    currentState = STATE_IDLE;
    activeComp = NULL;
}

void fsm_resetToIdle() {
    schedule_resetTriggerLock();
    currentState = STATE_IDLE;
    activeComp = NULL;
    hw_setAlarmReminder(false);
    hw_setAlarmError(false);
    hw_setServoLock(false);
}

SystemState fsm_getState() {
    return currentState;
}

const char* fsm_getStateName(SystemState state) {
    switch (state) {
        case STATE_IDLE:             return "IDLE";
        case STATE_REMINDER:         return "REMINDER";
        case STATE_SNOOZED:          return "SNOOZED";
        case STATE_COMPARTMENT_OPEN: return "OPEN";
        case STATE_VERIFYING:        return "VERIFYING";
        case STATE_VERIFIED:         return "VERIFIED";
        case STATE_ERROR:            return "ERROR";
        case STATE_CLOSED:           return "CLOSED";
        default:                     return "UNKNOWN";
    }
}

MedicationCompartment* fsm_getActiveCompartment() {
    return activeComp;
}

void fsm_update(ButtonEvent btn, uint8_t currentHour, uint8_t currentMinute, unsigned long currentMillis) {
    switch (currentState) {
        // -------------------------------------------------------------
        // 1. STATE_IDLE: Chờ đến lịch uống thuốc
        // -------------------------------------------------------------
        case STATE_IDLE: {
            MedicationCompartment* dueComp = schedule_checkDue(currentHour, currentMinute);
            if (dueComp != NULL) {
                activeComp = dueComp;
                SystemState prevState = currentState;
                currentState = STATE_REMINDER;
                reminderStartMillis = currentMillis;

                char reasonBuf[64];
                snprintf(reasonBuf, sizeof(reasonBuf), "Khop gio hen Ngan %s (%s)", dueComp->compartmentId, dueComp->displayName);
                logTransition(prevState, currentState, reasonBuf);

                hw_setAlarmReminder(true);
                hw_displayReminder(activeComp->compartmentId, activeComp->displayName, activeComp->unitsPerDose);
            }
            break;
        }

        // -------------------------------------------------------------
        // 2. STATE_REMINDER: Đang chuông báo nhắc nhở
        // -------------------------------------------------------------
        case STATE_REMINDER: {
            // A. Người dùng nhấn nút TAKE (Xác nhận uống)
            if (btn == BTN_TAKE_PRESSED) {
                SystemState prevState = currentState;
                currentState = STATE_COMPARTMENT_OPEN;
                logTransition(prevState, currentState, "Nguoi dung bam nut TAKE -> Mo nap ngan");

                hw_setAlarmReminder(false);
                hw_setServoLock(true); // Mở nắp 90°
                verify_start(activeComp, currentMillis); // Bắt đầu đếm liều
                hw_displayVerifying(0, activeComp->unitsPerDose);
            }
            // B. Người dùng nhấn nút SNOOZE (Tạm hoãn 5 phút)
            else if (btn == BTN_SNOOZE_PRESSED) {
                SystemState prevState = currentState;
                schedule_triggerSnooze(activeComp, currentMillis);
                currentState = STATE_SNOOZED;
                logTransition(prevState, currentState, "Nguoi dung bam SNOOZE -> Hoan bao thuc 5 phut");

                hw_setAlarmReminder(false);
                hw_displayResult(true, "DA HOAN LICH 5 PHUT");
            }
            // C. Quá 10 phút không ai bấm -> Bỏ lỡ cữ thuốc (MISSED)
            else if (currentMillis - reminderStartMillis >= REMINDER_TIMEOUT_MS) {
                SystemState prevState = currentState;
                currentState = STATE_ERROR;
                logTransition(prevState, currentState, "Qua 10 phut khong uong thuoc -> MISSED_DOSE");

                hw_setAlarmReminder(false);
                VerificationEvent missedEv;
                verify_start(activeComp, currentMillis);
                verify_buildEvent(currentMillis / 1000, missedEv);
                strncpy(missedEv.status, "MISSED_DOSE", sizeof(missedEv.status));
                cloud_pushEvent(missedEv);

                hw_setAlarmError(true);
                hw_displayResult(false, "BO LO CU THUOC!");
            }
            break;
        }

        // -------------------------------------------------------------
        // 3. STATE_SNOOZED: Đang trong thời gian hoãn báo thức
        // -------------------------------------------------------------
        case STATE_SNOOZED: {
            if (schedule_isSnoozeExpired(currentMillis)) {
                activeComp = schedule_getSnoozedCompartment();
                schedule_clearSnooze();
                SystemState prevState = currentState;
                currentState = STATE_REMINDER;
                reminderStartMillis = currentMillis;
                logTransition(prevState, currentState, "Het 5 phut hoan -> Kich hoat lai bao dong");

                hw_setAlarmReminder(true);
                if (activeComp) {
                    hw_displayReminder(activeComp->compartmentId, activeComp->displayName, activeComp->unitsPerDose);
                }
            }
            break;
        }

        // -------------------------------------------------------------
        // 4. STATE_COMPARTMENT_OPEN & STATE_VERIFYING: Nắp mở, đối chiếu liều
        // -------------------------------------------------------------
        case STATE_COMPARTMENT_OPEN:
        case STATE_VERIFYING: {
            // Khi người dùng lấy 1 viên ra (Bấm REMOVE_UNIT)
            if (btn == BTN_REMOVE_PRESSED) {
                verify_onUnitRemoved();
                currentState = STATE_VERIFYING;
                Serial.printf("  " ANSI_YELLOW "⚡ [CẢM BIẾN]" ANSI_RESET " Ghi nhận rơi 1 viên ──► Tiến độ hiện tại: " ANSI_BOLD "%d/%d viên\r\n" ANSI_RESET, 
                              verify_getDetectedUnits(), verify_getExpectedUnits());
                hw_displayVerifying(verify_getDetectedUnits(), verify_getExpectedUnits());
            }

            // Đánh giá kết quả xác minh
            VerifyResult res = verify_evaluate(currentMillis);
            if (res == VERIFY_MATCH) {
                // Đủ liều hợp lệ!
                SystemState prevState = currentState;
                currentState = STATE_VERIFIED;
                stateTimerMillis = currentMillis; // Bắt đầu đếm trễ đóng nắp
                logTransition(prevState, currentState, "XAC MINH DUNG SO LIEU (VERIFIED)");

                // Bật LED Xanh sáng báo hiệu lấy đúng liều
                hw_setAlarmReminder(true);
                hw_displayResult(true, "DA LAY DU LIEU ✓");
                Serial.printf("  \033[1;33m⏳ [CHỜ ĐÓNG NẮP %ds]\033[0m Nắp đang mở! Bấm nút REMOVE (D35) hoặc gõ phím 'R' để lấy thêm viên (Test Quá liều).\r\n", 
                              (int)(AUTO_CLOSE_DELAY_MS / 1000));
            } 
            else if (res == VERIFY_MORE) {
                // Uống quá liều!
                SystemState prevState = currentState;
                currentState = STATE_ERROR;
                stateTimerMillis = 0; // Đặt về 0 để STATE_ERROR gửi log lên Cloud
                logTransition(prevState, currentState, "CANH BAO: Uong qua lieu quy dinh!");

                hw_setAlarmError(true);
                hw_displayResult(false, "CANH BAO: THUA LIEU!");
            }
            else if (res == VERIFY_LESS || res == VERIFY_TIMEOUT) {
                // Hết 60s mà thiếu hoặc không lấy!
                SystemState prevState = currentState;
                currentState = STATE_ERROR;
                stateTimerMillis = 0; // Đặt về 0 để STATE_ERROR gửi log lên Cloud
                const char* errMsg = (res == VERIFY_TIMEOUT) ? "Het 60s: Khong lay vien nao" : "Het 60s: Lay thieu lieu";
                logTransition(prevState, currentState, errMsg);

                hw_setAlarmError(true);
                hw_displayResult(false, (res == VERIFY_TIMEOUT) ? "CHUA LAY THUOC!" : "THIEU LIEU!");
            }
            break;
        }

        // -------------------------------------------------------------
        // 5. STATE_VERIFIED: Lấy đúng, tự động đóng nắp sau khi đếm trễ và gửi cloud
        // -------------------------------------------------------------
        case STATE_VERIFIED: {
            // Nếu người bệnh lấy thêm viên thuốc nữa trong khi nắp chưa kịp đóng (Quá liều)
            if (btn == BTN_REMOVE_PRESSED) {
                verify_onUnitRemoved();
                SystemState prevState = currentState;
                currentState = STATE_ERROR;
                stateTimerMillis = 0; // Đặt về 0 để STATE_ERROR gửi log lên Cloud
                logTransition(prevState, currentState, "CANH BAO: Uong qua lieu quy dinh (Lay them vien)!");

                hw_setAlarmReminder(false);
                hw_setAlarmError(true);
                hw_displayResult(false, "CANH BAO: THUA LIEU!");
                break;
            }

            unsigned long elapsed = currentMillis - stateTimerMillis;
            if (elapsed < AUTO_CLOSE_DELAY_MS) {
                // Đếm ngược hiển thị mỗi giây để người dùng theo dõi
                static unsigned long lastCountdownMs = 0;
                if (currentMillis - lastCountdownMs >= 1000UL) {
                    lastCountdownMs = currentMillis;
                    int remainingSec = (int)((AUTO_CLOSE_DELAY_MS - elapsed + 999) / 1000);
                    char lineBuf[17];
                    snprintf(lineBuf, sizeof(lineBuf), "DONG NAP: %ds...", remainingSec);
                    hw_displayResult(true, lineBuf);
                }
            } else {
                // Trừ số lượng thuốc tồn kho trong ngăn
                if (activeComp) {
                    if (activeComp->currentStock >= activeComp->unitsPerDose) {
                        activeComp->currentStock -= activeComp->unitsPerDose;
                    } else {
                        activeComp->currentStock = 0;
                    }
                    Serial.printf("  \033[1;36m[TỒN KHO]\033[0m Ngăn %s hiện còn lại: \033[1m%d viên\033[0m\r\n", 
                                  activeComp->compartmentId, activeComp->currentStock);
                }

                hw_setAlarmReminder(false); // Tắt LED Xanh sau khi đóng nắp
                hw_setServoLock(false);      // Đóng nắp về 0°
                VerificationEvent ev;
                verify_buildEvent(currentMillis / 1000, ev);
                cloud_pushEvent(ev);

                SystemState prevState = currentState;
                currentState = STATE_CLOSED;
                stateTimerMillis = currentMillis;
                logTransition(prevState, currentState, "Tu dong dong nap sau thoi gian cho (Closed)");
            }
            break;
        }

        // -------------------------------------------------------------
        // 6. STATE_ERROR: Báo động lỗi, chờ người dùng nhấn MENU để xác nhận
        // -------------------------------------------------------------
        case STATE_ERROR: {
            // Tự động đóng nắp để bảo quản thuốc nếu nắp đang mở
            hw_setServoLock(false);

            // Gửi bản ghi lỗi lên cloud 1 lần
            if (stateTimerMillis == 0) {
                VerificationEvent errEv;
                verify_buildEvent(currentMillis / 1000, errEv);
                cloud_pushEvent(errEv);
                stateTimerMillis = currentMillis; // Đánh dấu đã gửi
            }

            // Bấm MENU để xóa lỗi thủ công
            if (btn == BTN_MENU_PRESSED) {
                hw_setAlarmError(false);
                SystemState prevState = currentState;
                currentState = STATE_CLOSED;
                stateTimerMillis = currentMillis;
                logTransition(prevState, currentState, "Nguoi dung bam MENU xoa loi -> Dong nap");
            }
            break;
        }

        // -------------------------------------------------------------
        // 7. STATE_CLOSED: Hoàn tất chu trình, trả về IDLE
        // -------------------------------------------------------------
        case STATE_CLOSED: {
            activeComp = NULL;
            stateTimerMillis = 0;
            SystemState prevState = currentState;
            currentState = STATE_IDLE;
            logTransition(prevState, currentState, "Hoan tat chu trinh -> He thong san sang cho lich moi");
            break;
        }
    }
}

void fsm_simulateOverdose() {
    if (activeComp == NULL) {
        MedicationCompartment* dueComp = schedule_checkDue(12, 0);
        if (dueComp != NULL) {
            activeComp = dueComp;
        } else {
            MedicationCompartment* comps = schedule_getCompartments();
            activeComp = &comps[1]; // Mặc định Ngăn B (1 viên)
        }
    }

    // Mở nắp và kích hoạt xác minh
    hw_setServoLock(true);
    verify_start(activeComp, millis());

    // Giả lập rơi liên tiếp 2 viên (hoặc vượt liều)
    verify_onUnitRemoved();
    verify_onUnitRemoved();

    Serial.printf("  " ANSI_YELLOW "⚡ [CẢM BIẾN GIẢ LẬP]" ANSI_RESET " Ghi nhận rơi: " ANSI_BOLD "%d/%d viên (QUÁ LIỀU!)\r\n" ANSI_RESET,
                  verify_getDetectedUnits(), verify_getExpectedUnits());

    SystemState prevState = currentState;
    currentState = STATE_ERROR;
    stateTimerMillis = 0; // Đặt về 0 để STATE_ERROR gửi log lên Cloud
    logTransition(prevState, currentState, "CANH BAO: Uong qua lieu quy dinh (Test Overdose)!");

    hw_setAlarmReminder(false);
    hw_setAlarmError(true);
    hw_displayResult(false, "CANH BAO: THUA LIEU!");
}

