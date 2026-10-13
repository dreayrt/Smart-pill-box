# 📋 TÀI LIỆU KỸ THUẬT & KẾ HOẠCH TRIỂN KHAI
# HỘP ĐỰNG THUỐC THÔNG MINH (WOKWI SIMULATION)

> **Dự án**: IoT Hộp đựng thuốc thông minh – Mô phỏng Wokwi  
> **Nhóm thực hiện**: Nhóm 13  
> **Phiên bản tài liệu**: 1.0  
> **Mục tiêu cốt lõi**: Nhắc lịch uống thuốc, định tuyến đúng ngăn, xác minh số lượng lấy ra (mô phỏng) và đồng bộ Firebase phục vụ giám sát từ xa.

---

## MỤC LỤC
1. [Tổng quan hệ thống & Triết lý thiết kế](#1-tổng-quan-hệ-thống--triết-lý-thiết-kế)
   - [1.1. Bối cảnh & Bài toán](#11-bối-cảnh--bài-toán)
   - [1.2. Triết lý thiết kế quan trọng](#12-triết-lý-thiết-kế-quan-trọng)
   - [1.3. Luồng hoạt động & Cách thức người dùng sử dụng](#13-luồng-hoạt-động--cách-thức-người-dùng-sử-dụng)
2. [Kiến trúc kỹ thuật & Sơ đồ khối](#2-kiến-trúc-kỹ-thuật--sơ-đồ-khối)
3. [Danh sách linh kiện & Sơ đồ chân GPIO (Wokwi)](#3-danh-sách-linh-kiện--sơ-đồ-chân-gpio-wokwi)
4. [Cấu trúc dữ liệu (Data Schemas)](#4-cấu-trúc-dữ-liệu-data-schemas)
5. [Thiết kế Finite State Machine (FSM)](#5-thiết-kế-finite-state-machine-fsm)
6. [Quy tắc xử lý nghiệp vụ & Logic xác minh](#6-quy-tắc-xử-lý-nghiệp-vụ--logic-xác-minh)
7. [Các bước chuẩn bị chung cho nhóm](#7-các-bước-chuẩn-bị-chung-cho-nhóm)
8. [Phân công công việc cho 3 thành viên (Decoupled - Ít phụ thuộc nhất)](#8-phân-công-công-việc-cho-3-thành-viên-decoupled---ít-phụ-thuộc-nhất)
9. [Interface Contract (Hợp đồng giao diện giữa các thành viên)](#9-interface-contract-hợp-đồng-giao-diện-giữa-các-thành-viên)
10. [Ma trận kiểm thử (Test Matrix)](#10-ma-trận-kiểm-thử-test-matrix)
11. [Kịch bản Demo chi tiết](#11-kịch-bản-demo-chi-tiết)
12. [Giới hạn kỹ thuật & Cảnh báo an toàn](#12-giới-hạn-kỹ-thuật--cảnh-báo-an-toàn)
13. [Kế hoạch tiến độ 11 ngày](#13-kế-hoạch-tiến-độ-11-ngày)
14. [Bảng chú thích thuật ngữ kỹ thuật tiếng Anh (Glossary)](#14-bảng-chú-thích-thuật-ngữ-kỹ-thuật-tiếng-anh-glossary)

---

## 1. TỔNG QUAN HỆ THỐNG & TRIẾT LÝ THIẾT KẾ

### 1.1. Bối cảnh & Bài toán
Hệ thống giải quyết bài toán tuân thủ dùng thuốc ở bệnh nhân và người cao tuổi:
- Quên giờ uống thuốc hoặc uống nhầm giờ.
- Uống nhầm ngăn thuốc / nhầm loại thuốc.
- Uống sai liều (thiếu liều hoặc uống quá liều).
- Người nhà / bác sĩ không có công cụ giám sát lịch sử tuân thủ thực tế.

### 1.2. Triết lý thiết kế quan trọng
1. **Tách bạch giữa "Người dùng xác nhận" và "Hệ thống xác minh"**:
   - Thao tác bấm nút **TAKE** chỉ đại diện cho việc *người dùng khai báo* đã lấy thuốc.
   - Trạng thái hoàn thành hợp lệ chỉ được công nhận khi có **tín hiệu từ cảm biến / mô phỏng** ghi nhận đúng ngăn và đúng số lượng (`VERIFIED_BY_SIMULATION`).
2. **Khả năng hoạt động tự trị (Offline-First)**:
   - Toàn bộ lịch uống thuốc và máy trạng thái xử lý cục bộ qua chip thời gian thực RTC DS3231.
   - Khi mất kết nối Wi-Fi, thiết bị vẫn chuông báo, mở ngăn và ghi log vào buffer nội bộ. Khi tái lập kết nối, dữ liệu sẽ được đẩy bù (push sync) lên Firebase.
3. **Mô hình mô phỏng trung thực**:
   - Môi trường Wokwi không có thuốc vật lý thật và camera thị giác máy tính, do đó cơ chế xác minh số lượng được mô phỏng bằng các thao tác công tắc tín hiệu rời rạc đại diện cho cảm biến cân nặng / quang học.

### 1.3. Luồng hoạt động & Cách thức người dùng sử dụng

Hệ thống được thiết kế hướng tới **2 nhóm người dùng song hành**:
- **Người cao tuổi / Bệnh nhân**: Tương tác trực tiếp với hộp thuốc vật lý một cách đơn giản và an toàn nhất.
- **Người nhà / Bác sĩ quản lý**: Theo dõi lịch sử tuân thủ và cấu hình lịch trình từ xa qua Web Dashboard.

#### 1.3.1. Sơ đồ luồng hoạt động trực quan (High-Level Operational Flow)

```
                   [ BÌNH THƯỜNG (CHẾ ĐỘ CHỜ) ]
       Màn hình hiện giờ (07:59) + Nhiệt độ phòng + Khóa nắp
                                 │
                                 ▼
                     [ ĐẾN GIỜ UỐNG THUỐC (08:00) ]
        • Chuông kêu bíp bíp, đèn LED xanh nhấp nháy
        • Màn hình báo: "NGĂN A: THUỐC TIM / UỐNG 2 VIÊN"
                                 │
        ┌────────────────────────┴────────────────────────┐
        ▼ (Nếu đang bận)                                  ▼ (Muốn uống ngay)
[ BẤM NÚT SNOOZE ]                              [ BẤM NÚT TAKE ]
• Còi tắt ngay, hẹn lại 5 phút                  • Còi tắt
• Sau 5 phút chuông báo lại                     • Servo QUAY 90°: Mở nắp ngăn A
                                                          │
                                                          ▼
                                                [ BỆNH NHÂN LẤY THUỐC ]
                                                (Mô phỏng: Bấm nút REMOVE_UNIT)
                                                          │
                        ┌─────────────────────────────────┴─────────────────────────────────┐
                        ▼ (Lấy đủ 2 viên)                                                   ▼ (Lấy 1 viên hoặc quá 60s không lấy)
            [ XÁC MINH THÀNH CÔNG ]                                                 [ PHÁT HIỆN BẤT THƯỜNG ]
     • Màn hình: "ĐÃ LẤY ĐỦ LIỀU ✓"                                         • Màn hình: "CẢNH BÁO: THIẾU LIỀU!"
     • Còi bíp 1 tiếng xác nhận                                             • Đèn đỏ nháy, còi báo động dồn dập
     • Nắp tự đóng lại (Servo về 0°)                                        • Nắp tự đóng lại để bảo vệ ngăn
                        │                                                                   │
                        └─────────────────────────────────┬─────────────────────────────────┘
                                                          ▼
                                            [ ĐỒNG BỘ LÊN FIREBASE & WEB ]
                                 • Điện thoại người thân báo trạng thái ngay tức thì:
                                   - Xanh: "Đã uống đúng 2 viên ngăn A"
                                   - Đỏ: "Cảnh báo: Lấy thiếu liều / Quên lấy"
```

#### 1.3.2. Chu trình sử dụng thực tế của người bệnh (Chuẩn 3 bước cơ bản)

1. **Bước 1 - Nghe chuông & Đọc chỉ dẫn**:
   - Khi RTC khớp với lịch trình (ví dụ 08:00), hộp phát còi bíp ngắt quãng và nhấp nháy LED Xanh.
   - Màn hình LCD hiển thị rõ ràng: `NGAN A: MED-001` (dòng 1) và `LIEU: 2 VIEN` (dòng 2).
2. **Bước 2 - Bấm nút xác nhận mở nắp (`TAKE`)**:
   - Người bệnh bấm nút **`TAKE`** trên mặt hộp.
   - Chuông nhắc tắt, động cơ Servo xoay 90° để **chỉ mở duy nhất nắp ngăn A**. Các ngăn B và C vẫn bị khóa chặt để tránh lấy nhầm.
   - Màn hình chuyển sang chế độ hướng dẫn: `XAC MINH LIEU...` / `DA LAY: 0/2`.
3. **Bước 3 - Nhặt thuốc uống**:
   - Người bệnh nhặt lần lượt từng viên thuốc ra khỏi ngăn (trên Wokwi tương ứng việc nhấn nút `REMOVE_UNIT`).
   - Màn hình cập nhật theo thời gian thực: `DA LAY: 1/2` ➔ `DA LAY: 2/2`.
   - Khi đạt đủ liều, hệ thống thông báo **"DA LAY DUNG LIEU ✓"**, còi bíp dài xác nhận thân thiện.
   - Sau 3 giây, Servo tự động quay về 0° đóng nắp lại, hoàn tất chu trình.

#### 1.3.3. Xử lý các tình huống ngoại lệ & Cơ chế bảo vệ

- **Người bệnh đang bận (Chức năng `SNOOZE`)**:
  - Bấm nút **`SNOOZE`** ➔ Còi và đèn tắt ngay, nắp không mở.
  - Sau 5 phút, hệ thống tự kích hoạt chuông báo nhắc lại.
- **Người bệnh lấy thiếu liều (Bỏ quên viên thứ 2)**:
  - Nếu chỉ lấy 1/2 viên rồi bỏ đi, bộ đếm thời gian (Timeout 60s) hết hạn.
  - Hệ thống chuyển sang cảnh báo lỗi: LED Đỏ nhấp nháy, còi kêu dồn dập, màn hình báo `CANH BAO: THIEU!`.
  - Nắp tự động đóng lại để bảo quản thuốc còn lại. Log ghi nhận `MISMATCH_LESS`.
- **Người bệnh bấm đối phó (Bấm `TAKE` nhưng không lấy thuốc)**:
  - Nếu người bệnh bấm `TAKE` nhưng không thò tay lấy viên nào (không có xung `REMOVE_UNIT`).
  - Hết 60 giây, hệ thống ghi nhận `userConfirmed = true` nhưng `quantityMatch = false`, phát cảnh báo và gán nhãn sự kiện là `NO_DETECTION` gửi về Dashboard.
- **Sự cố mất kết nối mạng Wi-Fi**:
  - Hộp thuốc chạy tự trị bằng chip RTC DS3231 độc lập, vẫn chuông báo và mở nắp chuẩn xác từng giây.
  - Mọi sự kiện được lưu vào hàng đợi (Circular Queue) trong bộ nhớ ESP32. Khi có mạng trở lại, hệ thống tự động đẩy bù dữ liệu lên đám mây mà không mất mát thông tin.

#### 1.3.4. Trải nghiệm giám sát từ xa của Người nhà / Bác sĩ (Web Dashboard)

Người nhà theo dõi qua trang Web Dashboard trên điện thoại với 3 khu vực trực quan:
- **Trạng thái thiết bị**: Nhìn thấy ngay hộp thuốc đang Online/Offline, nhiệt độ và độ ẩm bên trong khoang thuốc (báo động nếu nhiệt độ > 35°C có nguy cơ làm hỏng thuốc).
- **Cấu hình lịch trình từ xa**: Có thể thay đổi giờ uống thuốc (ví dụ đổi từ 08:00 sang 08:30) hoặc chỉnh sửa số viên thuốc cần uống của từng ngăn. Hộp thuốc sẽ tự đồng bộ cấu hình mới từ Firebase.
- **Bảng nhật ký tuân thủ (Adherence Audit Log)**: Cập nhật tức thời mỗi khi người bệnh uống thuốc:
  - *Màu Xanh lá*: Uống đúng giờ, đúng ngăn, đủ liều (`VERIFIED_BY_SIMULATION`).
  - *Màu Vàng*: Đã bấm nút nhưng chưa xác minh được số viên (`USER_ONLY`).
  - *Màu Đỏ*: Uống thiếu liều, uống quá liều hoặc bỏ lỡ cữ thuốc (`MISMATCH` / `MISSED`).

---

## 2. KIẾN TRÚC KỸ THUẬT & SƠ ĐỒ KHỐI

```
                     ┌─────────────────────────────────────────────────────────┐
                     │                   WOKWI SIMULATION                      │
                     │                                                         │
  [RTC DS3231] ────┐ │ ┌─────────────────────────────────────────────────────┐ │
      (I2C)        ├─┼─┤                  ESP32 DevKit V1                    │ │
                   │ │ │                                                     │ │
  [DHT22] ─────────┼─┼─┤  • Task 1: FSM & Verification Logic (Core)          │ │
   (One-Wire)      │ │ │  • Task 2: Peripheral Driver & Display Controller   │ │
                   │ │ │  • Task 3: Network & Firebase Synchronization Engine│ │
  [Buttons (x7)] ──┼─┼─┤                                                     │ │
  • MENU, UP, DOWN │ │ └──────┬───────────────────────┬──────────────────────┘ │
  • TAKE, SNOOZE   │ │        │                       │                        │
  • LOAD, REMOVE   │ │        ▼                       ▼                        │
                   │ │  [LCD 1602 I2C]           [Actuators]                   │
                   │ │  (Hiển thị chỉ dẫn)       • Servo SG90 (Nắp ngăn)       │
                   │ │                           • Active Buzzer (Còi)         │
                   │ │                           • Status LEDs (Báo động/Nhắc) │
                   │ └─────────────────────────────────────────────────────────┘
                   │                              │  Wi-Fi / Wokwi-GUEST
                   │                              ▼
                   │                  ┌────────────────────────┐
                   │                  │ Firebase Realtime DB   │
                   │                  │ • /config/compartments │
                   │                  │ • /events/logs         │
                   │                  │ • /deviceStatus/tele   │
                   │                  └───────────┬────────────┘
                   │                              │ WebSocket / REST
                   │                              ▼
                   └──────────────────▶ ┌────────────────────────┐
                                        │ Web Dashboard (HTML/JS)│
                                        │ • Realtime Monitor     │
                                        │ • Lịch sử uống thuốc   │
                                        │ • Cảnh báo sai liều    │
                                        └────────────────────────┘
```

---

## 3. DANH SÁCH LINH KIỆN & SƠ ĐỒ CHÂN GPIO (WOKWI)

### 3.1. Danh mục linh kiện
| STT | Thiết bị | Vai trò | Chế độ Wokwi | Ghi chú kỹ thuật |
|---|---|---|---|---|
| 1 | ESP32-WROOM-32 | Vi điều khiển trung tâm | Có sẵn | Dual-core, tích hợp Wi-Fi |
| 2 | RTC DS3231 | Đồng hồ thời gian thực | Module I2C | Địa chỉ mặc định: `0x68` |
| 3 | LCD 16x2 I2C | Hiển thị thông báo, hướng dẫn | Module I2C | PCF8574, Địa chỉ: `0x27` |
| 4 | DHT22 | Giám sát nhiệt độ/độ ẩm hộp | Cảm biến số | Chân dữ liệu có Pull-up |
| 5 | Micro Servo SG90 | Mở/đóng khóa nắp ngăn thuốc | Động cơ PWM | Xoay 0° (Đóng) - 90° (Mở) |
| 6 | Active Buzzer | Âm thanh nhắc nhở, cảnh báo | Còi xung | Bíp theo nhịp trạng thái |
| 7 | LED Xanh lá | Đèn báo đến giờ uống thuốc | Linh kiện rời | Hạn dòng trở 220Ω |
| 8 | LED Đỏ | Đèn báo lỗi / sai liều | Linh kiện rời | Hạn dòng trở 220Ω |
| 9 | 5x Pushbutton | Điều khiển menu & người dùng | Phím bấm cơ | MENU, UP, DOWN, TAKE, SNOOZE |
| 10 | 2x Pushbutton | Mô phỏng cảm biến lấy/nạp | Phím bấm cơ | LOAD_UNIT, REMOVE_UNIT |

### 3.2. Sơ đồ phân bổ chân GPIO (ESP32)
| Chân ESP32 | Linh kiện kết nối | Chế độ pinMode | Mục đích sử dụng |
|---|---|---|---|
| **GPIO 21** | DS3231 SDA & LCD 1602 SDA | I2C Bus | Tuyến truyền dữ liệu nối tiếp I2C |
| **GPIO 22** | DS3231 SCL & LCD 1602 SCL | I2C Bus | Tuyến xung nhịp nối tiếp I2C |
| **GPIO 4** | DHT22 DATA | INPUT_PULLUP | Đọc dữ liệu môi trường khoang chứa |
| **GPIO 13** | Servo SG90 PWM | OUTPUT | Điều khiển góc quay nắp ngăn |
| **GPIO 2** | LED Xanh (Reminder) | OUTPUT | Sáng khi tới giờ nhắc uống |
| **GPIO 15** | LED Đỏ (Error/Warning) | OUTPUT | Nhấp nháy khi sai liều/quá thời gian |
| **GPIO 25** | Active Buzzer | OUTPUT | Âm báo theo mẫu (beep pattern) |
| **GPIO 26** | Button MENU | INPUT_PULLUP | Vào/thoát menu cấu hình cục bộ |
| **GPIO 27** | Button UP | INPUT_PULLUP | Cuộn lên / Tăng giá trị |
| **GPIO 14** | Button DOWN | INPUT_PULLUP | Cuộn xuống / Giảm giá trị |
| **GPIO 12** | Button TAKE | INPUT_PULLUP | Người dùng xác nhận "Tôi đang uống" |
| **GPIO 33** | Button SNOOZE | INPUT_PULLUP | Hoãn báo thức thêm 5-10 phút |
| **GPIO 32** | Button LOAD_UNIT | INPUT_PULLUP | Giả lập thêm 1 viên vào ngăn |
| **GPIO 35** | Button REMOVE_UNIT | INPUT_PULLUP | Giả lập lấy ra 1 viên từ ngăn |

> **Lưu ý**: Chân GPIO 35 trên ESP32 là chân Input-Only, không có điện trở kéo nội bộ trong chip vật lý; trên Wokwi cấu hình thêm điện trở kéo ngoài nếu cần, hoặc gắn nút nhấn nối GND.

---

## 4. CẤU TRÚC DỮ LIỆU (DATA SCHEMAS)

### 4.1. Structs trong mã nguồn C++ (ESP32)

```cpp
#pragma once
#include <Arduino.h>

// Danh sách trạng thái hệ thống
enum SystemState {
    STATE_IDLE,                 // Chờ bình thường, hiển thị đồng hồ + nhiệt ẩm
    STATE_REMINDER,             // Đang báo động đến giờ uống thuốc
    STATE_SNOOZED,              // Tạm hoãn thông báo
    STATE_COMPARTMENT_OPEN,     // Nắp ngăn đã mở, chờ lấy thuốc
    STATE_VERIFYING,            // Đang đối chiếu số lượng lấy ra
    STATE_VERIFIED,             // Lấy đúng số lượng, thành công
    STATE_ERROR,                // Sai số lượng (thiếu/thừa) hoặc timeout
    STATE_CLOSED                // Đã đóng nắp, hoàn tất chu trình
};

// Kết quả xác minh số lượng
enum VerifyResult {
    VERIFY_NONE,
    VERIFY_MATCH,               // Đúng số lượng yêu cầu
    VERIFY_LESS,                // Thiếu viên
    VERIFY_MORE,                // Lấy dư viên
    VERIFY_TIMEOUT              // Hết thời gian chờ mà chưa lấy
};

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

// Bản ghi sự kiện xác minh (Log Event)
struct VerificationEvent {
    char eventId[48];           // UUID dạng: "EVT-YYYYMMDD-HHMMSS-A"
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
```

### 4.2. Schema JSON trên Firebase Realtime Database

```json
{
  "config": {
    "compartments": {
      "A": {
        "compartmentId": "A",
        "medicineCode": "MED-001",
        "displayName": "Thuoc Tim Mach (gia lap)",
        "unitsPerDose": 2,
        "schedule": "08:00",
        "currentStock": 10,
        "isLoaded": true
      },
      "B": {
        "compartmentId": "B",
        "medicineCode": "MED-002",
        "displayName": "Vitamin C (gia lap)",
        "unitsPerDose": 1,
        "schedule": "12:00",
        "currentStock": 20,
        "isLoaded": true
      }
    },
    "settings": {
      "snoozeDurationMinutes": 5,
      "verifyTimeoutSeconds": 60,
      "tempAlertThreshold": 35.0,
      "humidAlertThreshold": 75.0
    }
  },
  "events": {
    "-O_abcd1234": {
      "eventId": "EVT-20261011-080000-A",
      "compartmentId": "A",
      "medicineCode": "MED-001",
      "expectedUnits": 2,
      "detectedUnits": 2,
      "compartmentMatch": true,
      "quantityMatch": true,
      "userConfirmed": true,
      "status": "VERIFIED_BY_SIMULATION",
      "timestamp": 1791720000,
      "syncedAt": 1791720005
    }
  },
  "deviceStatus": {
    "online": true,
    "lastSeen": 1791720010,
    "currentTemp": 27.5,
    "currentHumid": 62.0,
    "currentState": "STATE_IDLE",
    "activeAlarm": false
  }
}
```

---

## 5. THIẾT KẾ FINITE STATE MACHINE (FSM)

### 5.1. Sơ đồ dòng trạng thái (State Diagram)

```
        ┌────────────────────────────────────────────────────────┐
        │                                                        │
        ▼                                                        │
   ┌──────────┐      Khớp giờ RTC       ┌──────────────┐         │
   │  IDLE    │ ───────────────────────▶│   REMINDER   │         │
   └──────────┘                         └──────┬───────┘         │
        ▲                                      │                 │
        │                        ┌─────────────┴────────────┐    │
        │                        │ Nút TAKE      Nút SNOOZE │    │
        │                        ▼                          ▼    │
        │               ┌─────────────────┐       ┌─────────────┐│
        │               │COMPARTMENT_OPEN │       │   SNOOZED   ││
        │               │ (Servo quay 90°)│       │ (Chờ 5 phút)│┘
        │               └────────┬────────┘       └─────────────┘
        │                        │
        │         Nhấn REMOVE    ▼
        │         hoặc Timeout ┌──────────────┐
        │        ─────────────▶│  VERIFYING   │
        │                      └──────┬───────┘
        │                             │
        │              ┌──────────────┴──────────────┐
        │              │ Đủ liều                     │ Thiếu / Thừa / Timeout
        │              ▼                             ▼
        │       ┌──────────────┐              ┌──────────────┐
        │       │   VERIFIED   │              │    ERROR     │
        │       │ (LED Xanh ON)│              │ (LED Đỏ/Buz) │
        │       └──────┬───────┘              └──────┬───────┘
        │              │                             │
        │              │ Đóng nắp tự động            │ Xác nhận xóa lỗi
        │              ▼                             ▼
        │       ┌────────────────────────────────────────────┐
        └───────┤            STATE_CLOSED (Servo 0°)         │
                └────────────────────────────────────────────┘
```

### 5.2. Bảng ma trận chuyển trạng thái

| Trạng thái hiện tại | Sự kiện kích hoạt | Điều kiện kiểm tra | Trạng thái tiếp theo | Hành động thực thi |
|---|---|---|---|---|
| `STATE_IDLE` | RTC == Schedule | Đúng giờ cấu hình | `STATE_REMINDER` | Bật Buzzer ngắt quãng, nháy LED Xanh, LCD hiển thị tên thuốc & liều |
| `STATE_REMINDER` | Nhấn nút TAKE | Đúng lúc báo | `STATE_COMPARTMENT_OPEN` | Mở Servo ngăn tương ứng (90°), tắt chuông nhắc, LCD: "DANG MO NGAN..." |
| `STATE_REMINDER` | Nhấn nút SNOOZE | - | `STATE_SNOOZED` | Tắt Buzzer, hẹn giờ bù (5 phút), LCD: "DA HOAN LICH" |
| `STATE_REMINDER` | Quá thời gian (ví dụ 10p) | Không ai bấm | `STATE_ERROR` | Ghi log MISSED_DOSE, tắt còi, quay về IDLE |
| `STATE_SNOOZED` | Hết thời gian hoãn | millis() >= snoozeExpiry | `STATE_REMINDER` | Kích hoạt lại chuông và còi báo |
| `STATE_COMPARTMENT_OPEN` | Nhấn REMOVE_UNIT | - | `STATE_VERIFYING` | Tăng detectedUnits += 1, đếm thời gian kiểm tra |
| `STATE_VERIFYING` | detectedUnits == expectedUnits | Khớp số lượng | `STATE_VERIFIED` | LCD: "DA LAY DUNG LIỀU", Bíp 1 tiếng dài thành công, ghi log event |
| `STATE_VERIFYING` | detectedUnits > expectedUnits | Lấy dư thuốc | `STATE_ERROR` | LCD: "CANH BAO: THUA LIỀU", Nháy LED Đỏ, còi liên tục, ghi log |
| `STATE_VERIFYING` | Quá 60s timeout | detectedUnits < expected | `STATE_ERROR` | LCD: "CANH BAO: THIEU LIỀU", Nháy LED Đỏ, ghi log |
| `STATE_VERIFIED` | Trễ 3 giây | - | `STATE_CLOSED` | Quay Servo về 0° (đóng ngăn), chuẩn bị sync Firebase |
| `STATE_ERROR` | Nhấn nút MENU | Reset lỗi thủ công | `STATE_CLOSED` | Tắt LED Đỏ/còi, đóng Servo nắp |
| `STATE_CLOSED` | Hoàn tất | - | `STATE_IDLE` | Trả giao diện về màn hình mặc định |

---

## 6. QUY TẮC XỬ LÝ NGHIỆP VỤ & LOGIC XÁC MINH

1. **Xác minh nạp thuốc ban đầu**:
   - Mỗi ngăn có mã thuốc cố định (`medicineCode`).
   - Người cấu hình phải nạp thuốc vào ngăn thông qua thao tác giữ nút `LOAD_UNIT` hoặc cấu hình qua Dashboard. Ngăn chưa nạp (`isLoaded = false`) sẽ không mở khi đến giờ.
2. **Quy tắc bảo vệ ngăn (Compartment Locking)**:
   - Trong một thời điểm chỉ có ngăn tương ứng với lịch hiện tại được mở.
   - Khi có nhiều lịch cùng giờ, hệ thống mở tuần tự: hoàn tất ngăn thứ nhất mới cho phép mở ngăn thứ hai.
3. **Phân biệt logic nút TAKE vs nút REMOVE**:
   - Bấm `TAKE`: Chỉ thể hiện cam kết của người dùng (User Acknowledgement). Cờ `userConfirmed = true`.
   - Bấm `REMOVE_UNIT`: Mô phỏng tín hiệu cảm biến tải trọng/quang học ghi nhận viên thuốc đã rơi ra khỏi ngăn. Biến `detectedUnits` tăng lên.
   - Nếu bấm `TAKE` mà không bấm `REMOVE_UNIT`: Sau 60 giây hết hạn, hệ thống phân loại là `NO_DETECTION` hoặc `USER_ONLY` (nghi ngờ quên lấy thuốc thực sự).

---

## 7. CÁC BƯỚC CHUẨN BỊ CHUNG CHO NHÓM

Mọi thành viên cần hoàn thành các bước nền tảng này trong **Ngày 1**:

- [ ] **Bước 1: Thiết lập Kho lưu trữ (GitHub)**:
  - Tạo repository: `IoT-Smart-Pillbox-Wokwi`.
  - Thiết lập `.gitignore` cho C++/PlatformIO/Node.
  - Phân nhánh độc lập: `feat/firmware-core` (TV1), `feat/wokwi-ui` (TV2), `feat/cloud-dashboard` (TV3).
- [ ] **Bước 2: Cài đặt công cụ lập trình**:
  - VS Code cài đặt tiện ích mở rộng: *Wokwi Simulator*, *PlatformIO IDE*, *Live Server*.
  - Kiểm tra chạy được bản Wokwi "Blink LED ESP32" trên máy cá nhân.
- [ ] **Bước 3: Khởi tạo Firebase Project**:
  - Tạo project: `smart-pillbox-iot`.
  - Tạo Realtime Database (Location: `asia-southeast1` hoặc `us-central1`).
  - Phân quyền Rule mở cho thử nghiệm (hoặc cấu hình secret key).
- [ ] **Bước 4: Đóng băng Contract (`config.h` & Data Schemas)**:
  - Tất cả thành viên cam kết không tự ý đổi tên biến, mã chân GPIO và cấu trúc Struct khi chưa thảo luận chung.

---

## 8. PHÂN CÔNG CÔNG VIỆC CHO 3 THÀNH VIÊN
*(Tiêu chí: Module hóa cao, ít phụ thuộc chéo nhất, test độc lập được)*

### 👤 THÀNH VIÊN 1: FIRMWARE CORE & STATE LOGIC
> **Trách nhiệm chính**: Thiết kế bộ não điều khiển của ESP32 – Finite State Machine, quản lý lịch trình, thuật toán đối chiếu liều lượng.  
> **Phương pháp làm việc độc lập**: Viết mã logic thuần C++, kiểm thử thông qua Serial Monitor bằng cách nhập phím mô phỏng (ví dụ: gõ `'T'` thay cho bấm nút TAKE, gõ `'R'` thay cho REMOVE), không cần chờ mạch điện của TV2 hay Cloud của TV3.

#### Các Task cụ thể:
* **Task 1.1: Xây dựng Header định nghĩa dùng chung (`config.h`)**
  - Định nghĩa toàn bộ `enum`, `struct`, hằng số thời gian debounce, timeout.
  - Cung cấp mockup 3 ngăn thuốc mặc định (A: 08:00, B: 12:00, C: 20:00).
  - *Thời gian*: 0.5 ngày | *Độ ưu tiên*: Cực cao (Giao cho nhóm ngay buổi đầu).
* **Task 1.2: Triển khai động cơ Finite State Machine (`state_machine.cpp`)**
  - Viết hàm `fsm_init()`, `fsm_update()`, `fsm_changeState()`.
  - Xử lý chuyển trạng thái hoàn toàn dựa trên `millis()` (non-blocking). Tuyệt đối không dùng `delay()`.
  - Cung cấp getter trạng thái cho màn hình và Firebase đọc.
  - *Thời gian*: 1.5 ngày | *Độ ưu tiên*: Cao.
* **Task 1.3: Quản lý lịch trình & RTC Checker (`schedule.cpp`)**
  - Viết hàm so khớp thời gian thực với mảng cấu hình các ngăn thuốc.
  - Xử lý cơ chế SNOOZE (hoãn báo thức 5 phút).
  - Chống kích hoạt trùng lặp (Anti-double triggering) trong cùng 1 phút.
  - *Thời gian*: 1 ngày | *Độ ưu tiên*: Cao.
* **Task 1.4: Bộ giải thuật xác minh liều lượng (`verification.cpp`)**
  - Xử lý đếm xung lấy thuốc, so sánh `detectedUnits` với `expectedUnits`.
  - Xử lý timeout đối chiếu (60s).
  - Phát sinh đối tượng `VerificationEvent` đầy đủ tham số để gửi đi.
  - *Thời gian*: 1 ngày | *Độ ưu tiên*: Cao.
* **Task 1.5: Bộ kiểm thử giả lập đầu vào Serial (Mock Test Harness)**
  - Viết chế độ debug: Nhận ký tự qua Serial (`T` = TAKE, `R` = REMOVE, `S` = SNOOZE, `L` = LOAD) để chạy thử toàn bộ FSM độc lập trên terminal Wokwi.
  - *Thời gian*: 0.5 ngày | *Độ ưu tiên*: Trung bình.

---

### 👤 THÀNH VIÊN 2: MẠCH WOKWI & TRÌNH ĐIỀU KHIỂN PHẦN CỨNG (I/O DRIVERS)
> **Trách nhiệm chính**: Thiết kế file mạch `diagram.json`, viết các module điều khiển ngoại vi (LCD 16x2, Servo SG90, Còi, Đèn, Cảm biến DHT22, Lọc rung phím bấm).  
> **Phương pháp làm việc độc lập**: Viết mã driver độc lập kèm một file `test_hardware.cpp` riêng biệt. Bấm nút thật trên Wokwi kiểm tra màn hình hiển thị text mẫu, servo quay đúng góc, còi kêu đúng mẫu, không cần phụ thuộc vào logic state machine của TV1.

#### Các Task cụ thể:
* **Task 2.1: Thiết kế mạch điện Wokwi hoàn chỉnh (`diagram.json`)**
  - Đặt linh kiện: ESP32, DS3231, LCD 16x2 I2C, DHT22, Servo SG90, 2 LED, Buzzer, 7 nút bấm.
  - Đi dây chính xác theo bảng GPIO ở Mục 3.
  - Thêm nhãn (labels) trên diagram để phân biệt các nút bấm trực quan.
  - *Thời gian*: 1 ngày | *Độ ưu tiên*: Cực cao.
* **Task 2.2: Module xử lý phím bấm chống rung (`button_handler.cpp`)**
  - Quản lý đọc 7 nút bấm với thuật toán lọc rung phần mềm (Debounce 50ms bằng `millis()`).
  - Trả về sự kiện dạng Event (`BTN_TAKE_PRESSED`, `BTN_REMOVE_PRESSED`, v.v.).
  - Bắt sự kiện nhấn đơn, nhấn giữ.
  - *Thời gian*: 1 ngày | *Độ ưu tiên*: Cao.
* **Task 2.3: Module hiển thị LCD 16x2 (`display_manager.cpp`)**
  - Viết các hàm hiển thị theo màn hình chức năng:
    - `display_showHome(hour, min, temp, humid)`
    - `display_showReminder(compartment, medicineName, dose)`
    - `display_showVerifying(current, target)`
    - `display_showResult(success, message)`
  - Xử lý chuỗi ký tự không dấu hoặc tùy biến icon đặc biệt.
  - *Thời gian*: 1 ngày | *Độ ưu tiên*: Cao.
* **Task 2.4: Module chấp hành: Servo & Báo động (`actuator_driver.cpp`)**
  - Điều khiển Servo góc 0° (đóng) và 90° (mở) mượt mà.
  - Điều khiển Buzzer theo mẫu: 3 bíp ngắn (nhắc lịch), 1 bíp dài (lỗi), 2 bíp ngắn (thành công).
  - Điều khiển nhấp nháy LED Xanh (nhắc) và LED Đỏ (lỗi) bất đồng bộ.
  - *Thời gian*: 1 ngày | *Độ ưu tiên*: Trung bình.
* **Task 2.5: Đọc cảm biến môi trường DHT22 (`environment_sensor.cpp`)**
  - Đọc chu kỳ 2 giây/lần. Xử lý trường hợp cảm biến mất kết nối (fallback an toàn không gây treo hệ thống).
  - *Thời gian*: 0.5 ngày | *Độ ưu tiên*: Thấp.

---

### 👤 THÀNH VIÊN 3: CLOUD SYNC & WEB DASHBOARD
> **Trách nhiệm chính**: Thiết lập Firebase Realtime Database, phát triển Web Dashboard theo dõi và module đồng bộ mạng trên ESP32.  
> **Phương pháp làm việc độc lập**: Thiết kế Web Dashboard tương tác trực tiếp với Firebase bằng JavaScript SDK. Tạo sẵn một script Python/NodeJS nhỏ hoặc ấn nút trực tiếp trên Firebase Console để bơm dữ liệu sự kiện giả lập (`mock events`), qua đó hoàn thiện Dashboard lung linh mà không cần đợi ESP32 của TV1 & TV2 kết nối.

#### Các Task cụ thể:
* **Task 3.1: Thiết lập & Phân quyền Firebase RTDB**
  - Khởi tạo Database, thiết lập quy tắc bảo mật (Security Rules).
  - Khởi tạo dữ liệu schema mẫu `/config`, `/events`, `/deviceStatus`.
  - Cung cấp file cấu hình mẫu `credentials.example.h` cho firmware.
  - *Thời gian*: 0.5 ngày | *Độ ưu tiên*: Cực cao.
* **Task 3.2: Module mạng & Đồng bộ Firebase trên ESP32 (`cloud_sync.cpp`)**
  - Kết nối Wi-Fi Wokwi (`Wokwi-GUEST`).
  - Gửi `VerificationEvent` lên nhánh `/events`.
  - Cập nhật định kỳ nhiệt độ, độ ẩm, trạng thái máy lên `/deviceStatus`.
  - **Cơ chế Offline Buffer**: Tạo hàng đợi (Queue vòng tròn 10 phần tử) trong RAM. Khi mất Wi-Fi thì lưu vào Queue; khi có lại Wi-Fi tự động đẩy toàn bộ sự kiện tồn đọng lên Firebase.
  - *Thời gian*: 2 ngày | *Độ ưu tiên*: Cao.
* **Task 3.3: Xây dựng giao diện Web Dashboard (`index.html`, `style.css`, `app.js`)**
  - Giao diện hiện đại (Dark theme hoặc Medical-clean theme), hiển thị theo thời gian thực (Firebase Realtime listener):
    - Khối trạng thái thiết bị: Online/Offline, nhiệt độ, độ ẩm hiện tại.
    - Khối mô phỏng trạng thái 3 ngăn thuốc (A, B, C) kèm lịch và lượng thuốc còn lại.
    - Bảng nhật ký sự kiện uống thuốc (Event Log): Cột Thời gian, Ngăn, Mã thuốc, Liều dự kiến, Liều lấy thực tế, Trạng thái (`VERIFIED_BY_SIMULATION`, `MISMATCH`, ...).
    - Huy hiệu phân loại màu: Xanh lá (Đúng liều), Đỏ (Sai liều/Thiếu liều), Vàng (Chỉ bấm TAKE).
  - *Thời gian*: 2 ngày | *Độ ưu tiên*: Cao.
* **Task 3.4: Xây dựng chức năng cấu hình từ xa trên Dashboard**
  - Form cho phép người dùng thay đổi giờ uống thuốc hoặc đổi tên thuốc, bấm lưu sẽ cập nhật nhánh `/config/compartments` trên Firebase.
  - *Thời gian*: 1 ngày | *Độ ưu tiên*: Trung bình.
* **Task 3.5: Trình giả lập dữ liệu kiểm thử (Mock Data Generator Script)**
  - Viết file `mock_push.js` để đẩy các sự kiện test vào Firebase kiểm tra khả năng hiển thị của Dashboard.
  - *Thời gian*: 0.5 ngày | *Độ ưu tiên*: Thấp.

---

## 9. INTERFACE CONTRACT (HỢP ĐỒNG GIAO DIỆN GIỮA CÁC THÀNH VIÊN)

Đây là ranh giới kỹ thuật để 3 thành viên làm việc song song mà không xung đột:

### 9.1. Giao tiếp giữa TV2 (Hardware Driver) và TV1 (Core Logic)
File: `hardware_interface.h`
```cpp
#pragma once
#include "config.h"

// TV2 cung cấp các hàm này để TV1 gọi:
void hw_initAll();
ButtonEvent hw_getButtonEvent();          // Lấy sự kiện bấm phím gần nhất
void hw_setServoLock(bool open);          // true: mở 90 độ, false: đóng 0 độ
void hw_setAlarmReminder(bool active);     // Bật/tắt còi và LED nhắc lịch
void hw_setAlarmError(bool active);        // Bật/tắt còi và LED cảnh báo lỗi
void hw_displayIdle(int h, int m, float t, float hmd);
void hw_displayReminder(const char* comp, const char* medName, int dose);
void hw_displayVerifying(int detected, int expected);
void hw_displayResult(bool success, const char* msg);
void hw_getEnvData(float &outTemp, float &outHumid);
```

### 9.2. Giao tiếp giữa TV1 (Core Logic) và TV3 (Cloud Sync)
File: `sync_interface.h`
```cpp
#pragma once
#include "config.h"

// TV3 cung cấp các hàm này để TV1 gọi trong loop():
void cloud_init();
void cloud_loop();                                // Duy trì kết nối, xử lý đẩy queue
bool cloud_isOnline();                            // Trả về true nếu Wi-Fi & Firebase kết nối OK
void cloud_pushEvent(const VerificationEvent &ev); // Đẩy log sự kiện lấy thuốc
void cloud_updateTelemetry(float t, float h, SystemState st); // Đẩy đo nhiệt ẩm
bool cloud_fetchCompartmentConfig(MedicationCompartment* outList, int maxCount);
```

---

## 10. MA TRẬN KIỂM THỬ (TEST MATRIX)

| Mã TC | Tên ca kiểm thử | Điều kiện đầu vào | Hành vi hệ thống mong đợi | Kết quả hợp lệ | Phụ trách chính |
|---|---|---|---|---|---|
| **TC-01** | Báo thức đúng giờ | RTC nhảy tới 08:00 (Lịch ngăn A) | Chuyển `STATE_REMINDER`, LED Xanh nhấp nháy, Buzzer bíp 3 tiếng, LCD hiện thông tin thuốc A | Khớp màn hình & còi kêu | TV1 + TV2 |
| **TC-02** | Hoãn báo thức (Snooze) | Bấm nút `SNOOZE` lúc đang nhắc | Còi tắt, chuyển `STATE_SNOOZED`, LCD thông báo hoãn 5 phút. Sau 5 phút báo động lại | Không mất lịch đang chờ | TV1 |
| **TC-03** | Mở đúng ngăn chỉ định | Bấm nút `TAKE` lúc đang nhắc ngăn A | Servo quay 90° mở ngăn A, LCD chuyển sang màn hình chờ lấy thuốc | Servo mở đúng góc | TV2 |
| **TC-04** | Lấy thuốc đủ liều (Chuẩn) | Ngăn A yêu cầu 2 viên, bấm `REMOVE_UNIT` 2 lần | Hệ thống đếm đủ 2/2 viên, chuyển `STATE_VERIFIED`, bíp dài xác nhận, đóng nắp sau 3s, gửi log Firebase | Log `VERIFIED_BY_SIMULATION` | Cả 3 |
| **TC-05** | Lấy thiếu liều | Ngăn A yêu cầu 2 viên, bấm `REMOVE_UNIT` 1 lần rồi đợi hết 60s | Hết timeout chuyển `STATE_ERROR`, nhấp nháy LED Đỏ, còi cảnh báo, ghi log lỗi | Log `MISMATCH_LESS` | TV1 |
| **TC-06** | Lấy thừa liều | Ngăn B yêu cầu 1 viên, bấm `REMOVE_UNIT` 2 lần | Chuyển ngay sang `STATE_ERROR`, báo động thừa liều, đóng nắp, ghi log | Log `MISMATCH_MORE` | TV1 |
| **TC-07** | Nhấn TAKE gian lận | Bấm `TAKE` nhưng không nhấn `REMOVE_UNIT` (chờ 60s) | Không tính là đã lấy thuốc. Ghi nhận `userConfirmed = true` nhưng `quantityMatch = false` | Log `NO_DETECTION` | TV1 |
| **TC-08** | Mất kết nối Wi-Fi | Ngắt mạng mô phỏng Wokwi | Thiết bị vẫn chạy lịch bình thường, log được lưu tạm vào hàng đợi nội bộ | Không treo vi điều khiển | TV3 |
| **TC-09** | Tái lập mạng Wi-Fi | Bật lại kết nối mạng sau TC-08 | Hệ thống tự reconnect, đẩy toàn bộ log từ hàng đợi lên Firebase | Log xuất hiện trên Dashboard | TV3 |
| **TC-10** | Cảnh báo môi trường DHT22 | Tăng nhiệt độ trên thanh trượt DHT22 > 35°C | Cảnh báo môi trường hiển thị trên LCD và cập nhật cờ cảnh báo trên Dashboard | Không ảnh hưởng đến tiến trình uống thuốc | TV2 + TV3 |

---

## 11. KỊCH BẢN DEMO CHI TIẾT
*(Thời lượng trình diễn đề xuất: 5 - 7 phút)*

### Phần 1: Khởi động & Giới thiệu tổng quan (1 phút)
1. Bật mô phỏng Wokwi.
2. LCD hiển thị: `HOP THUOC IOT` -> Chuyển sang màn hình Idle: Đồng hồ `07:59:50`, Nhiệt độ `28°C`, Độ ẩm `65%`, biểu tượng Wi-Fi OK.
3. Mở tab Web Dashboard: Hiển thị trạng thái Online, 3 ngăn thuốc đã nạp sẵn cấu hình từ Firebase.

### Phần 2: Kịch bản vàng – Đúng ngăn, đúng liều (2 phút)
1. Đồng hồ RTC nhảy qua `08:00:00`:
   - Chuông Buzzer bíp bíp, LED Xanh chớp tắt.
   - LCD: `NGAN A: MED-001 / LIEU: 2 VIEN`.
   - Web Dashboard hiển thị cảnh báo: "Đang đến giờ uống thuốc ngăn A".
2. Người thao tác bấm nút **TAKE**:
   - Còi tắt. Động cơ Servo quay 90° mở nắp ngăn A.
   - LCD: `XAC MINH LIEU... / DA LAY: 0/2`.
3. Người thao tác bấm nút **REMOVE_UNIT** lần 1:
   - LCD: `DA LAY: 1/2`.
4. Người thao tác bấm nút **REMOVE_UNIT** lần 2:
   - LCD: `DA LAY: 2/2 -> XAC MINH XONG!`.
   - LED Xanh sáng đứng, còi bíp dài 1 tiếng thân thiện.
   - Servo quay về 0° đóng nắp lại.
5. Kiểm tra Web Dashboard:
   - Một dòng Log mới màu xanh lá xuất hiện ngay lập tức: `EVT-... | Ngan A | Med-001 | 2/2 | VERIFIED_BY_SIMULATION`.

### Phần 3: Kịch bản bất thường – Lấy thiếu liều & Cảnh báo (1.5 phút)
1. Giả lập lịch tiếp theo hoặc ép giờ RTC tới lịch ngăn B (yêu cầu 2 viên).
2. Khi còi nhắc, bấm nút **TAKE** (Servo mở).
3. Người thao tác chỉ bấm nút **REMOVE_UNIT** đúng 1 lần (Lấy thiếu 1 viên).
4. Để quá thời gian Timeout (giảm xuống 15 giây khi demo để tránh chờ lâu):
   - Đèn LED Đỏ chớp liên tục, Buzzer phát âm thanh cảnh báo lỗi ngắt quãng ngắn dồn dập.
   - LCD: `CANH BAO: THIEU / CHI LAY: 1/2!`.
   - Servo đóng nắp lại để bảo vệ ngăn.
5. Kiểm tra Web Dashboard:
   - Log màu đỏ xuất hiện: `MISMATCH_LESS | Lay 1/2 | Warning Issued`.

### Phần 4: Kịch bản mất mạng & Đồng bộ bù (1.5 phút)
1. Ngắt kết nối Wi-Fi trên mô phỏng.
2. Thực hiện một ca uống thuốc thành công. Hệ thống hiển thị trên LCD: `Luu Offline...`.
3. Bật lại Wi-Fi.
4. Trong vòng 5 giây, Web Dashboard tự động nhảy thêm sự kiện vừa lưu offline lên đầu danh sách nhật ký mà không cần refresh trang.

---

## 12. GIỚI HẠN KỸ THUẬT & CẢNH BÁO AN TOÀN

> ⚠️ **TUYÊN BỐ MIỄN TRỪ TRÁCH NHIỆM & GIỚI HẠN DỰ ÁN**:
> 1. **Mục đích học tập**: Đồ án này là mô hình mô phỏng học thuật trên nền tảng Wokwi, nhằm nghiên cứu kiến trúc hệ thống nhúng IoT và logic máy trạng thái. **Đây không phải là thiết bị y tế được kiểm định.**
> 2. **Bản chất của nút nhấn mô phỏng**: Nút bấm `REMOVE_UNIT` trên Wokwi chỉ đóng vai trò kích hoạt sự kiện phần mềm mô phỏng sự suy giảm số lượng. Khi triển khai ra mạch vật lý thực tế:
>    - Cần tích hợp cảm biến lực Loadcell + IC khuếch đại HX711 dưới đáy từng ngăn thuốc.
>    - Bắt buộc phải trải qua quá trình cân chỉnh (Calibration) cụ thể theo trọng lượng từng dạng viên thuốc (viên nang, viên nén).
>    - Cảm biến cân nặng chỉ đo được khối lượng, không thể nhận dạng thành phần hóa học hay tên thuốc nếu người nạp nạp sai thuốc ngay từ đầu.
> 3. **Bảo mật cơ sở dữ liệu**:
>    - Không lưu trữ khóa API bí mật của Firebase (`FIREBASE_AUTH` hoặc Service Account JSON) trực tiếp trên kho mã nguồn công khai (Public GitHub).
>    - Cần cấu hình file `.env` hoặc file `secrets.h` được liệt kê trong `.gitignore`.
> 4. **An toàn người bệnh**: Không bao giờ sử dụng hệ thống này để tự động hóa cấp phát thuốc kê đơn thực tế cho bệnh nhân khi chưa có sự giám sát của chuyên gia y tế và các chứng chỉ an toàn y khoa.

---

## 13. KẾ HOẠCH TIẾN ĐỘ 11 NGÀY

```
┌─────────┬──────────────────────────────┬──────────────────────────────┬──────────────────────────────┐
│ Ngày    │ Thành viên 1 (Core FSM)      │ Thành viên 2 (Wokwi & I/O)   │ Thành viên 3 (Cloud & Web)   │
├─────────┼──────────────────────────────┼──────────────────────────────┼──────────────────────────────┤
│ 1       │ Viết config.h, chốt enum     │ Vẽ diagram.json mạch Wokwi   │ Tạo Firebase RTDB, test JSON │
│ 2 - 3   │ Code state_machine.cpp       │ Viết driver Button & LCD     │ Code cloud_sync.cpp (ESP32)  │
│ 4 - 5   │ Code schedule & verification │ Viết driver Servo, Buzzer,LED│ Code giao diện Web Dashboard │
│ 6 - 7   │ Test FSM qua Serial Mock     │ Test hardware driver trên Wok│ Kết nối Realtime JS Firebase │
│ 8       │ ───────────── GIAO ĐOẠN GHÉP NỐI: TÍCH HỢP TOÀN BỘ CODE VÀO MAIN.CPP ──────────────│
│ 9       │ Chạy kiểm thử TC-01 -> TC-07 │ Sửa lỗi phần cứng & hiển thị │ Kiểm tra đồng bộ Offline     │
│ 10      │ Tối ưu hóa bộ nhớ RAM/ROM    │ Viết kịch bản Demo chi tiết  │ Hoàn thiện biểu đồ Dashboard │
│ 11      │ Tổng duyệt Demo thử nghiệm lần cuối, hoàn thiện báo cáo và Slide thuyết trình       │
└─────────┴──────────────────────────────┴──────────────────────────────┴──────────────────────────────┘
```

---

## 14. BẢNG CHÚ THÍCH THUẬT NGỮ KỸ THUẬT TIẾNG ANH (GLOSSARY)

Bảng dưới đây giải thích chi tiết các thuật ngữ chuyên ngành tiếng Anh xuất hiện trong tài liệu và mã nguồn, phục vụ việc viết báo cáo, thuyết trình và trao đổi kỹ thuật:

### 14.1. Hệ thống nhúng & Vi điều khiển (Embedded Systems & Hardware)

| Thuật ngữ tiếng Anh | Viết tắt / Từ gốc | Nghĩa tiếng Việt | Giải thích ngữ cảnh kỹ thuật trong đồ án |
|---|---|---|---|
| **Microcontroller Unit (MCU)** | MCU | Vi điều khiển | Con chip xử lý trung tâm (ở đây là ESP32), tích hợp CPU, RAM, Flash và các ngoại vi I/O trên cùng một đế bán dẫn. |
| **Firmware** | - | Phần mềm nhúng | Mã nguồn C/C++ được biên dịch và nạp trực tiếp vào bộ nhớ Flash của ESP32 để điều khiển phần cứng. |
| **General Purpose Input/Output** | GPIO | Chân vào/ra đa dụng | Các chân vật lý trên ESP32 dùng để đọc tín hiệu từ nút nhấn/cảm biến hoặc xuất tín hiệu điều khiển LED/còi/động cơ. |
| **Inter-Integrated Circuit** | I2C / I²C | Chuẩn giao tiếp 2 dây | Giao thức truyền thông nối tiếp đồng bộ dùng 2 đường dây: SDA (Dữ liệu) và SCL (Xung nhịp), kết nối chung RTC DS3231 và LCD 16x2. |
| **Real-Time Clock** | RTC | Đồng hồ thời gian thực | Module phần cứng chuyên biệt (DS3231) đếm giờ/phút/giây chính xác, có pin dự phòng để không mất giờ khi cúp điện. |
| **Pulse Width Modulation** | PWM | Điều chế độ rộng xung | Phương pháp thay đổi độ rộng của xung điện áp để điều khiển vị trí góc quay của động cơ Servo SG90 (0° đến 90°). |
| **Actuator** | - | Cơ cấu chấp hành | Thiết bị cơ/điện biến tín hiệu điều khiển thành chuyển động hoặc cảnh báo thực tế (ví dụ: Servo, Buzzer, LED). |
| **Active Buzzer** | - | Còi chủ động | Loại còi chỉ cần cấp mức điện áp HIGH là tự động phát ra tiếng kêu với tần số định sẵn mà không cần vi điều khiển tạo sóng âm. |
| **Pull-up Resistor / INPUT_PULLUP** | - | Điện trở kéo lên | Điện trở nối chân GPIO lên nguồn VCC (3.3V). Khi nút bấm chưa nhấn, chân ở mức HIGH; khi nhấn nút (nối đất), chân chuyển về mức LOW. |
| **Debouncing (Button Debounce)** | Debounce | Lọc rung tiếp điểm cơ học | Kỹ thuật phần mềm (dùng `millis()`) loại bỏ hiện tượng tiếp điểm kim loại của nút nảy nhiều lần gây ra việc nhận diện bấm nút sai liên tiếp. |
| **Non-blocking / Non-blocking loop** | - | Không chặn luồng thực thi | Phong cách lập trình điều khiển thời gian bằng biến `millis()` thay vì dùng lệnh `delay()`, giúp ESP32 xử lý đồng thời nhiều ngoại vi. |
| **Load Cell & HX711** | - | Cảm biến tải trọng & IC khuếch đại ADC | Cảm biến đo trọng lượng bằng cầu biến dạng điện trở kết hợp mạch khuếch đại 24-bit (phần cứng đề xuất khi làm mạch thật ngoài đời). |
| **Calibration** | - | Hiệu chuẩn / Cân chỉnh | Quá trình xác định hệ số chuyển đổi từ giá trị thô của cảm biến (raw ADC) sang đơn vị thực tế (gam, viên thuốc). |

### 14.2. Kiến trúc phần mềm & Giải thuật (Software Architecture & Patterns)

| Thuật ngữ tiếng Anh | Viết tắt / Từ gốc | Nghĩa tiếng Việt | Giải thích ngữ cảnh kỹ thuật trong đồ án |
|---|---|---|---|
| **Finite State Machine** | FSM | Máy trạng thái hữu hạn | Mô hình kiến trúc phần mềm mà hệ thống chỉ nằm ở một trong số các trạng thái hữu hạn (`IDLE`, `REMINDER`, `VERIFYING`,...) tại một thời điểm. |
| **State Transition** | - | Sự chuyển đổi trạng thái | Hành vi hệ thống nhảy từ trạng thái A sang trạng thái B khi có sự kiện (Event) kích hoạt và thỏa mãn điều kiện canh gác (Guard condition). |
| **Decoupled Architecture** | Decoupling | Kiến trúc phân rã / Giảm phụ thuộc | Cách tổ chức mã nguồn và phân chia nhiệm vụ sao cho các module hoặc thành viên làm việc độc lập, ít bị ràng buộc chéo. |
| **Interface Contract** | - | Hợp đồng giao diện | Bản đặc tả các kiểu dữ liệu (`struct`), tên hàm, tham số và giá trị trả về đã thống nhất trước, dùng làm ranh giới bàn giao giữa các nhóm. |
| **Mock / Mocking** | Mock | Kỹ thuật giả lập đối tượng | Việc tạo dữ liệu giả hoặc cơ chế kích hoạt giả (ví dụ: gõ ký tự Terminal thay cho bấm nút) để kiểm thử một module mà không cần module kia sẵn sàng. |
| **Test Harness** | - | Khung kiểm thử tự động / Độc lập | Một đoạn chương trình nhỏ viết riêng nhằm đưa các tín hiệu đầu vào nhân tạo vào hàm cần test để kiểm tra tính đúng đắn. |
| **Timeout** | - | Hết thời gian chờ tối đa | Cơ chế đếm lùi thời gian (ví dụ: 60s); nếu quá hạn mà người dùng không thao tác, hệ thống tự động hủy hoặc chuyển trạng thái lỗi (`ERROR`). |
| **Anti-Double Triggering** | - | Cơ chế chống kích hoạt trùng lặp | Thuật toán ngăn việc cùng một lịch uống thuốc (ví dụ lúc 08:00) bị báo động lặp đi lặp lại nhiều lần trong cùng một phút. |
| **Circular Queue / Buffer** | - | Hàng đợi vòng tròn / Vùng đệm | Cấu trúc dữ liệu FIFO cố định trong RAM dùng để lưu tạm các sự kiện khi mất kết nối mạng. |
| **Offline-First** | - | Ưu tiên chạy ngoại tuyến | Triết lý thiết kế hệ thống đảm bảo mọi chức năng cốt lõi (báo giờ, mở ngăn, xác minh) vẫn hoạt động bình thường khi mất Wi-Fi. |

### 14.3. Đám mây & Ứng dụng Web (Cloud, IoT & Web Applications)

| Thuật ngữ tiếng Anh | Viết tắt / Từ gốc | Nghĩa tiếng Việt | Giải thích ngữ cảnh kỹ thuật trong đồ án |
|---|---|---|---|
| **Realtime Database** | RTDB | Cơ sở dữ liệu thời gian thực | Dịch vụ cơ sở dữ liệu phi quan hệ (NoSQL) của Google Firebase lưu trữ dạng cây JSON và tự động đồng bộ tức thì đến các client. |
| **Telemetry** | - | Dữ liệu đo đạc từ xa | Dữ liệu trạng thái hoạt động định kỳ của thiết bị gửi về đám mây, bao gồm: nhiệt độ khoang, độ ẩm, trạng thái máy, ping `lastSeen`. |
| **Realtime Listener (`onValue`)** | - | Bộ lắng nghe sự kiện thời gian thực | Cơ chế WebSocket của Firebase JS SDK trên trình duyệt giúp Web tự động cập nhật ngay khi ESP32 ghi một bản ghi mới lên RTDB. |
| **Single Page Application** | SPA | Ứng dụng web một trang | Trang web Dashboard tải trang một lần duy nhất (`index.html`), các nội dung dữ liệu thay đổi linh hoạt bằng JavaScript mà không cần reload trang. |
| **Data Synchronization (Sync)** | Sync | Đồng bộ hóa dữ liệu | Tiến trình truyền nhận và cập nhật hai chiều giữa dữ liệu cục bộ trên ESP32 và cơ sở dữ liệu trên Firebase. |
| **Security Rules** | - | Quy tắc bảo mật CSDL | Tập luật khai báo trên Firebase cấu hình quyền truy cập (Read/Write) vào các đường dẫn dữ liệu để chống xâm nhập trái phép. |

### 14.4. Thuật ngữ nghiệp vụ Hộp thuốc (Healthcare & Domain Specific)

| Thuật ngữ tiếng Anh | Viết tắt / Từ gốc | Nghĩa tiếng Việt | Giải thích ngữ cảnh kỹ thuật trong đồ án |
|---|---|---|---|
| **Dosage / Dose** | - | Liều lượng chỉ định | Số lượng đơn vị thuốc (viên/gói) cần phải uống trong một lần theo cấu hình (ví dụ: 2 viên). |
| **Compartment** | - | Ngăn chứa thuốc | Khoang chứa riêng biệt bên trong hộp thuốc (được đánh nhãn A, B, C), mỗi khoang có nắp khóa điều khiển bởi động cơ riêng. |
| **Schedule** | - | Lịch trình uống thuốc | Mốc thời gian định kỳ được cài đặt (giờ:phút) để hệ thống tự động kích hoạt chuông nhắc. |
| **Snooze** | - | Hoãn báo thức | Hành vi người dùng nhấn phím để tạm dừng chuông nhắc hiện tại và yêu cầu hệ thống nhắc lại sau một khoảng thời gian (5 - 10 phút). |
| **Stock / Inventory** | - | Lượng thuốc tồn kho | Tổng số viên thuốc còn lại bên trong ngăn thuốc; giảm dần sau mỗi lần lấy thuốc thành công. |
| **User Confirmation** | - | Người dùng tự xác nhận | Sự kiện người dùng nhấn nút `TAKE`. Đây chỉ là lời khai báo của người dùng, chưa chứng minh đã lấy thuốc đúng. |
| **Sensor Verification** | - | Sự xác minh từ cảm biến | Việc hệ thống kiểm chứng khách quan số lượng thuốc thực tế lấy ra qua cảm biến/mô phỏng trước khi đóng nắp và ghi nhận thành công. |
| **Adherence / Compliance** | - | Mức độ tuân thủ dùng thuốc | Chỉ số đánh giá người bệnh có uống đúng giờ, đúng loại và đúng liều quy định hay không thông qua lịch sử lưu trữ. |

---
*Tài liệu được soạn thảo phục vụ triển khai đồ án môn học IoT - Nhóm 13.*

