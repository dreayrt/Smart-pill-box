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
│   ├── verification.h      <-- Thuật toán xác minh số lượng liều thuốc & timeout 60s
│   └── state_machine.h     <-- Động cơ máy trạng thái hữu hạn (FSM)
│
├── src/                    <-- MÃ NGUỒN THỰC THI (.cpp)
│   ├── main.cpp            <-- Hàm setup() & loop(), trình kiểm thử Mock qua Serial
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
| **`1`** | Nhảy đồng hồ tới **08:00:00** | Kích hoạt lịch uống **Ngăn A** (Thuốc Tim Mạch - 2 viên). Chuông bíp, LED xanh sáng. |
| **`2`** | Nhảy đồng hồ tới **12:00:00** | Kích hoạt lịch uống **Ngăn B** (Vitamin C - 1 viên). |
| **`3`** | Nhảy đồng hồ tới **20:00:00** | Kích hoạt lịch uống **Ngăn C** (Canxi Nano - 1 viên). |
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

### Kịch bản 1: Luồng chuẩn – Uống đúng giờ, lấy đủ 2 viên
1. Gõ **`1`** ➔ Đến 08:00, chuông báo nhắc cữ thuốc Ngăn A.
2. Gõ **`T`** (hoặc click nút TAKE xanh lá) ➔ Chuông tắt, Servo xoay 90° mở nắp.
3. Gõ **`R`** lần 1 ➔ Console báo: *Tiến độ: 1/2 viên*.
4. Gõ **`R`** lần 2 ➔ Console báo: *Tiến độ: 2/2 viên*.
5. **Quan sát kết quả**:
   - Hệ thống thông báo: **`DA LAY DU LIEU ✓`**.
   - **Đèn LED xanh bật sáng** xác nhận thành công.
   - Kho thuốc ngăn A tự động trừ đi 2 viên.
   - Sau đúng 3 giây: Đèn xanh tắt, Servo tự quay về 0° đóng nắp, đẩy sự kiện lên Cloud và trở về chế độ chờ (`IDLE`).

### Kịch bản 2: Người bệnh đang bận – Hoãn báo thức (Snooze)
1. Gõ **`1`** ➔ Chuông báo nhắc lịch.
2. Gõ **`S`** (hoặc click nút SNOOZE vàng) ➔ Chuông tắt ngay, hệ thống vào trạng thái `SNOOZED` trong 5 phút.

### Kịch bản 3: Phát hiện bất thường – Uống quá liều
1. Gõ **`2`** ➔ Nhắc lịch Ngăn B (chỉ được uống 1 viên).
2. Gõ **`T`** ➔ Mở nắp.
3. Gõ **`R`** 2 lần liên tiếp (Lấy 2 viên trong khi đơn chỉ cho 1 viên).
4. **Quan sát kết quả**:
   - Hệ thống báo động: **`CANH BAO: THUA LIEU!`**.
   - **Đèn LED đỏ sáng rực**, còi hú báo động.
   - Nắp Servo tự động đóng lại để bảo quản số thuốc còn lại.
5. Gõ **`M`** (hoặc click nút MENU đỏ) để tắt còi báo lỗi.

---