# Tài liệu kỹ thuật: Hộp thuốc thông minh

| Thuộc tính | Giá trị |
|---|---|
| Dự án | IoT Hộp thuốc thông minh |
| Nền tảng | ESP32 DevKit, PlatformIO và mô phỏng Wokwi |
| Nhóm | 13 |
| Cập nhật | 18-10-2026 |
> **Trạng thái:** Firmware có các luồng nhắc thuốc, giờ RTC/NTP, đồng bộ Firebase và Dashboard. Nguồn dự phòng 4 giờ chưa được lắp; kiểm thử chạy trên board thật còn cần thực hiện.

## Mục lục

1. [Tổng quan và phạm vi](#1-tổng-quan-và-phạm-vi)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Linh kiện và sơ đồ GPIO](#3-linh-kiện-và-sơ-đồ-gpio)
4. [Cấu trúc mã nguồn](#4-cấu-trúc-mã-nguồn)
5. [Đồng hồ và lịch uống](#5-đồng-hồ-và-lịch-uống)
6. [Máy trạng thái và luồng xác minh](#6-máy-trạng-thái-và-luồng-xác-minh)
7. [Cấu trúc dữ liệu](#7-cấu-trúc-dữ-liệu)
8. [Đồng bộ Firebase và tồn kho](#8-đồng-bộ-firebase-và-tồn-kho)
9. [Chạy và thao tác mô phỏng](#9-chạy-và-thao-tác-mô-phỏng)
10. [Giới hạn và an toàn](#10-giới-hạn-và-an-toàn)
11. [Tiến độ và tài liệu liên quan](#11-tiến-độ-và-tài-liệu-liên-quan)
12. [Thuật ngữ](#12-thuật-ngữ)

---

## 1. Tổng quan và phạm vi

Hệ thống gồm hộp thuốc ba ngăn A/B/C, ESP32, màn hình LCD, cảm biến nhiệt độ/độ ẩm, RTC, nút bấm, còi, đèn và một servo mô phỏng cơ cấu khóa. Firmware nhắc theo giờ, mở khóa khi người dùng bấm TAKE, đếm số lần tín hiệu REMOVE và ghi sự kiện lên Firebase. Dashboard hiển thị trạng thái, lịch sử và cho phép sửa cấu hình lịch hoặc gửi yêu cầu cập nhật tồn kho.

### 1.1. Nguyên tắc vận hành

- **TAKE là xác nhận của người dùng.** Nó mở phiên lấy thuốc nhưng tự nó không chứng minh người dùng đã lấy thuốc.
- **REMOVE là tín hiệu mô phỏng cảm biến.** Mỗi lần bấm tăng bộ đếm một viên. Mô hình hiện tại không có load cell hay cảm biến nhận dạng thuốc.
- **Lịch chỉ chạy khi có giờ hợp lệ và đã có cấu hình lịch Firebase/NVS hợp lệ.** Các giờ mặc định trong mã nguồn dùng làm giá trị khởi tạo, không tự kích hoạt nhắc lịch.
- **Thiết bị có thể chạy lịch ngoại tuyến** khi DS3231 còn giờ hợp lệ và firmware có cấu hình lịch đã cache trong NVS.
- **Tồn kho được tách khỏi cấu hình lịch.** Firebase lưu cấu hình tĩnh ở /config và tồn kho đã xác nhận ở /inventory.
- **Mất Wi-Fi không đồng nghĩa mất điện.** Firmware có thể tiếp tục chạy nếu ESP32 còn nguồn, nhưng Wokwi hiện không mô phỏng UPS.

### 1.2. Luồng sử dụng

1. Khi tới giờ của ngăn đã nạp thuốc, firmware bật còi/LED xanh và hiển thị tên thuốc, liều.
2. Người dùng bấm TAKE. Servo xoay đến 90 độ và firmware bắt đầu phiên đếm.
3. Người dùng bấm REMOVE theo số viên lấy ra. Đủ liều thì hệ thống báo thành công và chờ 8 giây trước khi đóng.
4. Trong khoảng chờ đóng, nếu có thêm tín hiệu REMOVE làm vượt liều, phiên chuyển sang lỗi.
5. Nếu hết 60 giây mà số viên chưa đủ, firmware báo thiếu liều hoặc không phát hiện viên nào.
6. Firmware ghi sự kiện cho cả kết quả thành công/lỗi; chỉ phiên xác minh đủ liều mới trừ tồn kho. Lỗi được xác nhận bằng nút MENU.

Một servo duy nhất biểu diễn cơ cấu khóa trong mô hình. Sơ đồ Wokwi không chứng minh được rằng từng ngăn có nắp/cơ cấu khóa độc lập.

### 1.3. Dashboard

Dashboard nghe các đường dẫn /deviceStatus, /config/compartments, /inventory/compartments, /inventoryCommands và /events theo thời gian thực. Tên thuốc, mã thuốc, giờ, liều và trạng thái nạp được lưu ở cấu hình. Số tồn kho hiển thị ưu tiên giá trị ESP32 đã ghi nhận. Dashboard báo riêng yêu cầu tồn kho đang chờ, đang áp dụng, đã áp dụng hoặc bị từ chối.

---

## 2. Kiến trúc hệ thống

~~~text
                 ┌────────────────────────────┐
                 │       Web Dashboard        │
                 │ Trạng thái, lịch sử, cấu hình│
                 └─────────────┬──────────────┘
                               │ Firebase RTDB
              ┌────────────────┴────────────────┐
              │ /config/compartments            │
              │ /inventory/compartments         │
              │ /inventoryCommands              │
              │ /events                         │
              │ /deviceStatus                   │
              └────────────────┬────────────────┘
                               │ Wi-Fi / HTTPS REST
┌──────────────────────────────┴─────────────────────────────┐
│                           ESP32                             │
│  main loop • FSM • lịch • xác minh • đồng bộ • NVS          │
│                                                             │
│  DS3231 ─ I²C                 LCD 1602 ─ I²C                │
│  DHT22 ─ GPIO                 Servo • còi • LED • 7 nút     │
└─────────────────────────────────────────────────────────────┘
              │
              └── NTP khi Wi-Fi khả dụng
~~~

Firmware khởi tạo phần cứng và cấu hình lịch, sau đó kết nối Wi-Fi/Firebase. Dịch vụ thời gian khôi phục giờ từ DS3231 trước khi dùng NTP hiệu chỉnh đồng hồ hệ thống. Firebase cấp cấu hình lịch và nhận sự kiện, telemetry cùng thay đổi tồn kho.

---

## 3. Linh kiện và sơ đồ GPIO

### 3.1. Linh kiện trong sơ đồ Wokwi

| Linh kiện | Vai trò | Ghi chú |
|---|---|---|
| ESP32 DevKit | Bộ điều khiển trung tâm, Wi-Fi | Cấu hình PlatformIO: env esp32dev |
| DS3231 | Giữ giờ và cung cấp thời gian ngoại tuyến | I²C, địa chỉ thường dùng 0x68 |
| LCD 1602 I²C | Hiển thị đồng hồ, lịch, tiến trình và cảnh báo | Địa chỉ trong firmware: 0x27 |
| DHT22 | Đo nhiệt độ và độ ẩm | Đọc theo chu kỳ 2 giây |
| Servo SG90 | Mô phỏng khóa nắp | Firmware điều khiển 0°/90° |
| Buzzer | Âm nhắc và cảnh báo | GPIO 25 |
| Hai LED | Nhắc lịch và báo lỗi | Điện trở hạn dòng cần có trên mạch thật |
| Bảy nút nhấn | MENU, UP, DOWN, TAKE, SNOOZE, LOAD, REMOVE | REMOVE mô phỏng cảm biến lấy viên |

### 3.2. Pin map

| GPIO | Kết nối | Cấu hình firmware | Chức năng |
|---:|---|---|---|
| 2 | LED xanh | OUTPUT | Nhắc lịch / báo hoàn tất |
| 4 | DATA DHT22 | Chân cảm biến | Nhiệt độ và độ ẩm |
| 12 | Nút TAKE | INPUT_PULLUP | Xác nhận mở phiên lấy thuốc |
| 13 | PWM servo | PWM | Mở/đóng khóa |
| 14 | Nút DOWN | INPUT_PULLUP | Duyệt ngăn lùi |
| 15 | LED đỏ | OUTPUT | Cảnh báo lỗi |
| 21 | SDA LCD + DS3231 | I²C SDA | Bus I²C |
| 22 | SCL LCD + DS3231 | I²C SCL | Bus I²C |
| 25 | Buzzer | OUTPUT/tone | Âm báo |
| 26 | Nút MENU | INPUT_PULLUP | Xác nhận xóa cảnh báo |
| 27 | Nút UP | INPUT_PULLUP | Duyệt ngăn tới |
| 32 | Nút LOAD | INPUT_PULLUP | Cộng tối đa 10 viên vào ngăn đang xem |
| 33 | Nút SNOOZE | INPUT_PULLUP | Hoãn nhắc 5 phút |
| 35 | Nút REMOVE | INPUT_PULLUP | Mô phỏng lấy một viên |
| 18, 19, 23, 34, 36, 39 | Không nối ngoại vi trong pin map hiện tại | INPUT | Danh sách firmware giữ ở input/high-impedance; chưa xác nhận dây nối trên board thật |

GPIO 35 chỉ hỗ trợ input và không có điện trở kéo nội bộ trên ESP32 thật. Mạch thật cần điện trở kéo ngoài phù hợp. Các chân 18, 19, 23, 34, 36, 39 mới được xác định là không dùng theo mã nguồn và diagram.json; cần kiểm tra lại nếu board thật có dây nối khác. GPIO 2, 12 và 15 là các chân có chức năng boot/strapping, hiện được dùng theo sơ đồ và chưa được đổi.

Nguồn Wokwi hiện chưa có pin dự phòng hoặc mạch power-path. Cấp nguồn cho servo trên mạch thật cần tính đến dòng đỉnh và sụt áp ESP32.

---

## 4. Cấu trúc mã nguồn

| Tệp | Trách nhiệm |
|---|---|
| src/main.cpp | Khởi tạo, vòng lặp chính, Serial shortcuts, hiển thị và điều hướng ngăn |
| src/state_machine.cpp | Trạng thái nhắc, snooze, mở ngăn, xác minh, lỗi và đóng |
| src/schedule.cpp | Cấu hình A/B/C, so giờ và khóa nhắc theo ngày |
| src/verification.cpp | Đếm viên mô phỏng và tạo VerificationEvent |
| src/time_service.cpp | Snapshot giờ, múi giờ ICT-7, RTC/NTP |
| src/hardware.cpp | GPIO, nút, LCD, RTC, DHT22, servo, còi và LED |
| src/cloud_sync.cpp | Wi-Fi, REST/Firebase, cache NVS, tồn kho và event queue |
| dashboard/ | Giao diện HTML/CSS/JavaScript kết nối Firebase |
| diagram.json | Sơ đồ mạch Wokwi |
| include/ | Header dùng chung và credentials |

Build dự án bằng PlatformIO, môi trường esp32dev. Cấu hình thư viện nằm trong platformio.ini. Thông tin Wi-Fi/Firebase dùng include/credentials.h; không đưa giá trị bí mật vào tài liệu hoặc kho mã nguồn công khai. Xem README.md để biết các bước chạy mô phỏng hiện tại.

---

## 5. Đồng hồ và lịch uống

### 5.1. Nguồn giờ

- DS3231 là nguồn giờ khôi phục khi khởi động/offline. Firmware từ chối thời gian RTC nếu RTC báo mất nguồn hoặc ngày nằm ngoài khoảng năm 2024–2099.
- Khi Wi-Fi khả dụng, firmware yêu cầu đồng bộ NTP. Thời gian Unix được dùng nội bộ; DS3231 được cập nhật bằng cùng mốc UTC.
- Màn hình và so khớp lịch dùng giờ Việt Nam, múi giờ ICT-7 (UTC+7).
- Khi RTC chưa hợp lệ và NTP chưa đồng bộ, màn hình hiện NO TIME và lịch không được kích hoạt.
- Wi-Fi/Firebase khởi tạo có thể chờ tối đa 8 giây lúc boot. Sau đó vòng lặp kiểm tra kết nối lại định kỳ.

### 5.2. Quy tắc lịch

- Lịch Firebase gồm ba ngăn A/B/C, giờ dạng HH:MM, liều 1–10 và trạng thái isLoaded.
- Một ngăn chỉ được nhắc khi isLoaded=true, giờ hợp lệ và đã có cấu hình từ Firebase hoặc bản cache NVS.
- So khớp lịch theo giờ/phút địa phương. Mỗi ngăn chỉ được kích hoạt một lần trong một ngày địa phương; khóa này hiện nằm trong RAM.
- Nếu nhiều ngăn cùng giờ, firmware xử lý lần lượt khi FSM quay về IDLE.
- Các phím Serial 1/2/3 gọi nhắc thử ngăn tương ứng và không chỉnh thời gian hệ thống.

Không có cơ chế phát nhắc bù sau khi thiết bị tắt qua một cữ. Nếu chưa từng tải/cache cấu hình hợp lệ, giờ mẫu trong firmware không được dùng để phát nhắc.

---

## 6. Máy trạng thái và luồng xác minh

Hằng số hiện tại trong include/config.h:

| Hằng số | Giá trị |
|---|---:|
| SNOOZE_DURATION_MS | 5 phút |
| VERIFY_TIMEOUT_MS | 60 giây |
| AUTO_CLOSE_DELAY_MS | 8 giây |
| DEBOUNCE_DELAY_MS | 50 ms |
| Thời gian nhắc trước khi ghi nhận cữ lỡ | 10 phút |

### 6.1. Chuyển trạng thái chính

| Trạng thái | Điều kiện/sự kiện | Kết quả |
|---|---|---|
| IDLE | Giờ hợp lệ, lịch khớp, cấu hình có hiệu lực và ngăn đã nạp | REMINDER; bật LED xanh/còi |
| REMINDER | TAKE | COMPARTMENT_OPEN; tắt nhắc, mở servo, bắt đầu đếm |
| REMINDER | SNOOZE | SNOOZED; tắt nhắc và đặt hạn 5 phút |
| REMINDER | Không thao tác trong 10 phút | ERROR; ghi sự kiện MISSED_DOSE |
| SNOOZED | Hết 5 phút | REMINDER; nhắc lại |
| COMPARTMENT_OPEN / VERIFYING | REMOVE | Tăng số viên; đúng liều chuyển VERIFIED, vượt liều chuyển ERROR |
| COMPARTMENT_OPEN / VERIFYING | Hết 60 giây trước khi đủ liều | ERROR; NO_DETECTION nếu chưa lấy viên nào, nếu không là MISMATCH_LESS |
| VERIFIED | Không có REMOVE thêm trong 8 giây | Trừ tồn kho theo liều, đóng servo, ghi sự kiện, chuyển CLOSED |
| VERIFIED | Có REMOVE thêm trong 8 giây | ERROR do vượt liều |
| ERROR | MENU | Tắt báo lỗi, đóng servo, trở về IDLE qua CLOSED |
| CLOSED | Chu kỳ hoàn tất | IDLE |

Còi nhắc phát ba tiếng ngắn theo chu kỳ 2 giây; cảnh báo lỗi nháy LED đỏ và còi ngắt quãng. Bấm MENU chỉ xác nhận/xóa trạng thái lỗi; không xóa bản ghi Firebase.

### 6.2. Trạng thái sự kiện

| status | Ý nghĩa |
|---|---|
| VERIFIED_BY_SIMULATION | Số tín hiệu REMOVE bằng đúng liều |
| MISMATCH_LESS | Có tín hiệu lấy nhưng ít hơn liều khi timeout |
| MISMATCH_MORE | Số tín hiệu vượt liều |
| NO_DETECTION | Đã mở phiên nhưng không có tín hiệu REMOVE khi timeout |
| MISSED_DOSE | Hết 10 phút nhắc mà không có TAKE |

Trong mã hiện tại, luồng MISSED_DOSE gọi verify_start() để tạo event; hàm đó đặt userConfirmed=true. Vì vậy trường userConfirmed của event MISSED_DOSE chưa phản ánh chính xác thao tác nút TAKE. Cần xem xét tách phần khởi tạo dữ liệu event khỏi verify_start() khi chỉnh sửa firmware sau này.

---

## 7. Cấu trúc dữ liệu

### 7.1. Cấu trúc firmware

MedicationCompartment lưu mã ngăn, mã/tên thuốc, liều, giờ/phút, tồn kho và isLoaded. VerificationEvent lưu eventId, ngăn, thuốc, liều dự kiến, số viên phát hiện, cờ xác minh, status, timestamp và cờ synced. TimeSnapshot lưu giờ/ngày địa phương, Unix UTC, dateKey, nguồn RTC/NTP và cờ hợp lệ.

Thời gian timeout và các khoảng chờ ngắn dựa trên millis(); thời gian lịch lấy từ time_service.

### 7.2. Các đường dẫn Firebase

Cấu hình lịch tĩnh tại /config/compartments:

~~~json
{
  "A": {
    "compartmentId": "A",
    "medicineCode": "MED-001",
    "displayName": "Thuoc Tim Mach",
    "unitsPerDose": 2,
    "schedule": "08:00",
    "isLoaded": true
  },
  "B": {
    "compartmentId": "B",
    "medicineCode": "MED-002",
    "displayName": "Vitamin C",
    "unitsPerDose": 1,
    "schedule": "12:00",
    "isLoaded": true
  },
  "C": {
    "compartmentId": "C",
    "medicineCode": "MED-003",
    "displayName": "Canxi Nano",
    "unitsPerDose": 1,
    "schedule": "20:00",
    "isLoaded": true
  }
}
~~~

Firmware xác thực đủ A/B/C, ID khớp key, giờ HH:MM, tên/mã không rỗng, isLoaded dạng boolean và liều từ 1 đến 10 trước khi áp dụng. Trường currentStock cũ có thể còn trong Firebase để bootstrap dữ liệu lần đầu, nhưng firmware không dùng nó làm cấu hình lịch thường kỳ.

Tồn kho đã xác nhận tại /inventory/compartments/{A|B|C}:

~~~json
{
  "currentStock": 10,
  "revision": 4,
  "lastCommandId": "-OexampleCommand",
  "updatedAt": 1792300000000
}
~~~

Yêu cầu sửa tồn kho tại /inventoryCommands/pending/{commandId} gồm compartmentId, targetStock và createdAt. Trạng thái mới nhất theo ngăn tại /inventoryCommands/status/{A|B|C} gồm commandId, compartmentId, state, targetStock, appliedStock (nếu đã áp dụng), revision, message và updatedAt. Các giá trị state thường dùng: pending, applying, applied, rejected.

Sự kiện tại /events/{eventId} có eventId, compartmentId, medicineCode, expectedUnits, detectedUnits, compartmentMatch, quantityMatch, userConfirmed, status và timestamp.

Telemetry tại /deviceStatus gồm online, lastSeen, currentTemp, currentHumid, currentState và activeAlarm. Hiện lastSeen được ghi từ millis()/1000 (thời gian chạy kể từ boot), không phải Unix timestamp.

---

## 8. Đồng bộ Firebase và tồn kho

### 8.1. Đồng bộ lịch

- Firmware khôi phục cấu hình lịch từ NVS trước khi thử kết nối Firebase.
- Khi online, firmware tải /config/compartments lúc khởi động, khi Wi-Fi kết nối lại và định kỳ 15 giây khi FSM ở IDLE.
- Payload được xác thực toàn bộ trước khi áp dụng. Cấu hình mới chỉ có hiệu lực khi IDLE; cấu hình trong phiên đang diễn ra không bị đổi giữa chừng.
- Cấu hình hợp lệ được lưu vào NVS để sử dụng sau khi khởi động offline.
- Nếu Firebase không đọc được và chưa có cache hợp lệ, thiết bị giữ các giá trị khởi tạo nhưng không kích hoạt lịch.

### 8.2. Đồng bộ tồn kho

- Giá trị đích người dùng nhập trên Dashboard nằm trong khoảng 0–100. Dashboard tạo command mới khi số nhập khác số hiện tại; nó không tự ghi đè số tồn kho đã xác nhận.
- ESP32 lấy command cũ nhất khi IDLE, ghi tồn kho và commandId vào NVS trước khi xác nhận. Sau đó ESP32 cập nhật /inventory/compartments, ghi trạng thái command và xóa command chờ.
- Sau khi hoàn tất liều đúng, firmware trừ liều khỏi tồn kho. Nút LOAD cộng 10 viên vào ngăn đang xem, tối đa 100 viên.
- Nếu chưa có tồn kho NVS, firmware thử nạp /inventory/compartments; nếu mục mới chưa có, dùng currentStock cũ trong /config/compartments làm nguồn bootstrap. Thay đổi chưa đồng bộ được giữ trong NVS và được gửi lại khi online.
- Dashboard phân biệt yêu cầu đang chờ với tồn kho thiết bị đã xác nhận.

### 8.3. Sự kiện, telemetry và giới hạn offline

- ESP32 gửi telemetry mỗi 10 giây. Khi Wi-Fi mất, firmware thử kết nối lại mỗi 5 giây.
- Event thất bại khi gửi được giữ trong hàng đợi vòng tối đa 10 sự kiện trong RAM. Khi hàng đợi đầy, sự kiện cũ nhất bị ghi đè. Hàng đợi này không qua NVS nên có thể mất khi ESP32 reset hoặc mất điện.
- Khi Wi-Fi trở lại, firmware gửi bù từng event trong queue. Đây không phải lưu trữ bền vững; không nên mô tả là bảo đảm không mất log.
- Cấu hình Firebase và đồng bộ tồn kho được lưu bền vững qua NVS; event queue thì không.

---

## 9. Chạy và thao tác mô phỏng

Build firmware bằng PlatformIO với env esp32dev, sau đó chạy diagram.json bằng Wokwi. Theo dõi log qua Serial Monitor tốc độ 115200 baud. Các phím thử nghiệm:

| Phím | Tác vụ |
|---|---|
| 1 / 2 / 3 | Kích hoạt nhắc thử ngăn A/B/C, không đổi đồng hồ |
| T | Mô phỏng bấm TAKE |
| R | Mô phỏng lấy một viên |
| S | Hoãn báo 5 phút |
| M | Xác nhận xóa cảnh báo |
| L | Cộng tối đa 10 viên vào ngăn đang xem |
| U / D | Duyệt thông tin các ngăn trên LCD |
| O | Gọi chế độ mô phỏng quá liều |
| H | Chạy phần cứng self-test |
| ? | In lại bảng phím tắt |

Nút LOAD tác động lên ngăn đang chọn; mặc định là A cho tới khi dùng UP/DOWN để chọn ngăn khác. Tín hiệu 1/2/3 là nhắc thử trực tiếp, không phải thay đổi lịch RTC.

Các luồng có thể kiểm tra thủ công gồm: lấy đủ liều, thiếu liều sau 60 giây, vượt liều trong thời gian chờ đóng, snooze, cữ lỡ sau 10 phút, cập nhật cấu hình khi IDLE, command tồn kho, mất/kết nối lại Wi-Fi và hiển thị TIME_INVALID. Mô tả này là hướng dẫn thao tác, không phải khẳng định rằng mọi tình huống đã được nghiệm thu trên thiết bị thật.

---

## 10. Giới hạn và an toàn

1. Đây là đồ án học tập/mô phỏng, không phải thiết bị y tế được chứng nhận. Không dùng làm cơ sở tự động cấp phát thuốc thật cho bệnh nhân.
2. REMOVE là nút nhấn giả lập; firmware không đo khối lượng, không nhận diện hoạt chất, viên thuốc hoặc ngăn vật lý.
3. Mô hình có một servo. Không có phần cứng riêng chứng minh từng ngăn A/B/C được khóa độc lập.
4. Mục tiêu dự phòng đã chọn là **tối thiểu 4 giờ cho toàn hệ thống**, nhưng chưa có UPS/power-path hoàn chỉnh, chưa chốt cell và chưa đo dòng. Cần cấp nguồn dự phòng liên tục cho ESP32 cùng ngoại vi, đặc biệt tính dòng đỉnh của servo, rồi đo runtime trên mạch thật.
5. Firmware không phát nhắc bù sau khi thiết bị tắt qua giờ hẹn. Pin dự phòng DS3231 chỉ duy trì đồng hồ, không cấp nguồn cho ESP32, LCD, còi hay servo.
6. Event queue chỉ nằm trong RAM, tối đa 10 mục và ghi đè mục cũ khi đầy. Reset hoặc hết nguồn có thể làm mất event chưa gửi.
7. Wi-Fi/Firebase chưa được kiểm chứng runtime chỉ bằng việc cấu hình host/token. Mã HTTPS hiện gọi setInsecure(), tức chưa xác minh chứng chỉ máy chủ; cần xử lý trước khi dùng với dữ liệu nhạy cảm.
8. Không đưa thông tin xác thực Firebase hoặc Wi-Fi vào tài liệu, ảnh chụp log hay repository công khai. Quy tắc Firebase cần giới hạn quyền theo nhu cầu thực tế.
9. GPIO35 không có pull-up nội bộ trên chip ESP32; board thật cần kiểm tra mức điện áp và điện trở kéo. Pin map Wokwi không xác nhận được dây nối ngoài thực tế.

---

## 11. Tiến độ và tài liệu liên quan

| Hạng mục | Hiện trạng trong dự án | Việc cần nghiệm thu |
|---|---|---|
| Lịch và FSM | Có nhắc, snooze, timeout, xác minh và xử lý tồn kho trong mã nguồn | Kiểm tra luồng tích hợp trên Wokwi |
| Đồng hồ | Có RTC DS3231, đồng bộ NTP, múi giờ UTC+7 và TIME_INVALID | Kiểm tra khởi động/khôi phục giờ trên board |
| Cache cấu hình/tồn kho | Cấu hình lịch và tồn kho được lưu trong NVS | Kiểm tra mất mạng và khởi động lại |
| Dashboard/Firebase | Có cấu hình lịch, log, telemetry, tồn kho và command | Kiểm tra quyền RTDB, đọc/ghi và luồng ACK |
| GPIO chưa dùng | Firmware cấu hình sáu GPIO trong danh sách thành INPUT | Xác nhận pin map trên mạch vật lý |
| Nguồn dự phòng | Mục tiêu 4 giờ đã chọn; chưa có mạch UPS/power-path | Chọn nguồn theo phép đo tải và xác nhận runtime |
| Bản ghi MISSED_DOSE | Đã có event; cờ userConfirmed hiện có thể sai như ghi chú ở mục 6.2 | Tách khởi tạo event khỏi verify_start() |

Các kế hoạch chi tiết:

- [Đồng hồ và nguồn dự phòng](Ke_hoach_dong_ho_thoi_gian_thuc.md)
- [Đồng bộ cấu hình liều thuốc](Ke_hoach_dong_bo_cau_hinh_lieu_thuoc.md)
- [Đồng bộ tồn kho và cấu hình thiết bị](Ke_hoach_dong_bo_ton_kho_va_cau_hinh_thiet_bi.md)
- [Đưa GPIO không sử dụng về trạng thái an toàn](Ke_hoach_khoa_gpio_va_cong_khong_su_dung.md)
- [README hướng dẫn build và mô phỏng](../README.md)

---

## 12. Thuật ngữ

| Thuật ngữ | Nghĩa trong dự án |
|---|---|
| FSM | Máy trạng thái hữu hạn điều khiển từng phiên nhắc/lấy thuốc |
| RTC | Đồng hồ thời gian thực DS3231 |
| NTP | Dịch vụ đồng bộ đồng hồ qua mạng |
| NVS | Bộ nhớ không mất dữ liệu khi khởi động lại trên ESP32 |
| RTDB | Firebase Realtime Database, lưu dữ liệu dạng JSON |
| Telemetry | Dữ liệu trạng thái và cảm biến gửi về Firebase |
| Debounce | Lọc rung tiếp điểm của nút nhấn |
| Offline queue | Hàng đợi sự kiện chờ gửi; phiên bản hiện tại nằm trong RAM |
| Power-path / UPS | Mạch cấp nguồn liên tục và chuyển sang pin dự phòng khi mất adapter |
| Verification | Đối chiếu số tín hiệu REMOVE với liều yêu cầu; hiện chỉ là mô phỏng |

*Tài liệu phản ánh mã nguồn và sơ đồ trong repository tại thời điểm cập nhật. Hành vi trên phần cứng thật cần được nghiệm thu riêng.*
