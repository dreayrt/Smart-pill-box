#include <Arduino.h>
#include "config.h"
#include "state_machine.h"
#include "hardware_interface.h"
#include "schedule.h"
#include "sync_interface.h"
#include "time_service.h"

// Biến điều hướng xem ngăn thuốc và giữ màn hình tạm thời
static uint8_t viewCompIndex = 0;
static bool isViewingComps = false;
static unsigned long holdCustomScreenUntil = 0;

void printHelpMenu() {
    Serial.print("\r\n");
    Serial.println("\033[1;36m+==============================================================+\033[0m");
    Serial.println("\033[1;36m|     HỘP THUỐC THÔNG MINH - HỆ THỐNG TÍCH HỢP TOÀN DIỆN      |\033[0m");
    Serial.println("\033[1;36m+==============================================================+\033[0m");
    Serial.println("  [1]/[2]/[3] -> Test chuông Ngăn A/B/C (không thay đổi giờ thật)");
    const char* compartmentIds[] = {"A", "B", "C"};
    const char* shortcutKeys[] = {"1", "2", "3"};
    for (uint8_t i = 0; i < NUM_COMPARTMENTS; ++i) {
        MedicationCompartment* comp = schedule_getCompartmentById(compartmentIds[i]);
        if (comp == nullptr) continue;
        Serial.printf("    [%s] Ngăn %s: %02u:%02u, %s, %u viên/lần%s\r\n",
                      shortcutKeys[i], comp->compartmentId,
                      (unsigned int)comp->scheduleHour,
                      (unsigned int)comp->scheduleMinute,
                      comp->displayName,
                      (unsigned int)comp->unitsPerDose,
                      comp->isLoaded ? "" : " (chưa nạp - không kích hoạt)");
    }
    Serial.println("  --------------------------------------------------------------");
    Serial.println("  \033[1;32m[T]\033[0m -> Bấm nút \033[1mTAKE (D12)\033[0m      : Người bệnh mở nắp lấy thuốc");
    Serial.println("  \033[1;34m[R]\033[0m -> Bấm nút \033[1mREMOVE (D35)\033[0m    : Cảm biến phát hiện rơi 1 viên");
    Serial.println("  \033[1;33m[S]\033[0m -> Bấm nút \033[1mSNOOZE (D33)\033[0m    : Tạm hoãn báo thức 5 phút");
    Serial.println("  \033[1;31m[M]\033[0m -> Bấm nút \033[1mMENU (D26)\033[0m      : Reset xóa lỗi cảnh báo");
    Serial.println("  \033[1;35m[L]\033[0m -> Bấm nút \033[1mLOAD (D32)\033[0m      : Nạp thêm +10 viên vào ngăn");
    Serial.println("  \033[1;37m[U/D]\033[0m -> Nút \033[1mUP/DOWN (D27/14)\033[0m   : Duyệt xem thông tin 3 ngăn trên LCD");
    Serial.println("  \033[1;31m[O]\033[0m -> Test \033[1mQUÁ LIỀU (TC-06)\033[0m  : Giả lập rơi thừa thuốc / quá liều ngay lập tức");
    Serial.println("  \033[1;32m[H]\033[0m -> Chạy \033[1mSELF-TEST\033[0m       : Chẩn đoán toàn diện phần cứng (TV2)");
    Serial.println("  \033[1;37m[?]\033[0m -> Hiển thị lại bảng menu trợ giúp này");
    Serial.println("\033[1;36m+==============================================================+\033[0m\r\n");
}

static void simulateCompartmentSchedule(const char* compartmentId, unsigned long currentMillis) {
    fsm_simulateReminderForCompartment(compartmentId, currentMillis);
}

void setup() {
    Serial.begin(115200);
    delay(1000);

    // 1. Khởi tạo cỗ máy FSM và phần cứng ngoại vi
    fsm_init();

    // 2. Khởi tạo kết nối mạng Wi-Fi và Firebase Cloud Sync (Thành viên 3)
    cloud_init();

    // Đồng bộ giờ: khôi phục DS3231 trước, sau đó NTP hiệu chỉnh khi có Wi-Fi.
    time_service_init();
    TimeSnapshot initialTime = {};
    const bool initialTimeValid = time_service_getSnapshot(initialTime);

    printHelpMenu();
    if (initialTimeValid) {
        Serial.printf("[SYSTEM] Initial time: %04u-%02u-%02u %02u:%02u:%02u (%s) | STATE_IDLE\r\n\r\n",
                      initialTime.year, initialTime.month, initialTime.day,
                      initialTime.hour, initialTime.minute, initialTime.second,
                      time_service_sourceName(initialTime.source));
    } else {
        Serial.println("[SYSTEM] TIME_INVALID: waiting for RTC/NTP; reminders are disabled until time is valid.\r\n");
    }
}

void loop() {
    ButtonEvent btnInput = BTN_NONE;
    unsigned long now = millis();
    time_service_loop();
    TimeSnapshot currentTime = {};
    const bool timeValid = time_service_getSnapshot(currentTime);
    const uint8_t hour = timeValid ? currentTime.hour : 0;
    const uint8_t minute = timeValid ? currentTime.minute : 0;
    const bool scheduleConfigValid = cloud_hasScheduleConfig();
    const uint32_t dateKey = (timeValid && scheduleConfigValid) ? currentTime.dateKey : 0;
    const uint32_t unixTime = timeValid ? currentTime.unixTime : 0;
    if (timeValid && !scheduleConfigValid) {
        static bool warnedMissingSchedule = false;
        if (!warnedMissingSchedule) {
            Serial.println("[SCHEDULE] No validated cloud/NVS schedule; default sample times will not trigger reminders.");
            warnedMissingSchedule = true;
        }
    }

    // 0. Đọc sự kiện click chuột trực tiếp từ 7 nút bấm trên mạch Wokwi (Debounce 50ms)
    ButtonEvent hwBtn = hw_getButtonEvent();
    if (hwBtn != BTN_NONE) {
        btnInput = hwBtn;
        if (hwBtn == BTN_TAKE_PRESSED)   Serial.println("\r\n\033[1;32m▶ [NÚT BẤM WOKWI] Bạn vừa click nút TAKE (D12)\033[0m");
        if (hwBtn == BTN_REMOVE_PRESSED) Serial.println("\r\n\033[1;34m▶ [NÚT BẤM WOKWI] Bạn vừa click nút REMOVE (D35)\033[0m");
        if (hwBtn == BTN_SNOOZE_PRESSED) Serial.println("\r\n\033[1;33m▶ [NÚT BẤM WOKWI] Bạn vừa click nút SNOOZE (D33)\033[0m");
        if (hwBtn == BTN_MENU_PRESSED)   Serial.println("\r\n\033[1;31m▶ [NÚT BẤM WOKWI] Bạn vừa click nút MENU (D26)\033[0m");
        if (hwBtn == BTN_LOAD_PRESSED)   Serial.println("\r\n\033[1;35m▶ [NÚT BẤM WOKWI] Bạn vừa click nút LOAD (D32)\033[0m");
        if (hwBtn == BTN_UP_PRESSED)     Serial.println("\r\n\033[1;37m▶ [NÚT BẤM WOKWI] Bạn vừa click nút UP (D27)\033[0m");
        if (hwBtn == BTN_DOWN_PRESSED)   Serial.println("\r\n\033[1;37m▶ [NÚT BẤM WOKWI] Bạn vừa click nút DOWN (D14)\033[0m");
    }

    // 1. Đọc phím gõ từ Serial để giả lập sự kiện kiểm thử nhanh
    if (Serial.available() > 0) {
        char ch = Serial.read();
        if (ch != '\r' && ch != '\n') {
            Serial.printf("\r\n\033[1;33m▶ [THAO TÁC] Bạn vừa gõ phím: '%c'\033[0m\r\n", ch);

            switch (ch) {
                case '1':
                    simulateCompartmentSchedule("A", now);
                    break;
                case '2':
                    simulateCompartmentSchedule("B", now);
                    break;
                case '3':
                    simulateCompartmentSchedule("C", now);
                    break;
                case 't':
                case 'T':
                    btnInput = BTN_TAKE_PRESSED;
                    Serial.println("  ↳ Sự kiện: BẤM NÚT TAKE (Người bệnh mở nắp)");
                    break;
                case 'r':
                case 'R':
                    btnInput = BTN_REMOVE_PRESSED;
                    Serial.println("  ↳ Sự kiện: CẢM BIẾN REMOVE_UNIT (Lấy 1 viên thuốc)");
                    break;
                case 's':
                case 'S':
                    btnInput = BTN_SNOOZE_PRESSED;
                    Serial.println("  ↳ Sự kiện: BẤM NÚT SNOOZE (Hoãn chuông 5 phút)");
                    break;
                case 'm':
                case 'M':
                    btnInput = BTN_MENU_PRESSED;
                    Serial.println("  ↳ Sự kiện: BẤM NÚT MENU (Reset lỗi)");
                    break;
                case 'l':
                case 'L':
                    btnInput = BTN_LOAD_PRESSED;
                    Serial.println("  ↳ Sự kiện: BẤM NÚT LOAD (Nạp thuốc vào ngăn)");
                    break;
                case 'u':
                case 'U':
                    btnInput = BTN_UP_PRESSED;
                    break;
                case 'd':
                case 'D':
                    btnInput = BTN_DOWN_PRESSED;
                    break;
                case 'h':
                case 'H':
                    hw_runSelfTest();
                    holdCustomScreenUntil = millis() + 1000UL;
                    break;
                case 'o':
                case 'O':
                    fsm_simulateOverdose();
                    break;
                case '?':
                    printHelpMenu();
                    break;
                default:
                    Serial.printf("  ↳ Phím '%c' không có tác dụng. Gõ '?' để xem lại menu.\r\n", ch);
                    break;
            }
        }
    }

    // 2. Xử lý thao tác điều hướng ngoại vi (UP, DOWN, LOAD) khi hệ thống ở STATE_IDLE
    if (fsm_getState() == STATE_IDLE) {
        MedicationCompartment* comps = schedule_getCompartments();

        if (btnInput == BTN_UP_PRESSED) {
            if (!isViewingComps) {
                // Lần bấm đầu tiên: Bắt đầu hiển thị từ Ngăn A
                viewCompIndex = 0;
                isViewingComps = true;
            } else {
                // Các lần bấm tiếp theo: Tuần hoàn A -> B -> C -> A
                viewCompIndex = (viewCompIndex + 1) % NUM_COMPARTMENTS;
            }
            hw_displayCompartmentInfo(comps[viewCompIndex].compartmentId, 
                                      comps[viewCompIndex].displayName, 
                                      comps[viewCompIndex].scheduleHour, 
                                      comps[viewCompIndex].scheduleMinute, 
                                      comps[viewCompIndex].currentStock);
            holdCustomScreenUntil = now + 4000UL; // Giữ màn hình xem trong 4 giây
        } else if (btnInput == BTN_DOWN_PRESSED) {
            if (!isViewingComps) {
                // Lần bấm đầu tiên khi bấm DOWN: Hiển thị từ Ngăn C
                viewCompIndex = NUM_COMPARTMENTS - 1;
                isViewingComps = true;
            } else {
                // Các lần bấm tiếp theo: Tuần hoàn lùi C -> B -> A -> C
                viewCompIndex = (viewCompIndex + NUM_COMPARTMENTS - 1) % NUM_COMPARTMENTS;
            }
            hw_displayCompartmentInfo(comps[viewCompIndex].compartmentId, 
                                      comps[viewCompIndex].displayName, 
                                      comps[viewCompIndex].scheduleHour, 
                                      comps[viewCompIndex].scheduleMinute, 
                                      comps[viewCompIndex].currentStock);
            holdCustomScreenUntil = now + 4000UL;
        } else if (btnInput == BTN_LOAD_PRESSED) {
            const uint8_t previousStock = comps[viewCompIndex].currentStock;
            const uint8_t addedUnits = (previousStock >= 100) ? 0 :
                (uint8_t)(((unsigned int)previousStock + 10U > 100U) ? 100U - previousStock : 10U);
            comps[viewCompIndex].currentStock = (uint8_t)(previousStock + addedUnits);
            cloud_stockChanged(comps[viewCompIndex].compartmentId, comps[viewCompIndex].currentStock);
            if (addedUnits == 0) {
                Serial.printf("  [TỒN KHO] Ngăn %s đã đạt giới hạn 100 viên.\r\n", comps[viewCompIndex].compartmentId);
            }
            hw_displayLoadResult(comps[viewCompIndex].compartmentId, addedUnits, comps[viewCompIndex].currentStock);
            holdCustomScreenUntil = now + 3500UL;
        }
    }

    // Tự động tắt chế độ xem ngăn và quay lại màn hình đồng hồ khi hết thời gian chờ
    if (now >= holdCustomScreenUntil) {
        isViewingComps = false;
    }

    // 3. Cập nhật máy trạng thái FSM liên tục (Non-blocking)
    fsm_update(btnInput, hour, minute, dateKey, unixTime, timeValid, now);

    // 4. Cập nhật tiến trình đồng bộ mạng & Firebase (Thành viên 3)
    cloud_loop();

    // 5. Cập nhật màn hình LCD ở trạng thái chờ (STATE_IDLE) mỗi 1 giây (nếu không đang xem ngăn/nạp thuốc)
    static unsigned long lastIdleRefreshMs = 0;
    if (fsm_getState() == STATE_IDLE && now >= holdCustomScreenUntil && (now - lastIdleRefreshMs >= 1000UL)) {
        lastIdleRefreshMs = now;
        float t, h;
        hw_getEnvData(t, h);
        hw_displayIdle(hour, minute, timeValid ? currentTime.second : 0,
                       timeValid, time_service_sourceName(timeValid ? currentTime.source : TIME_SOURCE_INVALID), t, h);
    }

    delay(10);
}
