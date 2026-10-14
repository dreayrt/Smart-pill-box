#include <Arduino.h>
#include "config.h"
#include "state_machine.h"
#include "hardware_interface.h"
#include "schedule.h"

// Thời gian giả lập ban đầu: 07:50 để có 10 phút thoải mái test phím bấm trước khi đến 08:00
static uint8_t simHour = 7;
static uint8_t simMinute = 50;
static unsigned long lastClockTick = 0;

// Biến điều hướng xem ngăn thuốc và giữ màn hình tạm thời
static uint8_t viewCompIndex = 0;
static bool isViewingComps = false;
static unsigned long holdCustomScreenUntil = 0;

void printHelpMenu() {
    Serial.print("\r\n");
    Serial.println("\033[1;36m+==============================================================+\033[0m");
    Serial.println("\033[1;36m|     HỘP THUỐC THÔNG MINH - TEST HARNESS (THÀNH VIÊN 1 & 2)   |\033[0m");
    Serial.println("\033[1;36m+==============================================================+\033[0m");
    Serial.println("  \033[1;33m[1]\033[0m -> Nhảy đồng hồ tới \033[1;32m08:00:00\033[0m (Ngăn A: Thuốc Tim Mach - 2 viên)");
    Serial.println("  \033[1;33m[2]\033[0m -> Nhảy đồng hồ tới \033[1;32m12:00:00\033[0m (Ngăn B: Vitamin C     - 1 viên)");
    Serial.println("  \033[1;33m[3]\033[0m -> Nhảy đồng hồ tới \033[1;32m20:00:00\033[0m (Ngăn C: Canxi Nano    - 1 viên)");
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

void setup() {
    Serial.begin(115200);
    delay(1000);

    // Khởi tạo cỗ máy FSM và lịch uống
    fsm_init();

    // Đồng bộ giờ ban đầu từ RTC nếu có module thật
    int rtcH, rtcM, rtcS;
    if (hw_getRTCTime(rtcH, rtcM, rtcS)) {
        simHour = rtcH;
        simMinute = rtcM;
    }

    printHelpMenu();
    Serial.printf("\033[1;30;47m [HỆ THỐNG] \033[0m Đồng hồ ban đầu: \033[1;32m%02d:%02d:00\033[0m | Trạng thái: \033[1;33mSTATE_IDLE\033[0m\r\n\r\n", 
                  simHour, simMinute);
}

void loop() {
    ButtonEvent btnInput = BTN_NONE;
    unsigned long now = millis();

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
                    fsm_resetToIdle();
                    simHour = 8; simMinute = 0;
                    Serial.printf("  ↳ Đồng hồ nhảy tới: \033[1;32m%02d:%02d:00\033[0m (Khớp lịch Ngăn A)\r\n", simHour, simMinute);
                    break;
                case '2':
                    fsm_resetToIdle();
                    simHour = 12; simMinute = 0;
                    Serial.printf("  ↳ Đồng hồ nhảy tới: \033[1;32m%02d:%02d:00\033[0m (Khớp lịch Ngăn B)\r\n", simHour, simMinute);
                    break;
                case '3':
                    fsm_resetToIdle();
                    simHour = 20; simMinute = 0;
                    Serial.printf("  ↳ Đồng hồ nhảy tới: \033[1;32m%02d:%02d:00\033[0m (Khớp lịch Ngăn C)\r\n", simHour, simMinute);
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
            comps[viewCompIndex].currentStock += 10;
            hw_displayLoadResult(comps[viewCompIndex].compartmentId, 10, comps[viewCompIndex].currentStock);
            holdCustomScreenUntil = now + 3500UL;
        }
    }

    // Tự động tắt chế độ xem ngăn và quay lại màn hình đồng hồ khi hết thời gian chờ
    if (now >= holdCustomScreenUntil) {
        isViewingComps = false;
    }

    // 3. Cập nhật máy trạng thái FSM liên tục (Non-blocking)
    fsm_update(btnInput, simHour, simMinute, now);

    // 4. Cập nhật màn hình LCD ở trạng thái chờ (STATE_IDLE) mỗi 1 giây (nếu không đang xem ngăn/nạp thuốc)
    static unsigned long lastIdleRefreshMs = 0;
    if (fsm_getState() == STATE_IDLE && now >= holdCustomScreenUntil && (now - lastIdleRefreshMs >= 1000UL)) {
        lastIdleRefreshMs = now;
        float t, h;
        hw_getEnvData(t, h);
        hw_displayIdle(simHour, simMinute, t, h);
    }

    // 5. Giả lập đồng hồ trôi nhẹ mỗi 1 phút nếu không có thao tác
    if (now - lastClockTick >= 60000UL) {
        lastClockTick = now;
        simMinute++;
        if (simMinute >= 60) {
            simMinute = 0;
            simHour = (simHour + 1) % 24;
        }
    }

    delay(10);
}
