# Kế hoạch đưa GPIO không sử dụng về trạng thái an toàn trong firmware

**Trạng thái:** Đã triển khai cấu hình GPIO trong firmware, cập nhật pin map và build `pio run` thành công. Board vật lý chưa được xác nhận; chưa nghiệm thu runtime trên phần cứng.

## 1. Mục tiêu và phạm vi

Rà soát các GPIO của ESP32, rồi cập nhật firmware để các GPIO được xác nhận là không dùng không bị cấu hình thành đầu ra hoặc điều khiển tải ngoài ý muốn. Các chân được thiết bị sử dụng tiếp tục hoạt động như hiện tại.

Kế hoạch này chỉ giới hạn ở cấu hình GPIO trong firmware. Không thay đổi firewall/cổng mạng, cách build phát triển và sử dụng thật, giao diện Serial/UART/JTAG, Secure Boot hay eFuse.

> Firmware có thể đặt một GPIO thành input/high-impedance; việc này không phải khóa vật lý và không ngăn firmware khác cấu hình lại chân đó.

## 2. Hiện trạng pin map

Đối chiếu `src/hardware.cpp`, `include/config.h`, `diagram.json` và bảng GPIO trong tài liệu kỹ thuật.

| GPIO | Chức năng hiện tại | Trạng thái |
|---|---|---|
| 2 | LED xanh nhắc thuốc | Đang dùng; chân strapping, không đưa vào danh sách chân trống. |
| 4 | DATA DHT22 | Đang dùng. |
| 12 | Nút TAKE | Đang dùng; chân strapping, không đưa vào danh sách chân trống. |
| 13 | Servo | Đang dùng. |
| 14 | Nút DOWN | Đang dùng. |
| 15 | LED đỏ | Đang dùng; chân strapping, không đưa vào danh sách chân trống. |
| 21, 22 | I²C cho LCD và DS3231 | Đang dùng. |
| 25 | Buzzer | Đang dùng. |
| 26, 27, 32, 33 | Các nút MENU, UP, LOAD, SNOOZE | Đang dùng làm input. |
| 35 | Nút REMOVE | Đang dùng làm input; GPIO34–39 chỉ hỗ trợ input và không có pull-up/pull-down nội bộ. |

GPIO18, GPIO19, GPIO23, GPIO34, GPIO36 và GPIO39 chưa thấy được gán cho ngoại vi trong mã/sơ đồ hiện tại. Đây chỉ là **danh sách ứng viên**: cần xác nhận không có dây hoặc chức năng bổ sung trên board thật trước khi đưa vào firmware như các chân không dùng. GPIO0 và GPIO5 cũng chưa thấy gán, nhưng là chân strapping nên không tự động xem là chân trống an toàn.

GPIO6–11 thường nối với flash; GPIO16–17 có thể được dùng cho flash/PSRAM tùy module. GPIO12–15 có chức năng JTAG; GPIO0, 2, 5, 12, 15 là chân strapping. GPIO34–39 chỉ hỗ trợ input và không có pull nội bộ. Các chân này có giới hạn phần cứng nên không được đưa vào danh sách output hoặc áp dụng cấu hình đồng loạt. [Tài liệu GPIO ESP32 của Espressif](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/gpio.html)

## 3. Nội dung đã triển khai

### A — Rà soát và chốt theo mã nguồn hiện tại

Đã đối chiếu `src/hardware.cpp`, `diagram.json` và cấu hình `esp32dev` trong `platformio.ini`. Danh sách đang dựa trên pin map của project/Wokwi; chưa có board vật lý để xác nhận dây nối ngoài sơ đồ.

### B — Đặt chân không dùng về input trong firmware

1. Đã thêm danh sách GPIO không dùng `{18, 19, 23, 34, 36, 39}` vào `src/hardware.cpp`.
2. `hw_initAll()` gọi cấu hình danh sách này thành `INPUT` trước khi khởi tạo ngoại vi; không bật pull-up/pull-down hay ghi mức output lên các chân đó.
3. Không áp dụng cấu hình hàng loạt lên mọi GPIO và không đổi chân của thiết bị đang sử dụng.
4. Đã bổ sung ghi chú pin map tương ứng vào tài liệu kỹ thuật.

## 4. Tiêu chí nghiệm thu dự kiến

| Hạng mục | Kết quả cần đạt |
|---|---|
| Pin map | Mỗi GPIO được ghi nhận rõ là đang dùng, không dùng đã xác nhận, hoặc bị loại khỏi danh sách vì có chức năng đặc biệt. |
| Kiểm tra mã | Danh sách sáu GPIO được cấu hình thành `INPUT`; build thành công xác nhận mã biên dịch. |
| Build firmware | `pio run` hoàn tất thành công cho `esp32dev`. |
| Khởi động | ESP32 khởi động ổn định qua cấp nguồn và reset thông thường. |
| Hồi quy chức năng | LCD, RTC, DHT22, servo, LED, buzzer và các nút tiếp tục hoạt động. |
| Điện trạng GPIO | Đo/quan sát các chân đã chốt không thấy firmware chủ động drive mức output hoặc điều khiển tải. |

Build đã xác nhận mã biên dịch được. Khởi động và hồi quy chức năng trên board thật vẫn cần nghiệm thu trực tiếp; Wokwi không xác nhận được dây nối vật lý ngoài sơ đồ.

## 5. Rủi ro và giới hạn

- Sơ đồ Wokwi không xác nhận được dây nối, điện trở kéo và linh kiện có sẵn trên board vật lý; danh sách chân không dùng cần xác nhận lại trên phần cứng thật.
- GPIO2, GPIO12 và GPIO15 đang được dùng, đồng thời là chân strapping. Kế hoạch giữ nguyên ánh xạ hiện tại và không thay đổi mạch boot; cấu hình lúc reset có thể phụ thuộc board thật.
- GPIO34–39 không có pull nội bộ; nút REMOVE ở GPIO35 hiện cần được xem xét riêng nếu tín hiệu input trên board thật bị trôi. Đây là ghi chú phần cứng liên quan, không tự ý thay đổi trong kế hoạch khóa GPIO trống.
- `INPUT` không khóa vĩnh viễn GPIO; nó chỉ đặt trạng thái mặc định trong firmware đang chạy và không thay thế biện pháp bảo vệ vật lý.

## 6. Kết quả triển khai

Đã cập nhật mã firmware và tài liệu pin map trong phạm vi cấu hình GPIO. Danh sách chân chưa được kiểm chứng trên phần cứng vật lý; nếu board thực tế có thiết bị nối GPIO18/19/23/34/36/39 ngoài `diagram.json`, cần cập nhật danh sách trước khi nạp firmware.
