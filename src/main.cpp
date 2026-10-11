#include <Arduino.h>
#include "config.h"
#include "state_machine.h"
#include "hardware_interface.h"
#include "sync_interface.h"

// Thời gian giả lập để chạy thử khi chưa có chip RTC thật
static uint8_t simHour = 7;
static uint8_t simMinute = 59;
static unsigned long lastClockTick = 0;

void printHelpMenu() {
    Serial.print("\r\n");
    Serial.println("\033[1;36m+==============================================================+\033[0m");
    Serial.println("\033[1;36m|     HỘP THUỐC THÔNG MINH - MOCK TEST HARNESS (THÀNH VIÊN 1)  |\033[0m");
    Serial.println("\033[1;36m+==============================================================+\033[0m");
    Serial.println("  \033[1;33m[1]\033[0m -> Nhảy đồng hồ tới \033[1;32m08:00:00\033[0m (Ngăn A: Thuốc Tim Mach - 2 viên)");
    Serial.println("  \033[1;33m[2]\033[0m -> Nhảy đồng hồ tới \033[1;32m12:00:00\033[0m (Ngăn B: Vitamin C     - 1 viên)");
    Serial.println("  \033[1;33m[3]\033[0m -> Nhảy đồng hồ tới \033[1;32m20:00:00\033[0m (Ngăn C: Canxi Nano    - 1 viên)");
    Serial.println("  --------------------------------------------------------------");
    Serial.println("  \033[1;32m[T]\033[0m -> Bấm nút \033[1mTAKE\033[0m        : Người bệnh xác nhận, mở nắp ngăn");
    Serial.println("  \033[1;34m[R]\033[0m -> Bấm nút \033[1mREMOVE_UNIT\033[0m : Cảm biến ghi nhận lấy ra 1 viên");
    Serial.println("  \033[1;33m[S]\033[0m -> Bấm nút \033[1mSNOOZE\033[0m      : Tạm hoãn báo thức 5 phút");
    Serial.println("  \033[1;31m[M]\033[0m -> Bấm nút \033[1mMENU\033[0m        : Xác nhận xóa lỗi cảnh báo");
    Serial.println("  \033[1;35m[L]\033[0m -> Bấm nút \033[1mLOAD/INFO\033[0m   : Xem thông tin tồn kho & lịch 3 ngăn");
    Serial.println("  \033[1;37m[?]\033[0m -> Hiển thị lại bảng menu trợ giúp này");
    Serial.println("\033[1;36m+==============================================================+\033[0m\r\n");
}

void setup() {
    Serial.begin(115200);
    delay(1000);

    // Khởi tạo cỗ máy FSM và lịch uống
    fsm_init();

    // Khởi tạo kết nối mạng và Firebase Cloud Sync (Thành viên 3)
    cloud_init();

    printHelpMenu();
    Serial.printf("\033[1;30;47m [HỆ THỐNG] \033[0m Đồng hồ giả lập hiện tại: \033[1;32m%02d:%02d:00\033[0m | Trạng thái: \033[1;33mSTATE_IDLE\033[0m\r\n\r\n", 
                  simHour, simMinute);
}

void loop() {
    ButtonEvent btnInput = BTN_NONE;
    unsigned long now = millis();

    // 0. Đọc sự kiện click chuột trực tiếp từ các nút bấm trên mạch Wokwi
    ButtonEvent hwBtn = hw_getButtonEvent();
    if (hwBtn != BTN_NONE) {
        btnInput = hwBtn;
        if (hwBtn == BTN_TAKE_PRESSED)   Serial.println("\r\n\033[1;32m▶ [NÚT BẤM WOKWI] Bạn vừa click nút TAKE (D12)\033[0m");
        if (hwBtn == BTN_REMOVE_PRESSED) Serial.println("\r\n\033[1;34m▶ [NÚT BẤM WOKWI] Bạn vừa click nút REMOVE (D35)\033[0m");
        if (hwBtn == BTN_SNOOZE_PRESSED) Serial.println("\r\n\033[1;33m▶ [NÚT BẤM WOKWI] Bạn vừa click nút SNOOZE (D33)\033[0m");
        if (hwBtn == BTN_MENU_PRESSED)   Serial.println("\r\n\033[1;31m▶ [NÚT BẤM WOKWI] Bạn vừa click nút MENU (D26)\033[0m");
    }

    // 1. Đọc phím gõ từ Serial để giả lập sự kiện nút bấm
    if (Serial.available() > 0) {
        char ch = Serial.read();
        if (ch != '\r' && ch != '\n') {
            Serial.printf("\r\n\033[1;33m▶ [THAO TÁC] Bạn vừa gõ phím: '%c'\033[0m\r\n", ch);

            switch (ch) {
                case '1':
                    simHour = 8; simMinute = 0;
                    Serial.printf("  ↳ Đồng hồ nhảy tới: \033[1;32m%02d:%02d:00\033[0m (Khớp lịch Ngăn A)\r\n", simHour, simMinute);
                    break;
                case '2':
                    simHour = 12; simMinute = 0;
                    Serial.printf("  ↳ Đồng hồ nhảy tới: \033[1;32m%02d:%02d:00\033[0m (Khớp lịch Ngăn B)\r\n", simHour, simMinute);
                    break;
                case '3':
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
                case 'L': {
                    Serial.println("\r\n  \033[1;36m+--- [THÔNG TIN TỒN KHO & LỊCH CÁC NGĂN THUỐC] ---+\033[0m");
                    MedicationCompartment* comps = schedule_getCompartments();
                    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
                        Serial.printf("  | Ngăn %s: %-15s | Lịch: %02d:%02d | Liều: %d viên | Còn: %d viên |\r\n", 
                                      comps[i].compartmentId, comps[i].displayName, 
                                      comps[i].scheduleHour, comps[i].scheduleMinute, 
                                      comps[i].unitsPerDose, comps[i].currentStock);
                    }
                    Serial.println("  \033[1;36m+--------------------------------------------------+\033[0m");
                    break;
                }
                case '?':
                    printHelpMenu();
                    break;
                default:
                    Serial.printf("  ↳ Phím '%c' không có tác dụng. Gõ '?' để xem lại menu.\r\n", ch);
                    break;
            }
        }
    }

    // 2. Cập nhật máy trạng thái FSM liên tục (Non-blocking)
    fsm_update(btnInput, simHour, simMinute, now);

    // 2.1. Cập nhật tiến trình đồng bộ mạng & Firebase (Thành viên 3)
    cloud_loop();

    // 3. Giả lập đồng hồ trôi nhẹ mỗi 1 phút nếu không có thao tác
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
