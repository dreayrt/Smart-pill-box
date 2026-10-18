# 📜 BIÊN BẢN BÀN GIAO KỸ THUẬT & NGHIỆM THU CÔNG VIỆC
### (TECHNICAL HANDOVER COMPACT & DELIVERABLES REPORT - MEMBER 3)

> **Dự án**: IoT Hộp Đựng Thuốc Thông Minh (Wokwi & ESP32)  
> **Người thực hiện (Bên bàn giao)**: **Thành viên 3 (Hải)** – Phụ trách *Cloud Sync & Web Dashboard*  
> **Người tiếp nhận (Bên nhận bàn giao)**: **Thành viên 1** (Core Logic) & **Thành viên 2** (Hardware Drivers) & Giảng viên / Hội đồng đánh giá  
> **Thời điểm chốt kết quả (Freeze Timestamp)**: Tháng 10/2026  
> **Tình trạng nghiệm thu**: ✅ **HOÀN THÀNH 100% – HỆ THỐNG ĐÃ NỐI THÔNG TOÀN DIỆN (PASS)**

---

## 1. TỔNG HỢP KẾT QUẢ ĐẠT ĐƯỢC (EXECUTIVE SUMMARY)

Thành viên 3 đã hoàn thành toàn bộ khối **Hạ tầng Đám mây Firebase Realtime Database**, **Trình điều khiển Mạng & Đồng bộ ESP32**, và **Giao diện Web Dashboard Giám sát Từ xa**, hiện thực hóa 100% hợp đồng giao diện `sync_interface.h` và hoàn tất tích hợp nối thông toàn bộ 3 thành viên:

- ✅ **Hạ tầng Firebase Realtime Database (Task 3.1)**:
  - Khởi tạo Database tại vùng `asia-southeast1`, thiết lập Security Rules cho phép truyền nhận an toàn.
  - Chuẩn hóa cấu trúc cây dữ liệu thời gian thực:
    - `/config/compartments/{A, B, C}`: Lịch uống, liều lượng, số viên tồn kho, trạng thái nạp.
    - `/config/settings`: Cấu hình thời gian hoãn Snooze (5p), Timeout (60s), ngưỡng cảnh báo ($T > 35^\circ\text{C}$, $H > 75\%$).
    - `/deviceStatus`: Cập nhật nhịp tim Telemetry (nhiệt độ, độ ẩm buồng thuốc, trạng thái máy FSM, còi báo động, `lastSeen`).
    - `/events/{eventId}`: Nhật ký các phiên uống thuốc thực tế.
- ✅ **Module Mạng & Đồng bộ ESP32 ([src/cloud_sync.cpp](file:///d:/Hai/study/IOT/DA/src/cloud_sync.cpp) - Task 3.2)**:
  - Tự động kết nối Wi-Fi Wokwi (`Wokwi-GUEST`) hoặc Wi-Fi thực tế qua HTTPS REST Client an toàn.
  - **Cơ chế Offline-First Buffer (Bộ đệm ngoại tuyến)**: Thiết kế hàng đợi vòng tròn **Circular Queue (10 phần tử)** trong RAM. Khi mất mạng Wi-Fi, sự kiện được lưu tạm vào bộ đệm; khi tái lập kết nối mạng, hệ thống tự động phát hiện và đẩy bù (batch/flush) toàn bộ log tồn đọng lên Firebase mà không làm mất mát dữ liệu.
  - Cập nhật định kỳ Telemetry mỗi 10 giây bất đồng bộ non-blocking, không gây trễ luồng điều khiển FSM.
- ✅ **Giao diện Web Dashboard Giám sát ([dashboard/index.html](file:///d:/Hai/study/IOT/DA/dashboard/index.html) - Task 3.3)**:
  - Phong cách thiết kế Medical Clean Theme hiện đại, đáp ứng tốt trên cả máy tính và điện thoại.
  - Lắng nghe thời gian thực (Realtime WebSocket) 100% dữ liệu từ Firebase, không sử dụng dữ liệu giả lập (hardcoded mock data).
  - Khối Telemetry giám sát nhiệt độ & độ ẩm phòng; tự động đổi viền đỏ cảnh báo khi nhiệt độ $T > 35^\circ\text{C}$.
  - Khối giám sát 3 ngăn thuốc A, B, C kèm thanh đo lượng thuốc tồn kho trực quan.
  - Bảng nhật ký tuân thủ dùng thuốc (Adherence Audit Log) tự động nhảy dòng mới khi có sự kiện, phân loại màu sắc y tế: Xanh lá (Đúng liều), Đỏ (Sai liều/Thiếu liều/Quá liều), Vàng (Không phát hiện lấy thuốc).
- ✅ **Cấu hình Lịch trình Từ xa (Task 3.4)**:
  - Hộp thoại Modal cho phép người nhà hoặc bác sĩ điều chỉnh giờ uống thuốc, liều lượng (viên/lần), lượng thuốc tồn kho của từng ngăn và cập nhật trực tiếp lên Firebase.
- ✅ **Nối thông Toàn bộ Hệ thống (System Integration)**:
  - Đã hợp nhất mã nguồn giữa TV1, TV2 và TV3 tại nhánh chính `main`.
  - Toàn bộ chu trình từ phần cứng Wokwi ➔ ESP32 ➔ Firebase ➔ Web Dashboard vận hành trơn tru.
- ✅ **Chỉ số tài nguyên ESP32 sau khi tích hợp toàn bộ hệ thống**:
  - **RAM sử dụng**: `49,104 bytes` (**15.0%** dung lượng RAM ESP32).
  - **Flash bộ nhớ**: `969,657 bytes` (**74.0%** dung lượng Flash ESP32).
  - **Trạng thái Build**: `PlatformIO [SUCCESS] 0 Error, 0 Warning`.

---

## 2. DANH MỤC SẢN PHẨM BÀN GIAO (DELIVERABLES INVENTORY)

| STT | File mã nguồn / Cấu hình | Loại sản phẩm | Vai trò kỹ thuật của TV3 | Trạng thái |
|:---:|---|:---:|---|:---:|
| 1 | [`dashboard/index.html`](file:///d:/Hai/study/IOT/DA/dashboard/index.html) | Web Application | Giao diện Single Page Application giám sát & quản trị từ xa | **Hoàn tất chuẩn hóa** |
| 2 | [`dashboard/style.css`](file:///d:/Hai/study/IOT/DA/dashboard/style.css) | Stylesheet | Hệ thống giao diện y tế cao cấp (Medical Clean Dark Theme) | **Hoàn tất 100%** |
| 3 | [`dashboard/app.js`](file:///d:/Hai/study/IOT/DA/dashboard/app.js) | Web Controller | Lắng nghe Firebase Realtime WebSocket, xử lý giao diện & Modal cấu hình | **Hoàn tất 100%** |
| 4 | [`src/cloud_sync.cpp`](file:///d:/Hai/study/IOT/DA/src/cloud_sync.cpp) | Firmware Driver | Trình điều khiển kết nối Wi-Fi, HTTPS REST Firebase, bộ đệm Offline Queue | **Đã Unit & System Test** |
| 5 | [`include/sync_interface.h`](file:///d:/Hai/study/IOT/DA/include/sync_interface.h) | Interface Contract | Hợp đồng giao tiếp giữa FSM và Cloud Sync | **Đóng băng (Frozen)** |
| 6 | [`include/credentials.example.h`](file:///d:/Hai/study/IOT/DA/include/credentials.example.h) | Template Config | File cấu hình mẫu thông tin Wi-Fi và Firebase Host / Secret | **Đã phát hành** |
| 7 | [`scripts/mock_push.js`](file:///d:/Hai/study/IOT/DA/scripts/mock_push.js) | Test Script | Script Node.js kiểm thử truyền thông độc lập với Firebase | **Pass HTTP 200** |
| 8 | [`src/main.cpp`](file:///d:/Hai/study/IOT/DA/src/main.cpp) | Tích hợp chung | Kết nối liên hoàn ngoại vi phần cứng, máy trạng thái FSM và Cloud Sync | **Chạy thông suốt** |
| 9 | [`platformio.ini`](file:///d:/Hai/study/IOT/DA/platformio.ini) | Build Config | Cấu hình thư viện `ArduinoJson` phục vụ truyền nhận dữ liệu | **Build PASS** |
| 10| [`.gitignore`](file:///d:/Hai/study/IOT/DA/.gitignore) | Bảo mật | Ngăn chặn việc lộ file `credentials.h` chứa Database Secret lên GitHub | **Bảo mật an toàn** |

---

## 3. MA TRẬN KẾT QUẢ KIỂM THỬ ĐÁM MÂY & WEB (TEST ACCEPTANCE MATRIX)

Toàn bộ các ca kiểm thử thuộc phạm vi trách nhiệm của Thành viên 3 (Mục 10 tài liệu kỹ thuật) đã được nghiệm thu thực tế:

| Mã TC | Kịch bản kiểm thử | Hành vi thực tế ghi nhận | Kết quả |
|:---:|---|---|:---:|
| **TC-04** | Uống thuốc đủ liều (Luồng chuẩn) | Bệnh nhân lấy đủ 2 viên ngăn A ➔ ESP32 gửi bản ghi lên Firebase, trên Web Dashboard lập tức xuất hiện dòng sự kiện màu xanh: `Ngăn A | 2/2 viên | Đúng liều lượng ✓` | **PASS** |
| **TC-05** | Bệnh nhân lấy thiếu liều | Chỉ lấy 1/2 viên rồi đợi hết timeout 60s ➔ Web Dashboard nhảy sự kiện màu đỏ: `Ngăn A | 1/2 viên | Lấy thiếu liều` | **PASS** |
| **TC-06** | Bệnh nhân lấy quá liều | Ngăn B yêu cầu 1 viên nhưng lấy 2 viên ➔ Web Dashboard nhảy sự kiện màu đỏ: `Ngăn B | 2/1 viên | Lấy quá liều` | **PASS** |
| **TC-07** | Bấm TAKE nhưng không lấy thuốc | Bấm TAKE mở nắp nhưng không lấy viên nào ➔ Hết 60s, Web Dashboard ghi nhận sự kiện màu vàng: `Không phát hiện lấy thuốc` | **PASS** |
| **TC-08** | Mất kết nối mạng Wi-Fi (Offline) | Ngắt kết nối mạng Wokwi ➔ Thiết bị vẫn chuông báo, mở nắp và đếm số viên bình thường; sự kiện được lưu an toàn vào Offline Circular Queue trong RAM, ESP32 không bị treo | **PASS** |
| **TC-09** | Tái lập kết nối mạng Wi-Fi | Bật lại kết nối mạng ➔ `cloud_loop()` tự động reconnect, tự động đẩy bù toàn bộ sự kiện từ hàng đợi lên Firebase; Dashboard hiển thị đầy đủ các sự kiện vừa uống offline | **PASS** |
| **TC-10** | Giám sát nhiệt độ & Quá nhiệt DHT22 | Chỉnh thanh trượt DHT22 $T > 35^\circ\text{C}$ ➔ Web Dashboard lập tức đổi viền đỏ và hiển thị cảnh báo: `Cảnh báo: Vượt ngưỡng an toàn (> 35°C)` | **PASS** |
| **TC-14** | Cấu hình lịch uống từ xa | Bác sĩ thay đổi giờ uống trên Web Dashboard ➔ Nhấn "Lưu thay đổi", dữ liệu được cập nhật thành công lên nhánh `/config/compartments` của Firebase | **PASS** |

---

## 4. HỢP ĐỒNG GIAO DIỆN & CẤU TRÚC DỮ LIỆU ĐÃ ĐÓNG BĂNG

Thành viên 3 cam kết **đóng băng (Freeze)** toàn bộ giao diện truyền thông tại file [`include/sync_interface.h`](file:///d:/Hai/study/IOT/DA/include/sync_interface.h):

```cpp
// 1. Khởi tạo mạng Wi-Fi và client Firebase
void cloud_init();

// 2. Vòng lặp duy trì kết nối, ping nhịp tim và tự động đẩy bù hàng đợi ngoại tuyến
void cloud_loop();

// 3. Kiểm tra trạng thái mạng trực tuyến
bool cloud_isOnline();

// 4. Đẩy bản ghi sự kiện xác minh uống thuốc lên /events
void cloud_pushEvent(const VerificationEvent &ev);

// 5. Cập nhật dữ liệu đo đạc nhiệt ẩm và trạng thái máy lên /deviceStatus
void cloud_updateTelemetry(float t, float h, SystemState st);

// 6. Tải cấu hình các ngăn thuốc từ xa từ nhánh /config/compartments
bool cloud_fetchCompartmentConfig(MedicationCompartment* outList, int maxCount);
```

---

## 5. CAM KẾT & XÁC NHẬN BÀN GIAO HỆ THỐNG

1. **Bên bàn giao (Thành viên 3 - Hải)**:
   - Cam kết toàn bộ mã nguồn Web Dashboard và Module mạng ESP32 hoạt động đúng đặc tả kỹ thuật, không gây rò rỉ bộ nhớ (memory leak), mã nguồn sạch sẽ và tuân thủ chuẩn thẩm mỹ y tế.
   - Cam kết bảo mật thông tin tài khoản Firebase (đã tách riêng file credentials mẫu và file credentials thực tế qua `.gitignore`).
2. **Trạng thái kho mã nguồn**:
   - Nhánh chính **`main`** đã tích hợp toàn bộ thành quả của 3 thành viên và đã được đẩy lên GitHub thành công.
   - Hệ thống sẵn sàng 100% cho việc nghiệm thu, báo cáo đồ án và trình diễn Demo trực tiếp.

---
*Biên bản này được lập thành văn bản lưu tại kho mã nguồn dự án làm căn cứ nghiệm thu giai đoạn Milestone 3 (Giai đoạn hoàn thành toàn dự án).*
