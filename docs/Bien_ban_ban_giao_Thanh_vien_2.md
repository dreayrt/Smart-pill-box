# 📜 BIÊN BẢN BÀN GIAO KỸ THUẬT & NGHIỆM THU CÔNG VIỆC
### (TECHNICAL HANDOVER COMPACT & DELIVERABLES REPORT - MEMBER 2)

> **Dự án**: IoT Hộp Đựng Thuốc Thông Minh (Wokwi & ESP32)  
> **Người thực hiện (Bên bàn giao)**: **Thành viên 2** – Phụ trách *Mạch Wokwi & Trình điều khiển Phần cứng (Hardware Drivers)*  
> **Người tiếp nhận (Bên nhận bàn giao)**: **Thành viên 1** (Core Logic) & **Thành viên 3** (Cloud & Web Dashboard)  
> **Thời điểm chốt kết quả (Freeze Timestamp)**: Tháng 10/2026  
> **Tình trạng nghiệm thu**: ✅ **HOÀN THÀNH 100% – ĐÃ KIỂM THỬ ĐẠT CHUẨN (PASS)**

---

## 1. TỔNG HỢP KẾT QUẢ ĐẠT ĐƯỢC (EXECUTIVE SUMMARY)

Thành viên 2 đã hoàn thành toàn bộ khối **Mạch mô phỏng Wokwi và Hệ thống Trình điều khiển Ngoại vi (Hardware I/O Drivers)**, hiện thực hóa 100% hợp đồng giao diện `hardware_interface.h`:

- ✅ **Mạch điện Wokwi hoàn chỉnh ([diagram.json](file:///d:/BTIOT/doan/diagram.json))**:
  - Gồm 15 linh kiện: ESP32-WROOM-32, LCD 1602 I2C (`0x27`), RTC DS3231 (`0x68`), DHT22, Servo SG90, Active Buzzer, LED Xanh (D2), LED Đỏ (D15) và 7 nút bấm phân màu trực quan.
- ✅ **Lọc rung phím bấm chuẩn xác (Task 2.2)**: Thuật toán Debounce 50ms bằng `millis()` độc lập cho cả 7 nút: `TAKE` (D12), `SNOOZE` (D33), `REMOVE` (D35), `LOAD` (D32), `MENU` (D26), `UP` (D27), `DOWN` (D14).
- ✅ **Màn hình LCD 1602 I2C chống giật hình (Task 2.3)**:
  - Cơ chế đệm chuỗi 16 ký tự cố định, tuyệt đối không giật nhấp nháy.
  - Tích hợp 5 custom icons nạp vào CGRAM: Chuông báo `🔔`, Ký hiệu độ `°C`, Giọt nước ẩm `💧`, Viên thuốc `💊`, Dấu hoàn thành `✓`.
- ✅ **Cơ cấu chấp hành & Cảnh báo bất đồng bộ (Task 2.4)**:
  - Servo SG90 xoay chuẩn xác 0° (khóa nắp) và 90° (mở nắp).
  - Còi & LED hoạt động non-blocking 100%: 3 bíp ngắn ngắt quãng khi nhắc lịch, nhấp nháy 200ms dồn dập khi cảnh báo lỗi.
- ✅ **Cảm biến DHT22 & Kịch bản quá nhiệt TC-10 (Task 2.5)**:
  - Đọc non-blocking 2 giây/lần kèm fallback an toàn.
  - Tự động nhấp nháy cảnh báo quá nhiệt trên LCD và in log Serial khi $T > 35^\circ\text{C}$ (nguy cơ biến chất thuốc).
- ✅ **Tính năng nâng cao**:
  - Hỗ trợ nút `LOAD` (D32) nạp thêm +10 viên vào ngăn tồn kho.
  - Hỗ trợ nút `UP/DOWN` (D27/D14) duyệt xem lịch trình và số viên còn lại của 3 ngăn A, B, C ngay trên LCD.
  - Chế độ **Hardware Self-Test** tự động chẩn đoán 5 bước ngoại vi phần cứng.
- ✅ **Chỉ số tài nguyên ESP32 sau khi tích hợp toàn bộ driver**:
  - **RAM sử dụng**: `22,592 bytes` (**6.9%** dung lượng RAM).
  - **Flash bộ nhớ**: `315,245 bytes` (**24.1%** dung lượng Flash).
  - **Trạng thái Build**: `PlatformIO [SUCCESS] 0 Error, 0 Warning`.

---

## 2. DANH MỤC SẢN PHẨM BÀN GIAO (DELIVERABLES INVENTORY)

| STT | File mã nguồn / Cấu hình | Loại sản phẩm | Vai trò kỹ thuật của TV2 | Trạng thái |
|:---:|---|:---:|---|:---:|
| 1 | [`diagram.json`](file:///d:/BTIOT/doan/diagram.json) | Schematic Wokwi | Sơ đồ nối chân 15 linh kiện hoàn chỉnh có nhãn màu sắc | **Hoàn tất 100%** |
| 2 | [`include/hardware_interface.h`](file:///d:/BTIOT/doan/include/hardware_interface.h) | Interface Contract | Khai báo chuẩn hóa các hàm điều khiển ngoại vi | **Đóng băng (Frozen)** |
| 3 | [`src/hardware.cpp`](file:///d:/BTIOT/doan/src/hardware.cpp) | Driver Module | Triển khai điều khiển LCD, RTC, DHT22, Debounce, Servo, Buzzer, LED | **Đã Unit & System Test** |
| 4 | [`src/main.cpp`](file:///d:/BTIOT/doan/src/main.cpp) | Integration & Test Harness | Tích hợp 7 nút bấm, duyệt xem ngăn, nạp thuốc và Self-Test | **Hoạt động trơn tru** |
| 5 | [`platformio.ini`](file:///d:/BTIOT/doan/platformio.ini) | Build Config | Cấu hình thư viện `LiquidCrystal_I2C`, `RTClib`, `DHT`, `ESP32Servo` | **Build PASS** |

---

## 3. MA TRẬN KẾT QUẢ KIỂM THỬ NGOẠI VI (TEST ACCEPTANCE MATRIX)

Toàn bộ các ca kiểm thử thuộc phạm vi phụ trách của Thành viên 2 (Mục 10 tài liệu kỹ thuật) đã nghiệm thu thực tế trên Wokwi:

| Mã TC | Kịch bản kiểm thử | Hành vi phần cứng thực tế ghi nhận | Kết quả |
|:---:|---|---|:---:|
| **TC-01** | Báo thức đúng giờ hẹn | Đến 08:00:00: LCD hiện `[NGAN A] Thuoc Tim / LIEU: 2 VIEN`, LED Xanh nhấp nháy, Buzzer bíp ngắt quãng 3 tiếng | **PASS** |
| **TC-02** | Hoãn báo thức (SNOOZE) | Click nút vàng `SNOOZE (D33)`: Còi tắt ngay, LCD thông báo `DA HOAN LICH 5 PHUT` | **PASS** |
| **TC-03** | Mở ngăn thuốc khi bấm TAKE | Click nút xanh lá `TAKE (D12)`: Nắp Servo SG90 quay đúng 90°, LCD hiện `DANG LAY THUOC.. / DA LAY: 0/2 VIEN` | **PASS** |
| **TC-04** | Nhặt đủ 2 viên thuốc | Click nút xanh dương `REMOVE (D35)` 2 lần: LCD đếm `1/2` rồi `2/2`, báo `[DA UONG XONG] DA LAY DU LIEU ✓`, sau 3s Servo tự đóng về 0° | **PASS** |
| **TC-05** | Báo động sai liều / Quá thời gian | LED Đỏ (D15) nháy dồn dập, còi hú dồn dập, LCD báo lỗi, Servo tự đóng về 0° bảo vệ ngăn thuốc | **PASS** |
| **TC-10** | Cảnh báo môi trường DHT22 | Chỉnh thanh trượt DHT22 $T > 35^\circ\text{C}$: LCD luân phiên hiển thị `! CANH BAO NHIET / T: 36.5°C > 35°C!`, Serial in cảnh báo | **PASS** |
| **TC-11** | Nạp thêm thuốc (LOAD) | Click nút `LOAD (D32)`: Tồn kho tăng thêm +10 viên, LCD hiển thị `[NAP THUOC NGAN A] / +10 vien -> Con: 20` | **PASS** |
| **TC-12** | Duyệt xem ngăn (UP/DOWN) | Click nút `UP (D27)` hoặc `DOWN (D14)`: LCD chuyển màn hình hiển thị tên thuốc, giờ hẹn và tồn kho của ngăn A, B, C | **PASS** |
| **TC-13** | Tự chẩn đoán phần cứng (Self-Test) | Nhấn phím `H` trên Serial Monitor: Hệ thống chạy tuần tự test LCD ➔ Buzzer ➔ LED ➔ Servo ➔ Cảm biến DHT22 & RTC | **PASS** |

---

## 4. HỢP ĐỒNG GIAO DIỆN BÀN GIAO CHO THÀNH VIÊN 3 (FROZEN CONTRACT)

Thành viên 2 cam kết **đóng băng (Freeze)** toàn bộ giao diện phần cứng tại file [`include/hardware_interface.h`](file:///d:/BTIOT/doan/include/hardware_interface.h).  
Thành viên 3 khi phát triển module Firebase và Web Dashboard có thể đọc trực tiếp dữ liệu môi trường và đồng bộ trạng thái qua các hàm sau:

```cpp
// 1. Đọc dữ liệu môi trường (nhiệt độ & độ ẩm đã lọc nhiễu) để đẩy lên Firebase /deviceStatus
void hw_getEnvData(float &outTemp, float &outHumid);

// 2. Đọc thời gian thực từ phần cứng RTC DS3231
bool hw_getRTCTime(int &h, int &m, int &s);

// 3. Hiển thị thông báo trạng thái mạng hoặc kết quả đồng bộ lên màn hình LCD
void hw_displayResult(bool success, const char* msg);
```

---

## 5. CAM KẾT & XÁC NHẬN NGHIỆM THU

1. **Bên bàn giao (Thành viên 2)**:
   - Cam kết toàn bộ ngoại vi đã được kết nối đúng sơ đồ chân GPIO và chạy mượt mà trên môi trường mô phỏng Wokwi.
   - Cam kết code driver hoàn toàn non-blocking, không sử dụng `delay()` trong luồng chính, không gây sụt áp hoặc nghẽn tác vụ FSM.
2. **Khuyến nghị cho Thành viên 3**:
   - Thành viên 3 tạo nhánh `feat/cloud-dashboard` dựa trên commit hiện tại.
   - Triển khai file `src/cloud_sync.cpp` kết nối mạng Wi-Fi `Wokwi-GUEST` và Firebase RTDB theo hợp đồng `include/sync_interface.h`.

---
*Biên bản này được lập thành văn bản lưu tại kho mã nguồn dự án làm căn cứ nghiệm thu giai đoạn Milestone 2.*
