# 📜 BIÊN BẢN BÀN GIAO KỸ THUẬT & NGHIỆM THU CÔNG VIỆC
### (TECHNICAL HANDOVER COMPACT & DELIVERABLES REPORT)

> **Dự án**: IoT Hộp Đựng Thuốc Thông Minh (Wokwi & ESP32)  
> **Người thực hiện (Bên bàn giao)**: **Thành viên 1** – Phụ trách *Firmware Core & State Logic*  
> **Người tiếp nhận (Bên nhận bàn giao)**: **Thành viên 2** (Hardware & Drivers) & **Thành viên 3** (Cloud & Web)  
> **Thời điểm chốt kết quả (Freeze Timestamp)**: Tháng 10/2026  
> **Tình trạng nghiệm thu**: ✅ **HOÀN THÀNH 100% – ĐÃ KIỂM THỬ ĐẠT CHUẨN (PASS)**

---

## 1. TỔNG HỢP KẾT QUẢ ĐẠT ĐƯỢC (EXECUTIVE SUMMARY)

Thành viên 1 đã hoàn tất toàn bộ **"bộ não" điều khiển trung tâm** của vi điều khiển ESP32, đảm bảo kiến trúc **Decoupled (tách bạch hoàn toàn)** để TV2 và TV3 có thể ráp nối phần cứng và Cloud mà không bị xung đột code:

- ✅ **Finite State Machine (FSM)**: Vận hành mượt mà 8 trạng thái hệ thống, xử lý bất đồng bộ non-blocking 100% bằng `millis()` (tuyệt đối không dùng `delay()`).
- ✅ **Lịch trình & Snooze**: Tự động so khớp giờ hẹn 3 ngăn thuốc, chống lặp lệnh trong cùng 1 phút, hoãn báo thức 5 phút chính xác.
- ✅ **Xác minh liều lượng**: Thuật toán đếm và đối chiếu số viên, bắt lỗi uống thừa/thiếu liều hoặc timeout 60 giây không lấy thuốc.
- ✅ **Chỉ số tài nguyên ESP32**:
  - **RAM sử dụng**: `22,008 bytes` (**6.7%** dung lượng RAM) – Cực kỳ tối ưu.
  - **Flash bộ nhớ**: `288,545 bytes` (**22.0%** dung lượng Flash).
  - **Trạng thái Build**: `PlatformIO [SUCCESS] 0 Error, 0 Warning`.

---

## 2. DANH MỤC SẢN PHẨM BÀN GIAO (DELIVERABLES INVENTORY)

Toàn bộ các file mã nguồn đã được đóng gói tại thư mục gốc của repository:

| STT | File mã nguồn | Loại file | Vai trò kỹ thuật | Trạng thái |
|:---:|---|:---:|---|:---:|
| 1 | [`include/config.h`](file:///e:/IoT/include/config.h) | Header chung | Định nghĩa 8 trạng thái FSM, enum nút bấm, struct ngăn thuốc và log event | **Hoàn tất & Đóng băng** |
| 2 | [`include/hardware_interface.h`](file:///e:/IoT/include/hardware_interface.h) | Interface | Hợp đồng giao diện để TV2 kết nối ngoại vi phần cứng | **Hoàn tất** |
| 3 | [`include/sync_interface.h`](file:///e:/IoT/include/sync_interface.h) | Interface | Hợp đồng giao diện để TV3 kết nối đồng bộ Firebase | **Hoàn tất** |
| 4 | [`include/schedule.h`](file:///e:/IoT/include/schedule.h) & [`src/schedule.cpp`](file:///e:/IoT/src/schedule.cpp) | Core Module | Quản lý danh sách 3 ngăn A, B, C; kiểm tra giờ hẹn & Snooze | **Đã Unit Test** |
| 5 | [`include/verification.h`](file:///e:/IoT/include/verification.h) & [`src/verification.cpp`](file:///e:/IoT/src/verification.cpp) | Core Module | Thuật toán đếm viên thuốc, so sánh liều chuẩn, timeout 60s | **Đã Unit Test** |
| 6 | [`include/state_machine.h`](file:///e:/IoT/include/state_machine.h) & [`src/state_machine.cpp`](file:///e:/IoT/src/state_machine.cpp) | Core Engine | Máy trạng thái FSM điều phối toàn bộ chu trình hộp thuốc | **Đã System Test** |
| 7 | [`src/hardware.cpp`](file:///e:/IoT/src/hardware.cpp) | Driver mẫu | Điều khiển chân GPIO LED Xanh (D2), Đỏ (D15), Còi (D25), Servo (D13) | **Hoạt động trên Wokwi** |
| 8 | [`src/main.cpp`](file:///e:/IoT/src/main.cpp) | Test Harness | Chương trình chính với giao diện kiểm thử màu sắc qua Serial & Nút bấm | **Hoạt động tốt** |
| 9 | [`diagram.json`](file:///e:/IoT/diagram.json) & [`wokwi.toml`](file:///e:/IoT/wokwi.toml) | Mô phỏng | Sơ đồ mạch điện Wokwi phục vụ mô phỏng tức thì trên VS Code | **Sẵn sàng chạy** |
| 10 | [`README.md`](file:///e:/IoT/README.md) | Hướng dẫn | Hướng dẫn chạy và sử dụng nhanh cho các thành viên | **Đầy đủ** |

---

## 3. MA TRẬN KẾT QUẢ KIỂM THỬ (TEST ACCEPTANCE MATRIX)

Toàn bộ các ca kiểm thử thuộc phạm vi trách nhiệm của Thành viên 1 (Mục 10 tài liệu kỹ thuật) đã được nghiệm thu thực tế trên Wokwi Simulator:

| Mã TC | Kịch bản kiểm thử | Hành vi thực tế ghi nhận | Kết quả |
|:---:|---|---|:---:|
| **TC-01** | Báo thức đúng giờ hẹn | Nhấn phím `1` ➔ Đúng 08:00:00, còi bíp, LED xanh sáng, FSM chuyển `STATE_REMINDER` | **PASS** |
| **TC-02** | Hoãn báo thức (Snooze 5p) | Nhấn phím `S` (hoặc nút vàng) ➔ Còi tắt ngay, FSM vào `STATE_SNOOZED` | **PASS** |
| **TC-03** | Mở ngăn thuốc khi bấm TAKE | Nhấn phím `T` (hoặc nút xanh lá) ➔ Nắp Servo quay 90°, FSM chuyển `STATE_COMPARTMENT_OPEN` | **PASS** |
| **TC-04** | Uống đủ 2 viên (Luồng chuẩn) | Nhấn `R` 2 lần ➔ Báo `DA LAY DU LIEU ✓`, LED xanh sáng, trừ tồn kho, sau 3s Servo tự đóng về 0°, FSM quay về `STATE_IDLE` | **PASS** |
| **TC-05** | Lấy thiếu liều thuốc | Nhấn `R` 1 lần rồi đợi hết 60s ➔ Báo lỗi `MISMATCH_LESS`, còi hú, LED đỏ sáng, nắp đóng bảo vệ | **PASS** |
| **TC-06** | Lấy thừa liều (Uống quá liều) | Lịch ngăn B (1 viên), nhấn `R` 2 lần ➔ Lập tức báo động `MISMATCH_MORE`, chuyển `STATE_ERROR` | **PASS** |
| **TC-07** | Bấm TAKE nhưng không lấy thuốc | Nhấn `T` nhưng không nhấn `R`, đợi 60s ➔ Phân loại sự kiện là `NO_DETECTION`, chuyển `STATE_ERROR` | **PASS** |

---

## 4. HỢP ĐỒNG GIAO DIỆN BÀN GIAO (FROZEN INTERFACE CONTRACTS)

Để bảo đảm không bị xung đột mã nguồn khi ghép nhánh, **Thành viên 1 cam kết đóng băng (Freeze) các hàm sau đây**:

### 4.1. Bàn giao cho THÀNH VIÊN 2 (Hardware Driver)
File hợp đồng: [`include/hardware_interface.h`](file:///e:/IoT/include/hardware_interface.h)
> *Nhiệm vụ của TV2*: Triển khai phần cứng thật (thay thế driver mẫu trong `src/hardware.cpp`) bằng cách override các hàm sau:
```cpp
void hw_initAll();                                             // Khởi tạo LCD, RTC, DHT22, Servo, nút bấm
ButtonEvent hw_getButtonEvent();                               // Đọc phím nhấn đã chống rung 50ms
void hw_setServoLock(bool open);                               // true: Mở 90°, false: Đóng 0°
void hw_setAlarmReminder(bool active);                         // Bật/tắt còi và LED Xanh nhắc lịch
void hw_setAlarmError(bool active);                            // Bật/tắt còi và LED Đỏ cảnh báo lỗi
void hw_displayIdle(int h, int m, float t, float hmd);         // Hiển thị đồng hồ + nhiệt ẩm phòng
void hw_displayReminder(const char* comp, const char* medName, int dose); // Hiển thị tên thuốc & liều
void hw_displayVerifying(int detected, int expected);          // Hiển thị tiến độ nhặt thuốc
void hw_displayResult(bool success, const char* msg);          // Hiển thị thông báo kết quả
void hw_getEnvData(float &outTemp, float &outHumid);           // Đọc cảm biến nhiệt độ DHT22
```

### 4.2. Bàn giao cho THÀNH VIÊN 3 (Cloud & Web Dashboard)
File hợp đồng: [`include/sync_interface.h`](file:///e:/IoT/include/sync_interface.h)
> *Nhiệm vụ của TV3*: Viết file `src/cloud_sync.cpp` triển khai kết nối Wi-Fi Wokwi-GUEST và Firebase RTDB:
```cpp
void cloud_init();                                             // Kết nối Wi-Fi Wokwi-GUEST & Firebase RTDB
void cloud_loop();                                             // Duy trì heartbeat, xử lý đẩy hàng đợi bù
bool cloud_isOnline();                                         // Kiểm tra trạng thái mạng Online/Offline
void cloud_pushEvent(const VerificationEvent &ev);             // Đẩy bản ghi sự kiện uống thuốc lên /events
void cloud_updateTelemetry(float t, float h, SystemState st);  // Đẩy nhiệt ẩm & trạng thái lên /deviceStatus
bool cloud_fetchCompartmentConfig(MedicationCompartment* outList, int maxCount); // Đồng bộ cấu hình từ xa
```

---

## 5. CAM KẾT & XÁC NHẬN NGHIỆM THU

1. **Bên bàn giao (Thành viên 1)**:
   - Cam kết toàn bộ mã nguồn logic FSM, Schedule, Verification đã được kiểm thử độc lập, không phụ thuộc vào thư viện ngoài chưa công bố.
   - Cam kết hỗ trợ kỹ thuật cho TV2 và TV3 trong quá trình tích hợp nhánh chung.

2. **Khuyến nghị cho nhóm**:
   - Thành viên 1 đẩy toàn bộ mã nguồn lên nhánh: `feat/firmware-core`.
   - Thành viên 2 tạo nhánh `feat/wokwi-ui` dựa trên nền nhánh này để bổ sung LCD 1602 và DHT22.
   - Thành viên 3 tạo nhánh `feat/cloud-dashboard` để xây dựng Web Dashboard và module đồng bộ Firebase.

---
*Biên bản này được lập thành văn bản lưu tại kho mã nguồn dự án làm căn cứ nghiệm thu giai đoạn Milestone 1.*
