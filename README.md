# 💊 HỘP ĐỰNG THUỐC THÔNG MINH (SMART PILLBOX)
### HƯỚNG DẪN CÀI ĐẶT & CHẠY DỰ ÁN (GETTING STARTED & RUN GUIDE)

> **Dự án**: IoT Hộp Đựng Thuốc Thông Minh – Mô phỏng Wokwi & ESP32  
> **Nhóm thực hiện**: Nhóm 13  
> **Mục tiêu**: Giám sát lịch uống thuốc, định tuyến ngăn, kiểm tra số lượng và đồng bộ dữ liệu đám mây (Firebase).

---

## 📌 1. YÊU CẦU MÔI TRƯỜNG & CÔNG CỤ (PREREQUISITES)

Để chạy được dự án trên máy cá nhân, các thành viên cần chuẩn bị:

1. **Visual Studio Code** (Phiên bản mới nhất).
2. **Cài đặt 2 Extensions bắt buộc trên VS Code**:
   - 🐜 **PlatformIO IDE** (ID: `platformio.platformio-ide`): Dùng để quản lý thư viện và biên dịch mã nguồn C++ cho ESP32.
   - ⚡ **Wokwi Simulator** (ID: `wokwi.wokwi-vscode`): Dùng để mô phỏng mạch điện và vi điều khiển trực quan trên VS Code.
3. **Lưu ý quan trọng**: Khi mở thư mục dự án lần đầu, nếu thấy chữ **`Restricted Mode`** ở góc dưới cùng bên trái màn hình VS Code, bạn hãy **click chuột vào đó và chọn "Trust"** để mở khóa các tiện ích mở rộng.

---

## 📂 2. CẤU TRÚC THƯ MỤC DỰ ÁN

```text
e:\IoT\
├── README.md               <-- Tài liệu hướng dẫn sử dụng nhanh này
├── platformio.ini          <-- Cấu hình PlatformIO (ESP32, Baudrate 115200, Thư viện)
├── wokwi.toml              <-- File liên kết PlatformIO và Wokwi Simulator
├── diagram.json            <-- Sơ đồ mạch điện mô phỏng trên Wokwi
│
├── include/                <-- CHỨA CÁC FILE HEADER (.h) & CONTRACT DÙNG CHUNG
│   ├── config.h            <-- Khai báo Enum trạng thái (FSM), Struct dữ liệu toàn hệ thống
│   ├── hardware_interface.h<-- Hợp đồng giao tiếp giữa TV1 và TV2 (Driver phần cứng)
│   ├── sync_interface.h    <-- Hợp đồng giao tiếp giữa TV1 và TV3 (Firebase Cloud)
│   ├── schedule.h          <-- Quản lý giờ hẹn uống thuốc & Snooze 5 phút
│   ├── time_service.h      <-- Đồng hồ hệ thống: NTP, DS3231 và múi giờ UTC+7
│   ├── verification.h      <-- Thuật toán xác minh số lượng liều thuốc & timeout 60s
│   └── state_machine.h     <-- Động cơ máy trạng thái hữu hạn (FSM)
│
├── src/                    <-- MÃ NGUỒN THỰC THI (.cpp)
│   ├── main.cpp            <-- Hàm setup() & loop(), trình kiểm thử Mock qua Serial
│   ├── time_service.cpp    <-- NTP, DS3231 dự phòng và thời gian địa phương UTC+7
│   ├── state_machine.cpp   <-- Xử lý chuyển đổi 8 trạng thái hệ thống
│   ├── schedule.cpp        <-- Cấu hình 3 ngăn A, B, C và so khớp giờ RTC
│   ├── verification.cpp    <-- Đếm xung thuốc và đóng gói sự kiện VerificationEvent
│   └── hardware.cpp        <-- Trình điều khiển GPIO: LED Xanh/Đỏ, Còi, Servo, Nút bấm
│
└── docs/                   <-- Tài liệu kỹ thuật đặc tả & dự toán kinh phí
    ├── Tai_lieu_ky_thuat_Hop_thuoc_thong_minh.md
    └── Bang_du_toan_chi_phi_va_linh_kien_thuc_te.md
```

---

## 🚀 3. HƯỚNG DẪN CHẠY DỰ ÁN (CHỈ VỚI 2 BƯỚC)

### Bước 1: Biên dịch mã nguồn (Build)
* **Cách 1 (Bằng nút bấm)**: Nhìn xuống thanh trạng thái màu xanh dương ở mép dưới cùng của VS Code, click vào biểu tượng **dấu tích (`✔`)** để biên dịch.
* **Cách 2 (Bằng Terminal)**: Mở Terminal (`Ctrl + ~`) và chạy lệnh:
  ```powershell
  & "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run
  ```
* Khi thấy dòng chữ **`[SUCCESS]`** màu xanh lá là firmware đã sẵn sàng.

### Bước 2: Khởi động mô phỏng Wokwi
* Mở file **`diagram.json`** trong cây thư mục VS Code.
* Nhìn lên góc trên bên trái khung sơ đồ mạch, bấm vào **nút tròn Play (▶️ màu xanh lá)**.
* Mô phỏng sẽ chạy ngay lập tức, hiển thị mạch điện và mở màn hình **Serial Monitor**.

---

## 🕹️ 4. HƯỚNG DẪN TƯƠNG TÁC & KIỂM THỬ HỆ THỐNG

Bạn có thể điều khiển và test hệ thống bằng **2 cách song song**:

### Cách A: Gõ phím vào ô nhập của Serial Monitor
Khi mô phỏng khởi động, Serial Monitor sẽ hiển thị bảng menu:

| Phím gõ | Chức năng mô phỏng | Hành vi hệ thống |
|:---:|---|---|
| **`1`** | Thử chuông **Ngăn A** | Dùng cấu hình hiện tại; không thay đổi giờ thật. |
| **`2`** | Thử chuông **Ngăn B** | Dùng cấu hình hiện tại; không thay đổi giờ thật. |
| **`3`** | Thử chuông **Ngăn C** | Dùng cấu hình hiện tại; không thay đổi giờ thật. |
| **`T`** | Bấm nút **TAKE** | Người bệnh xác nhận uống thuốc. **Servo mở 90°**. |
| **`R`** | Bấm nút **REMOVE_UNIT** | Cảm biến phát hiện rơi 1 viên thuốc ra khỏi ngăn. |
| **`S`** | Bấm nút **SNOOZE** | Tạm hoãn báo thức 5 phút. Tắt chuông ngay lập tức. |
| **`M`** | Bấm nút **MENU** | Xác nhận xóa cảnh báo lỗi khi có sự cố. |
| **`L`** | Xem tồn kho (**LOAD/INFO**) | In bảng danh sách số viên thuốc còn lại trong 3 ngăn. |
| **`?`** | Xem trợ giúp | In lại bảng phím tắt này ra console. |

### Cách B: Click chuột trực tiếp vào các linh kiện trên mạch Wokwi
Bạn có thể dùng chuột click trực tiếp vào 4 nút bấm trên sơ đồ mạch:
- 🟢 Nút **`TAKE (D12)`**: Mở khóa nắp ngăn.
- 🟡 Nút **`SNOOZE (D33)`**: Hoãn chuông.
- 🔵 Nút **`REMOVE (D35)`**: Giả lập thò tay nhặt 1 viên thuốc.
- 🔴 Nút **`MENU (D26)`**: Reset lỗi.

---

## 🧪 5. CÁC KỊCH BẢN KIỂM THỬ MẪU (TEST CASES)

### Kịch bản 1: Luồng chuẩn – Uống đúng giờ, lấy đủ liều Ngăn A
1. Gõ **`1`** ➔ Thử chuông nhắc của Ngăn A; đồng hồ hệ thống giữ nguyên giờ thật.
2. Gõ **`T`** (hoặc click nút TAKE xanh lá) ➔ Chuông tắt, Servo xoay 90° mở nắp.
3. Gõ **`R`** đủ số lần theo liều đang cấu hình cho Ngăn A; ví dụ liều 2 viên thì lần 1 báo *1/2*, lần 2 báo *2/2*.
4. **Quan sát kết quả**:
   - Hệ thống thông báo: **`DA LAY DU LIEU ✓`**.
   - **Đèn LED xanh bật sáng** xác nhận thành công.
   - Kho thuốc ngăn A tự động trừ số viên bằng liều đã cấu hình.
   - Sau đúng 3 giây: Đèn xanh tắt, Servo tự quay về 0° đóng nắp, đẩy sự kiện lên Cloud và trở về chế độ chờ (`IDLE`).

### Kịch bản 2: Người bệnh đang bận – Hoãn báo thức (Snooze)
1. Gõ **`1`** ➔ Thử chuông nhắc của Ngăn A.
2. Gõ **`S`** (hoặc click nút SNOOZE vàng) ➔ Chuông tắt ngay, hệ thống vào trạng thái `SNOOZED` trong 5 phút.

### Kịch bản 3: Phát hiện bất thường – Uống quá liều
1. Gõ **`2`** ➔ Thử chuông Ngăn B (cấu hình hiện tại cho phép 1 viên mỗi liều).
2. Gõ **`T`** ➔ Mở nắp.
3. Gõ **`R`** 2 lần liên tiếp (Lấy 2 viên trong khi đơn chỉ cho 1 viên).
4. **Quan sát kết quả**:
   - Hệ thống báo động: **`CANH BAO: THUA LIEU!`**.
   - **Đèn LED đỏ sáng rực**, còi hú báo động.
   - Nắp Servo tự động đóng lại để bảo quản số thuốc còn lại.
5. Gõ **`M`** (hoặc click nút MENU đỏ) để tắt còi báo lỗi.

## Đồng bộ cấu hình và tồn kho với thiết bị

- Dashboard lưu tên thuốc, mã thuốc, giờ uống, liều và trạng thái nạp tại Firebase `/config/compartments`. Firmware tải khi khởi động/kết nối lại và kiểm tra lại mỗi 15 giây khi FSM ở `STATE_IDLE`.
- Tồn kho đã xác nhận được lưu riêng tại `/inventory/compartments/{A,B,C}`. Lần đầu chuyển sang cấu trúc này, firmware lấy số tồn kho cũ trong `/config/compartments` làm dữ liệu ban đầu nếu chưa có số mới.
- Khi sửa tồn kho trong modal, Dashboard tạo lệnh đặt số lượng đích (0–100 viên) tại `/inventoryCommands/pending/{commandId}`. ESP32 xử lý khi rảnh, lưu tồn kho và mã lệnh vào NVS, cập nhật `/inventory/compartments`, rồi ghi trạng thái `applied` tại `/inventoryCommands/status/{A,B,C}`. Dashboard báo chờ cho đến khi nhận xác nhận.
- Hãy sửa tồn kho từ modal Dashboard; không sửa trực tiếp `/inventory/compartments` trong Firebase Console vì ESP32 không xem thay đổi trực tiếp đó là lệnh điều chỉnh.
- Sau khi xác minh lấy thuốc thành công, ESP32 trừ liều khỏi tồn kho và đồng bộ số mới. Nút `LOAD` cộng tối đa 10 viên, giới hạn 100 viên, rồi đồng bộ. Khi mất mạng, ESP32 giữ số mới và trạng thái cần gửi lại trong NVS.
- Cần cho phép quyền Firebase hiện có đọc/ghi các đường dẫn mới `/inventory` và `/inventoryCommands` theo cách phù hợp với cấu hình bảo mật dự án. Nếu HTTP bị từ chối, Serial Monitor sẽ ghi mã lỗi; Dashboard sẽ tiếp tục thể hiện trạng thái chưa được ESP32 xác nhận.
- Thông báo lưu cấu hình trên web chỉ xác nhận Firebase đã nhận thay đổi; trạng thái tồn kho được hiển thị riêng theo xác nhận của thiết bị. Cấu hình giờ/liều mới có hiệu lực khi firmware nhận ở `STATE_IDLE`.

## Đồng hồ thật và hoạt động khi mất mạng

- Khi khởi động, firmware khôi phục thời gian hợp lệ từ RTC DS3231. Khi Wi-Fi có Internet, NTP đồng bộ giờ hệ thống và cập nhật DS3231; màn hình hiển thị theo múi giờ Việt Nam (UTC+7).
- Nếu RTC chưa được cài giờ và NTP chưa đồng bộ, LCD/Serial báo `TIME_INVALID`; firmware không kích hoạt nhắc theo giờ giả.
- Cấu hình lịch A/B/C hợp lệ từ Firebase được lưu vào NVS. Khi mất Wi-Fi hoặc khởi động offline, thiết bị vẫn dùng lịch gần nhất đã lưu. Khóa nhắc được tính theo ngày để lịch được phép lặp vào hôm sau.
- Nếu chưa từng tải được lịch Firebase hợp lệ và chưa có bản cache NVS, giờ mẫu mặc định trong firmware sẽ không kích hoạt nhắc.
- Phím `1/2/3` chỉ thử chuông tương ứng, không chỉnh giờ. Hệ thống còn dùng `millis()` cho các khoảng thời gian ngắn như snooze 5 phút và timeout thao tác.
- **Duy trì nhắc khi mất điện cần UPS/power-path cấp cho ESP32, LCD, RTC, còi, cảm biến, LED và servo. Mục tiêu đã chọn là 4 giờ**, nhưng sơ đồ Wokwi và BOM hiện chưa có bộ UPS hoàn chỉnh hay phép đo tải. Chưa thể xác nhận thời lượng 4 giờ cho đến khi lắp mạch thật và đo cả lúc Wi-Fi truyền, còi kêu, servo quay.
- Nếu mất điện lâu hơn thời lượng UPS và thiết bị tắt qua giờ hẹn, firmware hiện không tự phát nhắc bù sau khi khởi động lại. Pin CR2032 trên DS3231 chỉ giữ giờ, không nuôi ESP32/LCD/còi/servo.
- Xem [kế hoạch đồng hồ và nguồn dự phòng](docs/Ke_hoach_dong_ho_thoi_gian_thuc.md) để biết trạng thái triển khai và các bước nghiệm thu phần cứng.

---
