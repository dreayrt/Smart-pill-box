# Tài liệu kỹ thuật tổng hợp Hộp thuốc thông minh

| Thông tin | Nội dung |
|---|---|
| Dự án | Hộp thuốc thông minh IoT, Nhóm 13 |
| Nền tảng hiện tại | ESP32 DevKit, Arduino/PlatformIO, Wokwi, Firebase Realtime Database, Web Dashboard |
| Mốc rà soát | 18/10/2026 |
| Mục đích | Tài liệu nền để viết báo cáo đồ án, chuẩn bị demo và lập kế hoạch nghiệm thu |
| Phạm vi xác nhận | Đối chiếu tài liệu trong `docs/` với mã nguồn, cấu hình và sơ đồ hiện có trong repository |

> **Kết luận phạm vi:** Repository đã có mã cho nhắc lịch ba ngăn, xác minh *số tín hiệu lấy viên mô phỏng*, đồng hồ RTC/NTP, cache lịch và tồn kho, đồng bộ Firebase và Dashboard. Chưa có bằng chứng trong lần rà soát này rằng bản mã hiện tại đã chạy thông suốt trên ESP32 vật lý hoặc đạt mục tiêu nguồn dự phòng bốn giờ. Hệ thống không chứng minh người dùng đã nuốt thuốc hay nhận dạng được viên thuốc thật.

## Cách đọc tài liệu và mức độ bằng chứng

Tài liệu này mô tả **bản mã hiện tại** trước, sau đó nêu rõ các yêu cầu đã có trong kế hoạch nhưng chưa thành chức năng được nghiệm thu. “Có trong mã” nghĩa là đã thấy luồng xử lý tương ứng; không đồng nghĩa đã kiểm thử chạy thật. Các biên bản bàn giao ghi nhận kết quả ở những mốc trước, dùng làm bối cảnh lịch sử chứ không tự động thay thế việc nghiệm thu sau các thay đổi mới.

| Mức độ | Cách hiểu trong tài liệu này |
|---|---|
| Có trong mã/sơ đồ | Có thể chỉ ra tệp và nhánh xử lý hoặc kết nối cụ thể. |
| Đã báo cáo kiểm thử trước đây | Có trong biên bản thành viên; cần kiểm tra lại trên bản hiện tại. |
| Cần nghiệm thu | Có triển khai hoặc thiết kế, nhưng chưa có kết quả chạy/đo tương ứng ở mốc rà soát. |
| Đề xuất mở rộng | Chưa có trong mô hình hiện tại, không được mô tả như tính năng sẵn có. |

## 1. Bài toán, mục tiêu và giới hạn

### 1.1. Bài toán

Người dùng có thể quên cữ thuốc hoặc lấy số viên khác với liều đã cấu hình. Mô hình học tập dùng một hộp thuốc ba ngăn A/B/C để nhắc đúng thời điểm, cho người dùng xác nhận mở phiên lấy thuốc, nhận các tín hiệu giả lập mỗi lần lấy một viên, so sánh với liều dự kiến và lưu kết quả. Người quản lý xem trạng thái, lịch sử, cấu hình lịch và yêu cầu điều chỉnh tồn kho từ Dashboard.

### 1.2. Mục tiêu chức năng của bản hiện tại

1. Quản lý ba cấu hình ngăn thuốc với mã, tên, giờ, liều, trạng thái nạp và tồn kho.
2. Chỉ nhắc theo lịch khi **giờ hợp lệ** và đã có **cấu hình Firebase hoặc cache NVS hợp lệ**; hỗ trợ hoãn năm phút.
3. Phân loại kết quả lấy viên theo tín hiệu REMOVE: đủ, thiếu, thừa, không phát hiện, hoặc bỏ lỡ cữ khi không bấm TAKE.
4. Hiển thị thông tin trên LCD, điều khiển LED/còi/servo và gửi sự kiện, telemetry, tồn kho qua Firebase khi có kết nối.
5. Duy trì giờ và lịch cục bộ khi mất mạng nếu DS3231 còn giờ hợp lệ, ESP32 còn nguồn và NVS đã có lịch hợp lệ.

### 1.3. Giới hạn diễn giải kết quả

- **TAKE** chỉ là thao tác xác nhận của người dùng để bắt đầu phiên và mở servo; nó không chứng minh đã lấy hoặc uống thuốc.
- **REMOVE** là nút mô phỏng một tín hiệu “lấy một viên”; chưa có cảm biến nhận dạng hay đếm viên thật. `VERIFIED_BY_SIMULATION` chỉ có nghĩa số lần REMOVE bằng liều cấu hình trong phiên.
- Firmware gắn mỗi phiên với ngăn đang đến lịch, nhưng Wokwi chỉ có **một servo**. Chưa có ba cơ cấu khóa độc lập hoặc cảm biến xác nhận đúng ngăn vật lý.
- DHT22 đo môi trường mô phỏng; cảnh báo nhiệt/ẩm trên Dashboard không phải đánh giá điều kiện bảo quản cho từng loại thuốc. Liều và tên thuốc trong ví dụ chỉ là dữ liệu demo, không phải chỉ định điều trị.
- Đây là mô hình học tập, chưa phải thiết bị y tế hay hệ thống cấp phát thuốc được chứng nhận.

Nguồn định hướng yêu cầu: [kế hoạch Wokwi](Ke_hoach_trien_khai_hop_thuoc_thong_minh_Wokwi.docx), [tài liệu kỹ thuật trước đây](Tai_lieu_ky_thuat_Hop_thuoc_thong_minh.md).

## 2. Kiến trúc tổng thể

```text
Người dùng ── nút TAKE/SNOOZE/REMOVE/LOAD/MENU/UP/DOWN ──┐
                                                           │
RTC DS3231 ── I²C ──┐                                      ▼
LCD 1602 ──── I²C ──┤                               ESP32 + firmware
DHT22 ────── GPIO ──┤                         thời gian → lịch → FSM → xác minh
LED/còi/servo ← GPIO┘                                      │
                                                           ├── NVS: lịch, tồn kho
                                                           └── Wi-Fi + HTTPS REST
                                                                    │
                                                          Firebase Realtime Database
                                                                    │
                                                             Web Dashboard
```

**Khối điều khiển cục bộ.** `src/main.cpp` khởi tạo phần cứng, cloud và đồng hồ, sau đó đọc nút, cập nhật FSM, xử lý cloud và làm mới LCD trong `loop()`. Lịch do `src/schedule.cpp` quản lý; xác minh lượng mô phỏng trong `src/verification.cpp`; chuyển trạng thái trong `src/state_machine.cpp`. `src/hardware.cpp` là driver ngoại vi, `src/time_service.cpp` quản lý RTC/NTP, `src/cloud_sync.cpp` thực hiện REST Firebase và NVS.

**Khối đám mây.** ESP32 dùng Wi-Fi và Firebase REST để đọc cấu hình/lệnh, ghi sự kiện, telemetry và tồn kho. `dashboard/app.js` dùng Firebase JavaScript SDK để nghe dữ liệu thời gian thực và ghi cấu hình hoặc lệnh tồn kho. Hai phía dùng chung database nhưng không trao đổi trực tiếp với nhau.

**Tính độc lập khi mất mạng.** Khi mất Wi-Fi nhưng ESP32 còn nguồn, RTC hợp lệ và lịch đã cache, FSM vẫn có thể phát nhắc cục bộ. Log chỉ được xếp vào RAM chờ gửi; Dashboard không có bảo đảm cập nhật tức thời. Khi mất nguồn toàn hộp, pin dự phòng của DS3231 chỉ giữ giờ. Chưa có UPS nuôi ESP32 và ngoại vi.

| Tệp/nhóm tệp | Vai trò chính |
|---|---|
| `include/config.h` | Enum 8 trạng thái, nút, hằng số thời gian, cấu trúc ngăn và event. |
| `src/main.cpp` | `setup()`, `loop()`, phím Serial kiểm thử, duyệt ngăn, LOAD, màn hình chờ. |
| `src/schedule.cpp`, `src/state_machine.cpp`, `src/verification.cpp` | Lịch, điều phối phiên, so liều mô phỏng. |
| `src/time_service.cpp`, `src/hardware.cpp` | RTC/NTP/múi giờ và I/O ngoại vi. |
| `src/cloud_sync.cpp` | REST Firebase, cache NVS, lệnh/tồn kho, hàng đợi event. |
| `dashboard/` | Giao diện giám sát và cấu hình. |
| `diagram.json`, `wokwi.toml`, `platformio.ini` | Sơ đồ Wokwi và cấu hình build. |

## 3. Phần cứng mô phỏng và GPIO

### 3.1. Thành phần đang có trong sơ đồ

| Thành phần | Số lượng | Chức năng và giới hạn |
|---|---:|---|
| ESP32 DevKit | 1 | Điều khiển và Wi-Fi, môi trường PlatformIO `esp32dev`. |
| LCD 1602 I²C | 1 | Hiển thị giờ, liều, tiến trình và lỗi; firmware dùng địa chỉ `0x27`. |
| DS3231 | 1 | Giữ giờ khi có pin RTC; dùng chung bus I²C, địa chỉ thông dụng `0x68`. |
| DHT22 | 1 | Nhiệt độ và độ ẩm; chu kỳ đọc trong driver khoảng hai giây. |
| Servo SG90 | 1 | Mở/đóng mô hình khóa ở 90°/0°; không đại diện ba khóa độc lập. |
| LED xanh, LED đỏ, buzzer | 2 LED, 1 buzzer | Báo nhắc, hoàn tất và lỗi. |
| Nút nhấn | 7 | MENU, UP, DOWN, TAKE, SNOOZE, LOAD, REMOVE; REMOVE giả lập cảm biến. |

Sơ đồ `diagram.json` có 15 phần tử: một ESP32, một LCD, một RTC, một servo, hai LED, một buzzer, một DHT22 và bảy nút. Sơ đồ **chưa có** pin/UPS/power-path, load cell, QR/RFID hoặc cơ cấu khóa riêng cho từng ngăn.

### 3.2. Ánh xạ chân hiện tại

| GPIO | Thiết bị/tín hiệu | Lưu ý triển khai |
|---:|---|---|
| 2 | LED xanh | Chân strapping; cần kiểm tra mức lúc boot trên board thật. |
| 4 | DHT22 DATA | Cần đúng mức logic và dây nối của cảm biến thật. |
| 12 | TAKE | Input; chân strapping. |
| 13 | Servo PWM | Tải servo cần nguồn đủ dòng, chung GND tín hiệu. |
| 14 | DOWN | Input. |
| 15 | LED đỏ | Chân strapping. |
| 21, 22 | SDA, SCL cho LCD và DS3231 | Hai thiết bị chung bus I²C. |
| 25 | Buzzer | Điều khiển âm báo. |
| 26 | MENU | Input. |
| 27 | UP | Input. |
| 32 | LOAD | Input. |
| 33 | SNOOZE | Input. |
| 35 | REMOVE | GPIO chỉ input, **không có pull-up nội bộ trên ESP32 thật**; cần điện trở kéo ngoài phù hợp. |
| 18, 19, 23, 34, 36, 39 | Chưa dùng trong mã/sơ đồ | Firmware đặt `INPUT` lúc khởi tạo; cần kiểm tra lại dây trên board thật. |

Driver gọi `INPUT_PULLUP` cho bảy nút, kể cả GPIO35. Cấu hình đó trong mã **không tạo được pull-up vật lý** cho GPIO35 trên ESP32. Các GPIO chưa dùng ở trên chỉ được đặt input trong firmware đang chạy, không bị “khóa” vĩnh viễn. Trước khi nạp lên board thật phải rà chân đã nối, điện trở LED, mức nguồn LCD/RTC/DHT22 và dòng đỉnh servo. Nguồn: [kế hoạch GPIO](Ke_hoach_khoa_gpio_va_cong_khong_su_dung.md), `src/hardware.cpp`, `diagram.json`.

## 4. Đồng hồ, lịch và điều kiện phát nhắc

### 4.1. Nguồn thời gian

`time_service` đặt múi giờ `ICT-7` (UTC+7) cho hiển thị và so lịch địa phương. Lúc boot, firmware thử đọc DS3231. RTC bị coi là không hợp lệ nếu báo mất nguồn hoặc năm ngoài 2024–2099. Khi Wi-Fi sẵn sàng, firmware yêu cầu NTP; nếu đồng bộ thành công, nó cập nhật đồng hồ hệ thống và ghi mốc UTC vào DS3231. `TimeSnapshot` chứa ngày giờ địa phương, `dateKey` dạng YYYYMMDD, Unix timestamp UTC, nguồn RTC/NTP và cờ hợp lệ.

Nếu cả RTC và NTP chưa cung cấp giờ hợp lệ, màn hình/log báo `NO TIME`/`TIME_INVALID` và firmware không kích hoạt lịch. Các phím `1/2/3` chỉ thử nhắc A/B/C, không đặt lại giờ. `millis()` dùng cho debounce, snooze, timeout và các khoảng chờ ngắn; không thay thế đồng hồ ngày giờ.

### 4.2. Cấu hình lịch và điều kiện kích hoạt

Mỗi ngăn có `compartmentId`, `medicineCode`, `displayName`, `unitsPerDose`, `scheduleHour`, `scheduleMinute`, `currentStock`, `isLoaded`. `schedule_init()` cấp các giá trị ví dụ A 08:00/2 viên, B 12:00/1 viên, C 20:00/1 viên. **Giờ ví dụ không tự phát nhắc** khi chưa tải được cấu hình Firebase hoặc khôi phục cache NVS hợp lệ. Firmware yêu cầu đồng thời giờ hợp lệ, lịch hợp lệ, ngăn `isLoaded=true` và giờ/phút khớp.

Khi online và FSM rảnh, firmware đọc `/config/compartments` khi khởi động/kết nối lại và theo chu kỳ dự kiến 15 giây. Toàn bộ A/B/C phải hợp lệ: ID khớp key, chuỗi bắt buộc không rỗng/vừa bộ đệm, giờ `HH:MM`, liều 1–10, `isLoaded` boolean. Payload sai bị bỏ, không áp dụng một phần. Bản hợp lệ được áp dụng khi `STATE_IDLE` rồi lưu NVS. Khi đang trong phiên, thay đổi lịch/liều chờ đến lúc rảnh để không đổi liều giữa chừng.

Lịch so theo phút địa phương và khóa mỗi ngăn một lần cho một `dateKey`. **Khóa này chỉ nằm trong RAM**, nên reset trong cùng ngày có thể cho phép phát lại nếu vẫn ở phút hẹn. Mã `schedule_checkDue()` cũng có nhánh `return NULL` ngay khi gặp một ngăn đã phát hôm đó. Vì vậy **hai ngăn trùng giờ chưa được xử lý đúng chắc chắn**: ngăn đứng sau có thể không được xét trong cùng phút. Cần sửa và kiểm thử trước khi tuyên bố hỗ trợ lịch trùng giờ.

Không có cơ chế nhắc bù nếu hộp tắt qua thời điểm hẹn. Nguồn: [kế hoạch đồng hồ](Ke_hoach_dong_ho_thoi_gian_thuc.md), `src/time_service.cpp`, `src/schedule.cpp`, `src/main.cpp`, `src/cloud_sync.cpp`.

## 5. Quy trình điều khiển và xác minh

### 5.1. Các trạng thái

Firmware định nghĩa tám trạng thái: `IDLE`, `REMINDER`, `SNOOZED`, `COMPARTMENT_OPEN`, `VERIFYING`, `VERIFIED`, `ERROR`, `CLOSED`. `IDLE` tìm cữ đến hạn; `REMINDER` báo người dùng; `SNOOZED` giữ phiên hoãn; `COMPARTMENT_OPEN`/`VERIFYING` đếm REMOVE; `VERIFIED` chờ đóng; `ERROR` chờ người dùng xác nhận; `CLOSED` kết thúc rồi về `IDLE`.

| Tình huống | Xử lý trong mã hiện tại |
|---|---|
| Đến giờ khi đủ điều kiện lịch | Chọn ngăn, vào `REMINDER`, bật tín hiệu nhắc và hiện tên/liều. |
| Bấm TAKE trong `REMINDER` | Tắt nhắc, servo 90°, khởi tạo phiên xác minh, vào `COMPARTMENT_OPEN`. |
| Bấm SNOOZE trong `REMINDER` | Tắt nhắc, hoãn năm phút rồi phát lại. |
| Không bấm TAKE trong 10 phút nhắc | Vào `ERROR`, phát sự kiện `MISSED_DOSE`. |
| REMOVE trước khi đủ liều | Tăng bộ đếm, hiện tiến trình; hết 60 giây thì `MISMATCH_LESS` hoặc `NO_DETECTION`. |
| REMOVE bằng liều | Vào `VERIFIED`; servo còn mở thêm tám giây. |
| REMOVE thêm trong tám giây | Vào `ERROR`, phân loại vượt liều `MISMATCH_MORE`. |
| Hết tám giây, không lấy thêm | Trừ tồn kho tối đa về 0, đánh dấu đồng bộ, đóng servo, gửi event, qua `CLOSED`. |
| Bấm MENU trong `ERROR` | Tắt cảnh báo và qua `CLOSED`; không xóa event đã ghi. |

Các hằng số trong `include/config.h`: snooze 5 phút; timeout xác minh 60 giây; chờ tự đóng **8 giây**; debounce 50 ms. Giới hạn nhắc 10 phút đặt trong `src/state_machine.cpp`. Một số biên bản và README cũ ghi **3 giây**; đó không còn là giá trị của mã hiện tại.

### 5.2. Ý nghĩa event

| `status` | Ý nghĩa chính xác |
|---|---|
| `VERIFIED_BY_SIMULATION` | Đếm REMOVE đúng bằng liều trong thời gian quy định và không có REMOVE thêm trước lúc đóng. |
| `MISMATCH_LESS` | Có REMOVE nhưng chưa đủ liều khi hết 60 giây. |
| `MISMATCH_MORE` | REMOVE vượt liều. |
| `NO_DETECTION` | Bấm TAKE nhưng không có REMOVE trước timeout. |
| `MISSED_DOSE` | Đã nhắc 10 phút mà không bấm TAKE. |

`compartmentMatch=true` trong event hiện được gán theo ngăn đang chạy, **không phải kết quả một phép đo nhận dạng ngăn vật lý**. `userConfirmed` đúng nghĩa cho phiên TAKE thông thường, nhưng luồng `MISSED_DOSE` gọi `verify_start()` nên hiện ghi `userConfirmed=true` dù không có TAKE. Sau khi đẩy `MISSED_DOSE`, nhánh `ERROR` có thể gửi thêm một event lỗi cho cùng tình huống vì cờ gửi event chưa được đặt; đây là rủi ro log trùng/sai phân loại cần sửa. Tên event và thời gian cần được kiểm tra khi chạy thật, nhất là trường hợp chưa có giờ hợp lệ trong ca kiểm thử Serial.

**Tồn kho là sổ đếm phần mềm**, không phải số viên đo độc lập. Với phiên lỗi, mã không trừ tồn kho ngay cả khi người dùng đã phát tín hiệu REMOVE. Với phiên đúng, mã trừ theo liều khi kết thúc tám giây. Vì thế số tồn kho có thể lệch số thuốc vật lý, đặc biệt sau lỗi hoặc khi nạp tay. Nguồn: `src/state_machine.cpp`, `src/verification.cpp`, `include/config.h`.

## 6. Cấu trúc Firebase và quy tắc đồng bộ

### 6.1. Các nhánh dữ liệu

| Đường dẫn | Dữ liệu chính | Bên ghi/đọc |
|---|---|---|
| `/config/compartments/{A,B,C}` | ID, mã/tên thuốc, `schedule`, `unitsPerDose`, `isLoaded` | Dashboard ghi; ESP32 đọc, xác thực và cache NVS. |
| `/inventory/compartments/{A,B,C}` | `currentStock`, `revision`, `lastCommandId`, `updatedAt` | ESP32 công bố tồn kho; Dashboard đọc. |
| `/inventoryCommands/pending/{commandId}` | `compartmentId`, `targetStock`, `createdAt` | Dashboard tạo yêu cầu; ESP32 lấy khi rảnh. |
| `/inventoryCommands/status/{A,B,C}` | Trạng thái `pending/applying/applied/rejected`, số đích, ACK, revision, thông báo | Dashboard và ESP32 cập nhật; Dashboard hiển thị. |
| `/events/{eventId}` | Thông tin phiên, số viên dự kiến/phát hiện, cờ, status, timestamp | ESP32 ghi; Dashboard đọc. |
| `/deviceStatus` | `online`, `lastSeen`, nhiệt/ẩm, trạng thái FSM, `activeAlarm` | ESP32 ghi định kỳ; Dashboard đọc. |

Ví dụ **cấu hình demo**, không phải đơn thuốc:

```json
{
  "A": {
    "compartmentId": "A",
    "medicineCode": "MED-001",
    "displayName": "Thuoc mau A",
    "schedule": "08:00",
    "unitsPerDose": 2,
    "isLoaded": true
  }
}
```

Trên Firebase thực, payload cấu hình phải có đủ **A, B và C**, không chỉ A như ví dụ rút gọn. `currentStock` cũ trong `/config/compartments` chỉ dùng làm nguồn chuyển dữ liệu ban đầu nếu chưa có tồn kho tại nhánh mới và NVS chưa khởi tạo; các lần sửa tồn kho về sau dùng command.

### 6.2. Luồng cấu hình và tồn kho

Dashboard ghi các trường cấu hình tĩnh. Việc Firebase nhận ghi **chưa phải ACK ESP32 đã áp dụng**. Firmware đọc cấu hình khi rảnh, giữ bản cũ nếu HTTP/JSON lỗi, rồi cache bản hợp lệ vào NVS. Dashboard hiện không có ACK riêng cho thay đổi lịch/liều.

Người dùng nhập tồn kho đích 0–100 trên modal. Nếu khác giá trị lúc mở modal, Dashboard tạo command. ESP32 lấy lệnh cũ nhất theo key khi rảnh, kiểm tra ID và số, lưu stock cùng command ID vào NVS, công bố `/inventory/compartments`, ghi trạng thái `applied` và xóa lệnh chờ. Lệnh lỗi được đánh `rejected`. `lastAppliedCommandId` trong NVS giúp xử lý lại cùng lệnh khi ACK hoặc xóa pending thất bại. `LOAD` cộng tối đa 10 viên (chặn tại 100); phiên xác minh thành công trừ liều; thay đổi được đánh dấu chờ gửi nếu offline.

**Giới hạn giao thức:** revision tăng trên ESP32 nhưng đường ghi hiện là HTTP `PATCH`, không thấy giao dịch so sánh và hoán đổi với revision ở Firebase. Chưa nên coi revision là bảo đảm giải quyết mọi xung đột nếu có nhiều bên chỉnh dữ liệu trực tiếp. Firmware chỉ lưu **command ID cuối cùng** ở NVS, nên tuyên bố “mọi lệnh chỉ áp dụng đúng một lần trong mọi trường hợp” cần được kiểm thử thêm, nhất là nhiều lệnh cùng ngăn và kết nối chập chờn. Không sửa trực tiếp `/inventory/compartments` từ Firebase Console rồi mong thiết bị áp dụng như một lệnh.

### 6.3. Event, telemetry và kết nối

Event gửi lỗi được giữ trong hàng đợi vòng **tối đa 10 phần tử trong RAM**. Đầy hàng đợi sẽ ghi đè event cũ nhất; reset hoặc hết điện sẽ mất event chưa gửi. Khi online lại, firmware thử gửi bù. Việc gửi REST, đọc cấu hình và lệnh dùng HTTP đồng bộ, nên có thể chặn vòng lặp trong thời gian timeout mạng; không mô tả toàn bộ hệ thống là “100% non-blocking”. Wi-Fi được thử kết nối lại mỗi khoảng 5 giây; telemetry được gửi mỗi khoảng 10 giây nếu có mạng.

`deviceStatus.lastSeen` hiện là `millis()/1000` (số giây từ boot), trong khi Dashboard biến nó thành ngày giờ lịch. Vì vậy thời điểm “cập nhật gần nhất” đang hiển thị sai. Cờ `.info/connected` của Dashboard cho biết **trình duyệt** nối được Firebase, chưa xác nhận ESP32 còn online. Firebase REST trong firmware dùng `WiFiClientSecure::setInsecure()`, tức HTTPS nhưng **không xác minh chứng chỉ máy chủ**. Cần khắc phục trước khi dùng dữ liệu nhạy cảm ngoài môi trường demo. Cấu hình quyền Firebase và token thực tế phải được kiểm tra riêng; không đưa bí mật vào báo cáo. Nguồn: [kế hoạch đồng bộ liều](Ke_hoach_dong_bo_cau_hinh_lieu_thuoc.md), [kế hoạch tồn kho](Ke_hoach_dong_bo_ton_kho_va_cau_hinh_thiet_bi.md), `src/cloud_sync.cpp`, `dashboard/app.js`.

## 7. Hoạt động ngoại tuyến và nguồn dự phòng

| Tình huống | Hành vi có thể suy ra từ bản hiện tại |
|---|---|
| Mất Wi-Fi, ESP32 vẫn có nguồn, RTC hợp lệ, đã cache lịch | Nhắc và xác minh cục bộ tiếp tục; event chờ trong RAM, tồn kho/lịch dùng NVS. |
| Mất Wi-Fi, chưa từng có lịch hợp lệ | Không chạy lịch mặc định; có thể dùng phím Serial để thử từng ngăn khi demo. |
| RTC chưa có giờ, NTP chưa đồng bộ | Không kích hoạt lịch thật; chờ nguồn giờ hợp lệ. |
| Mất điện toàn hộp, DS3231 có pin riêng | RTC giữ giờ, nhưng ESP32/LCD/còi/servo không hoạt động. |
| Tắt máy qua một cữ rồi khởi động lại | Chưa có nhắc bù hoặc ghi nhận cữ đã qua; khóa theo ngày trong RAM cũng khởi tạo lại. |

Mục tiêu thiết kế đã chọn là **duy trì toàn hệ thống ít nhất bốn giờ khi mất điện chính**. Đây là **mục tiêu chưa nghiệm thu**, vì sơ đồ và BOM chưa có bộ nguồn dự phòng hoàn chỉnh, chưa đo tải trung bình/cực đại, chưa thử chuyển nguồn không reset. Khi chế tạo thật cần bộ sạc và power-path/UPS phù hợp, cấp được cả ESP32, LCD, RTC, DHT22, LED, còi, nút và servo; kiểm tra dòng đỉnh servo, sụt áp, bảo vệ pin và thời lượng bốn giờ. Pin CR2032 của RTC không thay thế UPS. Nếu router cũng mất điện thì Dashboard/Cloud không còn cập nhật dù hộp vẫn chạy cục bộ.

Nguồn: [kế hoạch đồng hồ và nguồn](Ke_hoach_dong_ho_thoi_gian_thuc.md), [BOM](Bang_du_toan_chi_phi_va_linh_kien_thuc_te.md), `diagram.json`.

## 8. Dashboard và các thao tác demo

Dashboard có các vùng trạng thái kết nối, nhiệt/ẩm, FSM/cảnh báo, ba thẻ ngăn, lịch sử sự kiện và modal chỉnh cấu hình. Nó đọc tồn kho từ nhánh `/inventory` khi có; nếu chưa có thì có fallback sang trường cũ trong `/config`. Trạng thái command được trình bày riêng với số tồn kho ESP32 đã công bố. Cảnh báo giao diện bật khi nhiệt độ trên 35 °C hoặc độ ẩm trên 75%; trong firmware hiện thấy log cảnh báo nhiệt trên 35 °C, không thấy một cơ chế bảo quản tự động hoặc điều khiển khí hậu.

| Phím Serial | Hành vi kiểm thử |
|---|---|
| `1`, `2`, `3` | Phát nhắc thử ngăn A/B/C mà không đổi đồng hồ; chỉ khi FSM rảnh và ngăn được đánh dấu nạp. |
| `T`, `R`, `S`, `M` | TAKE, REMOVE một đơn vị, SNOOZE, xác nhận lỗi. |
| `L`, `U`, `D` | Nạp tối đa 10 viên cho ngăn đang xem; duyệt ngăn tới/lùi. |
| `O`, `H`, `?` | Mô phỏng quá liều, self-test ngoại vi, in trợ giúp. |

Build theo `platformio.ini` với `esp32dev`, Serial Monitor 115200 baud và Wokwi `diagram.json`. `include/credentials.h` chứa cấu hình kết nối tại máy chạy, không đưa giá trị thực vào tài liệu hoặc ảnh chụp. Phím thử nhắc không phải bằng chứng rằng lịch RTC/Firebase đã được kiểm thử. Nguồn: `README.md`, `src/main.cpp`, `dashboard/app.js`.

## 9. Kiểm thử và tiêu chí nghiệm thu cho báo cáo

Các biên bản ba thành viên có ma trận PASS ở giai đoạn bàn giao trước. Bản mã hiện tại đã thay đổi ở đồng hồ, lịch, nguồn dữ liệu liều và tồn kho; **không chuyển nguyên các nhãn PASS đó sang báo cáo cuối cùng** nếu chưa chạy lại đúng phiên bản sẽ nộp. Nên lưu ảnh/video Wokwi, log Serial có thời gian, dữ liệu Firebase trước/sau và mã commit cho mỗi ca.

| Mã | Ca kiểm thử | Kết quả cần quan sát | Môi trường |
|---|---|---|---|
| T01 | Boot có RTC hợp lệ; sau đó NTP thành công | Giờ/phút/giây ICT đúng; không về giờ mẫu; nguồn giờ hiển thị đúng. | Wokwi và board thật |
| T02 | Cả RTC và NTP không hợp lệ | Báo `TIME_INVALID`; không phát nhắc theo lịch. | Wokwi/board |
| T03 | Có cache lịch, ngắt Wi-Fi rồi khởi động lại | Khôi phục giờ RTC và lịch NVS, nhắc cục bộ đúng giờ. | Board thật ưu tiên |
| T04 | Chưa có cache và mất mạng | Giữ trạng thái chưa có lịch hợp lệ, không phát nhắc từ giờ ví dụ. | Wokwi |
| T05 | Đến cữ A, TAKE, REMOVE đủ liều | Servo mở, đếm đúng, chờ tám giây, đóng, một event thành công, tồn kho giảm đúng. | Wokwi + Firebase |
| T06 | TAKE, REMOVE thiếu hoặc không REMOVE trong 60 giây | `MISMATCH_LESS`/`NO_DETECTION`, không ghi thành công và không trừ tồn kho tự động. | Wokwi + Firebase |
| T07 | REMOVE vượt liều trước khi đóng | `MISMATCH_MORE`, còi/LED lỗi, servo đóng; kiểm tra số tồn kho thực tế với sổ đếm. | Wokwi |
| T08 | SNOOZE, không TAKE trong 10 phút | Hoãn năm phút rồi nhắc lại; cữ lỡ tạo event đúng, không có log trùng. | Wokwi + Firebase |
| T09 | Đổi liều A từ 2 sang 3 ở Dashboard | Firebase nhận thay đổi, ESP32 áp dụng khi rảnh, lời nhắc/xác minh/event dùng 3. | Wokwi + Firebase |
| T10 | Gửi cấu hình thiếu ngăn/sai giờ/sai liều | Firmware giữ bản hợp lệ cũ; không áp dụng một phần. | Wokwi + Firebase |
| T11 | Đặt tồn kho qua Dashboard; LOAD; xác minh liều đúng | Command chuyển pending→applied hoặc rejected; NVS, ESP32, Firebase và Dashboard nhất quán. | Wokwi + Firebase |
| T12 | Mất mạng trong lúc có event và tồn kho mới | Dữ liệu chờ được xử lý khi kết nối lại trong giới hạn RAM/NVS; ghi rõ trường hợp reset. | Wokwi + Firebase |
| T13 | Hai ngăn cùng giờ và reboot trong phút hẹn | Không bỏ cữ, không phát trùng ngoài quy tắc đã chọn. **Mã hiện tại có rủi ro không đạt.** | Wokwi |
| T14 | GPIO35 và nguồn servo trên mạch thật | Nút không trôi; ESP32 không brownout khi servo/Wi-Fi hoạt động. | Board thật |
| T15 | Rút/cắm nguồn chính, chạy bằng pin bốn giờ | Không reset, toàn bộ ngoại vi còn dùng được; đo dòng/điện áp và thời lượng. **Chưa thể thực hiện khi chưa lắp UPS.** | Board thật |

Ngoài việc quan sát giao diện, mỗi test cần ghi **đầu vào, điều kiện ban đầu, thời điểm, kết quả thực tế, ảnh/log minh chứng và kết luận PASS/FAIL**. Với ca chưa chạy, ghi “chưa kiểm thử”; không điền PASS theo kế hoạch.

### Tình trạng xác minh của lần biên soạn này

- Đã đọc toàn bộ chín file Markdown và một file DOCX trong `docs/`, rồi đối chiếu `src/`, `include/`, `dashboard/app.js`, `diagram.json`, `platformio.ini` và README.
- Đã chạy `pio run` cho môi trường `esp32dev` trên bản mã hiện tại: **SUCCESS**, RAM 49.328/327.680 byte (15,1%), Flash 995.845/1.310.720 byte (76,0%). Kết quả này xác nhận biên dịch, không xác nhận các luồng vận hành hay phần cứng thật.
- Chưa chạy Wokwi, chưa kết nối Firebase thật, chưa đo board vật lý trong lần biên soạn này.

## 10. Các điểm cần sửa hoặc quyết định trước khi chốt báo cáo

| Mức ưu tiên | Vấn đề | Tác động và hướng xử lý |
|---|---|---|
| Cao | Lịch trùng giờ có thể bị bỏ qua do `return NULL` khi ngăn đầu đã phát. | Sửa vòng quét để tiếp tục xét ngăn sau; thêm test T13. |
| Cao | `MISSED_DOSE` đang có `userConfirmed=true` và có khả năng ghi thêm event lỗi. | Tách tạo event cữ lỡ khỏi `verify_start()`, đánh dấu đã gửi một lần; test T08. |
| Cao | GPIO35 không có pull-up nội bộ. | Bổ sung điện trở kéo trên board thật, kiểm tra mức logic và debounce. |
| Cao | Chưa có UPS/power-path cho mục tiêu bốn giờ. | Đo tải, chọn nguồn và pin, thử chuyển nguồn, đo runtime; không công bố đã đạt bốn giờ. |
| Trung bình | `lastSeen` dùng thời gian từ boot nhưng Dashboard diễn giải là ngày giờ. | Ghi Unix/server timestamp rồi chỉnh cách hiển thị và xác định offline thiết bị. |
| Trung bình | Event offline chỉ lưu RAM tối đa 10; có thể mất khi reset/đầy queue. | Nếu báo cáo yêu cầu log bền vững, thiết kế lưu bền và chính sách đầy queue; hiện phải nêu giới hạn. |
| Trung bình | Cloud dùng REST đồng bộ và `setInsecure()`. | Đo độ trễ loop, giới hạn timeout, xác minh chứng chỉ khi triển khai ngoài demo. |
| Trung bình | Chỉ một servo, không đo ngăn/viên thật. | Giữ phạm vi demo “mô phỏng đúng lượng”; muốn khẳng định đúng thuốc/ngăn phải thêm cơ khí và cảm biến phù hợp. |
| Trung bình | Tồn kho không tự hiệu chỉnh sau phiên lỗi; không kiểm tra vật lý viên còn lại. | Bổ sung quy trình kiểm kê/nạp lại hoặc cảm biến thật; giải thích sai số trong báo cáo. |
| Thấp | README và biên bản còn câu “3 giây”, “100% non-blocking”, “không mất log”. | Khi hoàn thiện báo cáo, dùng giá trị và giới hạn của bản mã hiện tại. |

Các hướng nghiên cứu như load cell + HX711, QR/barcode/RFID, nhiều khóa ngăn và nguồn dự phòng là **mở rộng**. Load cell chỉ ước lượng khối lượng/số viên sau hiệu chuẩn; nó không tự nhận diện tên thuốc hoặc chứng minh đã uống.

## 11. Chi phí và lựa chọn khi chuyển sang phần cứng thật

[Bảng dự toán](Bang_du_toan_chi_phi_va_linh_kien_thuc_te.md) đưa ra ba phương án lịch sử để thảo luận: gói tiêu chuẩn khoảng **302.500 VND**, gói tối giản khoảng **147.000 VND**, gói nâng cao khoảng **348.000 VND cộng bộ pin/UPS chưa định giá**. Đây là **ước tính trong tài liệu nguồn, chưa được xác minh là giá mua hiện tại**. Các gói thay linh kiện (DHT11/AHT20, OLED, ESP32-C3, bỏ RTC) sẽ cần sửa sơ đồ, driver hoặc làm giảm khả năng chạy offline; không được trình bày như BOM đúng với mã Wokwi hiện tại.

BOM tiêu chuẩn và nâng cao ghi **năm nút**, trong khi `diagram.json` và firmware dùng **bảy nút**. BOM cần cập nhật đủ bảy nút, điện trở kéo ngoài GPIO35, điện trở hạn dòng LED, nguồn servo, vỏ/cơ khí, dây/PCB và chi phí UPS. Trước khi mua, chốt một cấu hình phần cứng thực tế rồi lập lại bảng số lượng, đơn giá, tổng giá và phép đo tải. Mục tiêu bốn giờ không thể suy ra trực tiếp từ dung lượng mAh ghi trên cell.

## 12. Gợi ý sử dụng làm nền báo cáo đồ án

| Phần báo cáo | Nội dung lấy từ tài liệu này | Minh chứng cần bổ sung |
|---|---|---|
| Đặt vấn đề, mục tiêu, phạm vi | Mục 1 | Yêu cầu/đề cương đã được giảng viên duyệt. |
| Thiết kế hệ thống | Mục 2–4 và 6–7 | Sơ đồ khối, sơ đồ mạch đã chốt, lý do chọn linh kiện. |
| Thiết kế thuật toán | Mục 4–6 | Sơ đồ FSM, lưu đồ lịch và lệnh tồn kho, ví dụ payload. |
| Hiện thực | Mục 3, 5, 6, 8 | Ảnh Wokwi/Dashboard, trích mã ngắn gọn, cấu hình build. |
| Thực nghiệm, đánh giá | Mục 9 | Bảng test thực tế, log, ảnh/video, phiên bản mã, số đo nguồn. |
| Giới hạn và hướng phát triển | Mục 1.3, 7, 10–11 | Giải thích giới hạn cảm biến, bảo mật, nguồn, độ tin cậy. |

Trong báo cáo, dùng “**xác minh số tín hiệu REMOVE theo liều mô phỏng**”, “**ngăn được gán trong cấu hình**” và “**đã ghi yêu cầu lên Firebase**” khi đó là điều thực sự quan sát được. Chỉ dùng “đã lấy đúng thuốc”, “đã uống thuốc”, “chạy bốn giờ” hoặc “thiết bị đã áp dụng cấu hình” khi có cảm biến, ACK hoặc phép đo tương ứng.

## 13. Nguồn nội bộ đã tổng hợp

- [Tài liệu kỹ thuật hiện có](Tai_lieu_ky_thuat_Hop_thuoc_thong_minh.md): mô tả kiến trúc và trạng thái cập nhật gần đây.
- [Kế hoạch triển khai Wokwi](Ke_hoach_trien_khai_hop_thuoc_thong_minh_Wokwi.docx): yêu cầu gốc, tiêu chí xác minh và giới hạn mô phỏng.
- [Kế hoạch đồng bộ liều](Ke_hoach_dong_bo_cau_hinh_lieu_thuoc.md), [kế hoạch tồn kho](Ke_hoach_dong_bo_ton_kho_va_cau_hinh_thiet_bi.md), [kế hoạch đồng hồ và nguồn](Ke_hoach_dong_ho_thoi_gian_thuc.md), [kế hoạch GPIO](Ke_hoach_khoa_gpio_va_cong_khong_su_dung.md): thay đổi mới và phần chưa nghiệm thu.
- [Biên bản thành viên 1](Bien_ban_ban_giao_Thanh_vien_1.md), [thành viên 2](Bien_ban_ban_giao_Thanh_vien_2.md), [thành viên 3](Bien_ban_ban_giao_Thanh_vien_3.md): phân công và kết quả báo cáo tại các mốc bàn giao cũ.
- [Bảng dự toán](Bang_du_toan_chi_phi_va_linh_kien_thuc_te.md): phương án linh kiện và chi phí tham khảo.
- [README](../README.md), `src/`, `include/`, `dashboard/`, `diagram.json`, `platformio.ini`: mốc đối chiếu hành vi của repository.

*Tài liệu này là bản tổng hợp có kiểm soát trạng thái. Khi mã, sơ đồ hoặc kết quả kiểm thử thay đổi, cập nhật mốc rà soát và các mục liên quan trước khi dùng làm bản nộp cuối cùng.*
