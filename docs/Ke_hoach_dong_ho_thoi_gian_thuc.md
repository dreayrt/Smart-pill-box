# Kế hoạch duy trì đồng hồ và nhắc uống khi mất điện

**Trạng thái:** Đã triển khai phần firmware và cập nhật tài liệu. Mục tiêu UPS 4 giờ đã được chọn; cần lắp và đo phần cứng thật trước khi xác nhận runtime.

## Tình trạng sau triển khai

- Firmware khôi phục giờ từ DS3231, đồng bộ NTP khi có Wi-Fi và hiển thị giờ Việt Nam UTC+7. Đã bỏ giờ giả 07:50 và lệnh đặt giờ mẫu khi RTC báo mất nguồn.
- Khi chưa có giờ hợp lệ, trạng thái là TIME_INVALID và lịch không được kích hoạt.
- Cấu hình A/B/C hợp lệ được cache vào NVS, khôi phục khi offline; khóa lịch tính theo ngày. Nếu chưa có lịch cache và tải Firebase thất bại, lịch mẫu mặc định không được kích hoạt.
- Phím 1/2/3 gọi thử chuông tương ứng mà không chỉnh đồng hồ.
- **Chưa thể duy trì LCD/còi/servo khi cúp điện chỉ bằng firmware.** diagram.json không có pin/UPS/power-path; cần lắp nguồn dự phòng 5V có sạc và chuyển nguồn liên tục cho toàn tải, sau đó đo runtime thực tế.
- Mục tiêu người dùng chọn: toàn hệ thống duy trì tối thiểu **4 giờ**. Dung lượng cell và module UPS chưa chốt vì chưa có phép đo dòng của mạch thật.
- Nếu thiết bị tắt qua giờ uống sau khi UPS hết pin, firmware hiện không phát nhắc bù hoặc ghi nhận missed-dose sau khởi động. Luồng này cần bổ sung khi có chính sách rõ ràng; thiết bị không tự mở ngăn hoặc tự xác nhận đã uống.

## 1. Tình trạng ban đầu trước khi triển khai

| Khu vực | Hiện trạng | Tác động |
|---|---|---|
| `src/main.cpp` | `simHour` và `simMinute` khởi tạo cố định ở `07:50`. Chỉ được thay bằng RTC nếu `hw_getRTCTime()` trả về thành công. | Nếu RTC không khả dụng, màn hình khởi động bằng giờ giả `07:50`. |
| `src/main.cpp` | Khi không đọc được RTC, chương trình tự cộng một phút mỗi 60 giây; màn hình và Serial luôn in giây là `00`. | Đồng hồ chỉ mô phỏng thời gian trôi, không bám giờ hiện tại và không thể hiện giây thực. |
| `src/hardware.cpp` | Khi `rtc.lostPower()` đúng, firmware đặt DS3231 về mốc viết cứng `2026-10-12 07:59:50`. | RTC có thể chạy tiếp nhưng vẫn bắt đầu từ một thời điểm mẫu, không phải giờ hiện tại. |
| `src/hardware.cpp` | Nếu `rtc.begin()` thất bại, RTC bị đánh dấu không khả dụng và firmware dùng giờ mô phỏng. | Cần xem dòng `[HARDWARE] RTC DS3231...` trong Serial để xác định vì sao phiên Wokwi đang rơi về `07:50`. |
| `diagram.json` | Đã khai báo DS3231 và nối SDA/SCL với GPIO 21/22, chung bus I2C với LCD. | Sơ đồ có thiết bị RTC; vẫn cần xác nhận firmware nhận RTC khi chạy. |
| `diagram.json` | LCD và servo đang lấy nguồn từ chân `5V` của ESP32 DevKit; chưa có pin dự phòng hoặc mạch chuyển nguồn tự động. | Khi nguồn USB/adapter mất, ESP32, LCD, còi và servo tắt. RTC có thể giữ giờ riêng nếu có pin coin-cell, nhưng không thể phát nhắc. |
| `docs/Bang_du_toan_chi_phi_va_linh_kien_thuc_te.md` | Bản ban đầu từng ước lượng 12–24 giờ cho 18650 + TP4056 + boost dù chưa đo tải hay thiết kế chuyển nguồn liên tục. | Đã bỏ cam kết 12–24 giờ khỏi BOM; mục tiêu 4 giờ sẽ cần UPS/cell được sizing và đo trên mạch thật. |
| `src/cloud_sync.cpp` | Có kết nối Wi-Fi/Firebase nhưng chưa thấy luồng đồng bộ giờ NTP. | Kết nối Firebase hiện không làm đồng hồ ESP32 thành giờ thực. |
| `src/cloud_sync.cpp` | Ban đầu NVS chỉ lưu tồn kho và lệnh tồn kho; cấu hình lịch Firebase chưa được cache. | Đã bổ sung cache NVS và khôi phục lịch khi offline. |
| `src/schedule.cpp` | Khóa chống kích hoạt lặp chỉ lưu giờ, phút và ID ngăn, chưa lưu ngày. | Khi đồng hồ chạy thật qua nhiều ngày, cùng một lịch có thể bị khóa sau lần kích hoạt đầu tiên. |

Ảnh cho thấy `07:50:00`, trùng chính xác với giá trị khởi tạo trong `src/main.cpp`. Chưa thể kết luận chỉ từ ảnh rằng RTC bị thiếu hoặc hỏng; cần kiểm tra dòng khởi tạo RTC ở đầu Serial. Dù RTC có hoạt động, mốc đặt giờ cứng khi `lostPower()` vẫn cần được loại bỏ.

## 2. Mục tiêu

1. Hiển thị giờ hiện hành theo múi giờ Việt Nam (UTC+7), bao gồm giờ, phút và giây.
2. Dùng thời gian thực để đối chiếu lịch thuốc; không tự bịa giờ mặc định như `07:50`.
3. Giữ khả năng chạy ngoại tuyến nếu DS3231 có thời gian hợp lệ và pin dự phòng còn tốt.
4. Không phát nhắc theo một giờ giả nếu cả RTC lẫn NTP đều chưa cung cấp được thời gian hợp lệ.
5. Không để các phím kiểm thử `1/2/3` làm thay đổi đồng hồ thời gian thực.
6. Duy trì hoạt động nhắc uống cục bộ khi mất điện trong thời lượng dự phòng đã chọn, gồm ESP32, LCD, RTC, cảm biến, đèn, còi, nút bấm và servo.
7. Lưu cấu hình lịch gần nhất trong NVS để nhắc đúng lịch nếu thiết bị khởi động lại trong lúc Wi-Fi/Firebase không khả dụng.

## 3. Phương án đề xuất

### Nguồn giờ

- **Khi ESP32 online:** Đồng bộ giờ với NTP theo timezone `ICT-7` (UTC+7, giờ Việt Nam). Dùng thời gian hệ thống ESP32 làm nguồn thời gian chạy và cập nhật lại DS3231 để giữ giờ khi mất mạng hoặc khởi động lại.
- **Khi ESP32 offline:** Nếu DS3231 có thời gian hợp lệ, dùng RTC làm nguồn dự phòng và tiếp tục chạy độc lập với mạng. Để giữ giờ khi mất điện hoàn toàn, module DS3231 phải có pin dự phòng (thường là CR2032) còn tốt và được lắp đúng vào chân VBAT.
- **Khi chưa có nguồn giờ hợp lệ:** Đặt trạng thái đồng hồ là `TIME_INVALID`, hiển thị `--:--:--` hoặc thông báo tương đương và tạm không kích hoạt lịch thuốc. Khi NTP hoặc RTC trở nên hợp lệ, tự chuyển sang hoạt động bình thường.
- Lưu một quy ước duy nhất cho thời gian DS3231 và chuyển đổi UTC+7 ở lớp đồng hồ. Phương án dự kiến là lưu UTC trong RTC để tránh cộng múi giờ hai lần.
- Thử đồng bộ NTP lúc khởi động khi có mạng, khi Wi-Fi kết nối lại và định kỳ thưa để hiệu chỉnh sai lệch. Quá trình chờ NTP phải có giới hạn thời gian và không chặn vòng lặp điều khiển lâu.

### Duy trì toàn bộ thiết bị khi cúp điện

- Dùng nguồn adapter chính kết hợp bộ pin dự phòng có sạc và chuyển nguồn tự động (power-path/UPS), để đường nguồn đầu ra không bị ngắt khi adapter mất điện. Nguồn dự phòng phải cấp được cho ESP32 và toàn bộ ngoại vi đang cần hoạt động: LCD/backlight, RTC, DHT22, LED, còi, nút và servo.
- Thiết kế đầu ra ổn áp phù hợp với bo ESP32 và ngoại vi. Servo SG90 có dòng khởi động/xung tải cao; dự kiến cấp servo qua nhánh nguồn riêng đủ dòng, nối chung GND tín hiệu, để servo không làm sụt áp khiến ESP32/LCD khởi động lại.
- Chọn bộ pin có bảo vệ quá dòng, ngắn mạch, quá sạc và xả quá mức; có chỉ báo/đo mức pin để firmware cảnh báo pin yếu. Không nối trực tiếp pin Li-ion thô vào chân 5V/3V3.
- **Thời lượng dự phòng đã chọn: tối thiểu 4 giờ cho toàn bộ thiết bị.** Dung lượng cell/UPS sẽ chốt sau khi đo dòng trung bình và cực đại trên mạch thật, tính hiệu suất chuyển đổi và dự trữ; không sử dụng ước lượng 12–24 giờ cũ làm cam kết.
- Khi bộ nguồn báo mất adapter, firmware tiếp tục chạy từ pin, hiển thị trạng thái `BACKUP POWER` và ghi nhận sự kiện. Khi pin gần cạn, cảnh báo mức pin thấp. Nếu pin hết, thiết bị tắt; RTC coin-cell chỉ còn giữ thời gian.
- Khi router/Wi-Fi mất, thiết bị vẫn nhắc theo cấu hình lịch đã lưu cục bộ; không cam kết dashboard/Firebase trực tuyến trong thời gian đó. Các bản ghi chờ đồng bộ được gửi lại sau khi mạng trở về.
- Lịch đã tải từ Firebase phải được lưu vào NVS sau khi kiểm tra hợp lệ. Khi khởi động offline, firmware nạp bản lịch gần nhất từ NVS thay vì dùng lịch mẫu mặc định. Nếu chưa từng có lịch hợp lệ và cũng không có mạng, hiển thị lỗi cấu hình và không phát nhắc theo lịch mẫu.
- Mô phỏng Wokwi có thể kiểm tra logic trạng thái nguồn nếu thêm tín hiệu mô phỏng, nhưng không chứng minh dung lượng pin, chuyển nguồn không gián đoạn, dòng đỉnh servo hoặc thời lượng chạy; các tiêu chí này cần đo trên phần cứng thật.

### Đồng hồ và lịch thuốc

- Thay `simHour`, `simMinute` cùng bộ đếm cộng một phút bằng một dịch vụ đồng hồ duy nhất trả về ngày, giờ, phút, giây và trạng thái hợp lệ.
- Đọc thời gian thực từ system clock đã đồng bộ NTP; dùng DS3231 làm nguồn ngoại tuyến. Loại bỏ các mốc thời gian khởi tạo viết cứng trong `main.cpp` và `hardware.cpp`.
- Chỉ gọi kiểm tra lịch khi thời gian hợp lệ. So lịch theo giờ địa phương UTC+7.
- Sửa khóa kích hoạt lịch để ghi nhận ngày cùng giờ/phút và ngăn chạy lặp nhiều lần trong cùng một ngày, nhưng vẫn cho phép lịch lặp lại vào ngày kế tiếp.
- Giữ các phím `1/2/3` như lệnh kiểm thử ngăn A/B/C nếu cần, nhưng chuyển chúng sang kích hoạt kiểm thử riêng; không thay đổi giờ thật của hệ thống.

## 4. Tiến độ triển khai

1. **UPS/power-path và sơ đồ nguồn — CÒN LẠI:** Chưa chọn module/cell vì chưa đo dòng tải. Khi lắp thật, phải bảo đảm chuyển nguồn không gián đoạn; cấp cho ESP32 và tất cả ngoại vi, kể cả LCD/backlight, cảm biến, đèn, còi và servo. Tách nhánh servo nếu phép đo cho thấy cần thiết. Sau khi đo, chọn năng lượng pin theo tải trung bình trong 4 giờ, hiệu suất chuyển đổi và dung lượng sử dụng; bộ nguồn cũng phải chịu được dòng đỉnh đo được.
2. **Lưu lịch cục bộ — ĐÃ XONG:** Cache cấu hình hợp lệ A/B/C trong NVS và khôi phục trước khi thử kết nối Firebase; giữ nguyên tồn kho NVS hiện có.
3. **Dịch vụ đồng hồ — ĐÃ XONG:** Dùng DS3231 khi offline, NTP khi có Internet, timezone ICT-7 (UTC+7), trả về snapshot có ngày/giờ/giây/nguồn và trạng thái hợp lệ.
4. **Khởi tạo RTC — ĐÃ XONG:** Bỏ giờ đặt cứng; không coi RTC mất nguồn hoặc chưa có giờ hợp lệ là thời gian thật. NTP cập nhật system clock và DS3231.
5. **Lịch và kiểm thử — ĐÃ XONG:** Không chạy lịch khi TIME_INVALID; khóa kích hoạt theo ngày; phím 1/2/3 thử chuông ngăn tương ứng mà không thay đổi giờ.
6. **Tài liệu — ĐÃ XONG:** README, tài liệu kỹ thuật và BOM nêu hành vi offline, mục tiêu 4 giờ và giới hạn khi chưa có UPS vật lý.
7. **Nghiệm thu tải — CÒN LẠI:** Sau khi lắp UPS, đo dòng/điện áp khi Wi-Fi truyền, còi chạy và servo hoạt động; xác nhận không brownout và đủ ít nhất 4 giờ.
8. **Cữ bị lỡ khi thiết bị tắt qua giờ hẹn — CÒN LẠI:** Hiện firmware không phát nhắc bù hay ghi MISSED sau khởi động lại. Không tự mở ngăn hoặc xác nhận đã uống; cần quyết định chính sách riêng trước khi triển khai phần này.
## 5. Phạm vi thay đổi

- `src/main.cpp`: bỏ đồng hồ khởi tạo `07:50`, bỏ bộ đếm giả; dùng dịch vụ đồng hồ và trạng thái giờ hợp lệ.
- `src/hardware.cpp`, `include/hardware_interface.h`: bỏ mốc RTC mẫu; bổ sung đọc/ghi thời gian RTC có ngày đầy đủ và báo trạng thái thiết bị.
- `src/cloud_sync.cpp`: lưu cấu hình lịch hợp lệ vào NVS để dùng sau khi khởi động offline; giữ hoạt động đồng bộ Firebase khi mạng trở lại.
- `include/sync_interface.h` hoặc module đồng hồ/nguồn riêng: khai báo API trạng thái pin, nguồn chính/dự phòng, NTP và RTC.
- `src/schedule.cpp`, `include/schedule.h`: chống kích hoạt lặp theo ngày thay vì chỉ theo giờ/phút.
- `src/power_monitor.cpp` / `include/power_monitor.h` (nếu cần tách module): đọc trạng thái adapter, mức pin và cảnh báo nguồn dự phòng.
- `diagram.json`: cập nhật sơ đồ nguồn/power-fail nếu Wokwi hỗ trợ mô phỏng; sơ đồ hiện chưa có battery pack hoặc mạch chuyển nguồn.
- `README.md`, `docs/Tai_lieu_ky_thuat_Hop_thuoc_thong_minh.md` và `docs/Bang_du_toan_chi_phi_va_linh_kien_thuc_te.md`: cập nhật vận hành offline, sơ đồ nguồn và BOM sau khi chốt linh kiện.

## 6. Tiêu chí nghiệm thu

| Tình huống | Kết quả mong đợi |
|---|---|
| Khởi động Wokwi/ESP32 online, NTP đồng bộ thành công | LCD và Serial hiển thị giờ Việt Nam hiện tại; giây thay đổi mỗi giây, không bắt đầu ở `07:50`. |
| RTC khởi tạo được nhưng Wi-Fi/NTP không khả dụng | Firmware lấy giờ DS3231 và chạy lịch bình thường. |
| RTC báo mất điện, nhưng Wi-Fi/NTP hoạt động | NTP cung cấp giờ hợp lệ và hiệu chỉnh DS3231; không đặt RTC về mốc ngày/giờ mẫu. |
| Cả RTC không khả dụng lẫn NTP thất bại | LCD/Serial báo giờ chưa hợp lệ; không báo thức nhầm theo giờ giả. |
| ESP32 khởi động offline với RTC hợp lệ | Giờ tiếp tục chạy và lịch vẫn hoạt động mà không cần Firebase. |
| Ngắt Wi-Fi và nguồn chính trong khi pin dự phòng DS3231 còn tốt; sau đó cấp nguồn lại | DS3231 vẫn giữ thời gian; firmware khởi động lại và tiếp tục từ giờ RTC, không về `07:50` hay mốc mẫu. Kiểm tra này cần thực hiện trên phần cứng thật. |
| Mất nguồn khi pin dự phòng DS3231 không có hoặc đã cạn | Firmware báo `TIME_INVALID`, không kích hoạt lịch theo giờ giả và yêu cầu khôi phục nguồn giờ. |
| Rút adapter chính khi pin backup còn điện, đồng thời tắt Wi-Fi/router | ESP32 không reset khi chuyển nguồn; LCD, cảm biến, nút, LED và còi tiếp tục hoạt động cục bộ; lịch lấy từ NVS; servo mở/đóng được khi thao tác. Firebase được đánh dấu offline và dữ liệu chờ gửi sau. |
| Chạy toàn bộ hệ thống trên pin đến runtime mục tiêu đã duyệt | Không brownout/reset khi Wi-Fi truyền hoặc servo quay; toàn bộ tính năng cục bộ duy trì ít nhất thời lượng đã duyệt ở tải đo được. |
| Pin gần cạn và pin hết | Thiết bị phát cảnh báo mức thấp; khi hết pin thì tắt an toàn. Khi cấp nguồn lại, khôi phục đúng giờ từ DS3231 và đúng lịch/tồn kho từ RTC/NVS. |
| Nguồn mất trong lúc một lịch uống đến hạn nhưng pin dự phòng toàn hệ thống còn hoạt động | LCD/còi/LED vẫn nhắc theo giờ. Nếu pin đã cạn và thiết bị tắt qua giờ hẹn, sau khởi động firmware ghi nhận lịch bị lỡ theo chính sách được duyệt. |
| Khởi động lại khi vừa mất điện vừa mất Wi-Fi | Firmware nạp giờ từ RTC và cấu hình lịch gần nhất từ NVS; không quay về giờ hoặc lịch mẫu. |
| Bộ sạc cấp nguồn cho tải đồng thời với sạc pin; rút/cắm adapter | Hệ thống tự chuyển nguồn không sụt áp làm reset, không cấp ngược giữa hai nguồn, pin được sạc theo thông số an toàn. |
| Kiểm thử các phím `1/2/3` | Có thể kiểm tra từng ngăn nhưng giờ thật không bị nhảy về giờ lịch. |
| Một lịch đã chạy hôm nay rồi sang ngày tiếp theo | Lịch được phép kích hoạt lại đúng một lần vào ngày kế tiếp. |
| So sánh giờ trên LCD, Serial và giờ địa phương Việt Nam | Các nguồn hiển thị thống nhất giờ/phút/giây, không lệch 7 giờ. |

## 7. Rủi ro và quy tắc an toàn

- NTP cần truy cập mạng; Firebase online là dấu hiệu có Wi-Fi nhưng không đảm bảo NTP luôn tới được. Vì vậy DS3231 vẫn là nguồn dự phòng ngoại tuyến.
- Mất Wi-Fi nhưng ESP32 còn nguồn không làm mất giờ DS3231. Mất cả nguồn chính chỉ giữ được giờ nếu pin dự phòng của DS3231 còn tốt; ESP32 không thể tự biết giờ hiện tại nếu RTC cũng mất nguồn và NTP không truy cập được.
- Pin coin-cell của DS3231 chỉ giữ giờ, không cấp nguồn cho ESP32, LCD, còi hay servo. Muốn tiếp tục nhắc khi cúp điện cần pin dự phòng cho toàn bộ tải của thiết bị.
- Pin dự phòng có dung lượng hữu hạn. Nếu yêu cầu “luôn chạy” không giới hạn thời gian, cần nguồn ngoài liên tục như UPS điện lưới/solar phù hợp; pin trong hộp chỉ cam kết được runtime đã đo và duyệt.
- Servo và Wi-Fi có thể tạo tải đỉnh gây sụt áp/reset. Cần đo dòng cực đại trên mạch hoàn chỉnh, kiểm tra khả năng cấp dòng của bộ pin/ổn áp, và thử chuyển nguồn thực tế; không suy ra runtime chỉ từ mAh ghi trên cell.
- Mạch charger/power-path phải hỗ trợ vừa cấp tải vừa sạc và chuyển nguồn tự động; cần kiểm tra bảo vệ pin và tránh back-feed. ESP32 cùng ngoại vi có yêu cầu dòng khác nhau, nên phải sizing theo tải thật và hướng dẫn phần cứng ESP32.
- Nếu router/modem cũng mất điện thì dashboard/Firebase không thể kết nối dù hộp thuốc còn pin. Kế hoạch đảm bảo nhắc cục bộ; muốn kết nối cloud trong thời gian đó cần cấp nguồn dự phòng riêng cho router/modem và còn kết nối Internet.
- Cấu hình lịch hợp lệ đã được lưu vào NVS sau khi tải/kiểm tra từ Firebase; tồn kho tiếp tục dùng vùng NVS riêng. Cần nghiệm thu khởi động lại offline trên thiết bị thật.
- Cần duyệt chính sách cho cữ uống rơi vào thời gian thiết bị tắt: firmware hiện so khớp đúng phút nên có thể bỏ lỡ cữ đó sau khi khởi động lại. Kế hoạch chưa tự quyết định phát nhắc bù; việc này cần được thống nhất trước khi triển khai.
- DS3231 có thông số độ chính xác ±2 ppm trong khoảng 0–40°C theo nhà sản xuất; đây là sai số hữu hạn, không phải thời gian tuyệt đối chính xác. Pin dự phòng và RTC vẫn cần được kiểm tra/bảo trì.
- Nếu RTC chưa được cài giờ và thiết bị offline, không có cách an toàn để suy ra giờ hiện tại. Firmware phải báo trạng thái giờ không hợp lệ thay vì âm thầm chọn một mốc giả.
- Không sử dụng timestamp từ dữ liệu cấu hình Firebase làm nguồn giờ chính; dữ liệu đó có thể cũ hoặc bị lệch và không đảm bảo độ chính xác thời gian thực.
- Không thay đổi cấu hình liều/lịch hoặc cấu trúc Firebase ngoài phần cần thiết để cung cấp thời gian cho lịch hiện tại.

## 8. Quyết định và việc còn lại

Kiến trúc **NTP khi online + DS3231 giữ giờ dự phòng + lịch cache trong NVS + không chạy theo giờ/lịch giả** đã được triển khai trong firmware. Phần UPS/power-path cho toàn bộ hộp là phần cứng còn lại; mục tiêu đã chọn là 4 giờ.

Thông số phần cứng cần chốt theo tải đo:

| Quyết định | Trạng thái/đã chọn | Ghi chú |
|---|---|---|
| Thời lượng chạy bằng pin | **Đã chọn: tối thiểu 4 giờ cho toàn bộ hệ thống.** | Chưa xác nhận cho đến khi đo dòng trên mạch thật và nghiệm thu pin/UPS. |
| Servo khi mất điện | Vẫn cấp được để mở/đóng nắp trong thời gian dự phòng. | Tính cả dòng đỉnh lúc servo chuyển động vào thiết kế. |
| Wi-Fi/router khi mất điện | Hộp thuốc vẫn chạy lịch cục bộ; cloud có thể offline. | Nếu cần dashboard/Firebase trong cúp điện, phải backup router/modem riêng. |
| Lịch bị lỡ sau khi pin toàn hệ thống cạn | Chưa xử lý bằng firmware; hiện không phát nhắc bù sau khi khởi động. | Cần thống nhất chính sách cho cữ bị lỡ trước khi bổ sung; không tự mở ngăn hoặc ghi đã uống. |

Firmware thời gian thực, chế độ offline và cache lịch đã được cập nhật. Việc còn lại là chọn/lắp module power-path và cell theo tải đo, rồi nghiệm thu chuyển nguồn và runtime 4 giờ theo mục 6. Wokwi không thể chứng minh dung lượng pin hay độ ổn định của nguồn thật.

## 9. Tài liệu tham khảo phần cứng

- [Hướng dẫn nguồn cho ESP32 của Espressif](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32/schematic-checklist.html): khuyến nghị nguồn cần đáp ứng tải của ESP32; ngoại vi phải được tính thêm theo ứng dụng thực tế.
- [MCP73871 của Microchip](https://ww1.microchip.com/downloads/en/DeviceDoc/MCP73871-Data-Sheet-20002090E.pdf): ví dụ bộ điều khiển sạc Li-ion có system load sharing/power-path. Đây là tham khảo kiến trúc, chưa phải lựa chọn linh kiện cuối cùng.
- [DS3231 của Analog Devices](https://www.analog.com/en/products/ds3231.html): RTC có ngõ pin dự phòng để duy trì thời gian; pin này không cấp nguồn cho phần còn lại của hộp thuốc.
