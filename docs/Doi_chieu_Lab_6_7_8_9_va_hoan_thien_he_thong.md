# Đối chiếu Lab 6 7 8 9 với hệ thống hộp thuốc thông minh

> Bổ sung sau lần đối chiếu này: đã triển khai mã Firebase Auth/rules, MQTT TLS, Node-RED Dashboard và backend vòng đời alarm/Telegram. Xem [hướng dẫn và bằng chứng kiểm thử mới](Trien_khai_phan_quyen_MQTT_NodeRED_Telegram.md). Các mục “chưa có” bên dưới giữ kết quả đánh giá tại đợt rà soát ban đầu; triển khai lên Firebase thật và kết nối bot vẫn cần thông tin tài khoản tương ứng.

Ngày rà soát: 16/11/2026. Phạm vi: bốn tài liệu lab người dùng cung cấp và mã nguồn trong `E:\IoT`.

Hệ thống đã có điều khiển cục bộ, lịch ba ngăn, RTC/NTP, xác minh số tín hiệu lấy viên, Firebase, dashboard và lưu dữ liệu khi offline. Các khoảng trống lớn là MQTT theo Lab 6, nền tảng no-code và phân quyền theo Lab 7, phép đo độ trễ thật theo Lab 8, cùng toàn bộ vòng đời cảnh báo và thông báo bên ngoài theo Lab 9. Đợt này bổ sung phần đồng bộ và giám sát để trạng thái hiển thị có bằng chứng từ ESP32.

## Nguồn và cách đánh giá

- [Lab 6](<C:/Users/Gigabyte/Downloads/Lab 6.docx>): JSON, MQTT publish/subscribe, giải mã lệnh và ACK.
- [Lab 7](<C:/Users/Gigabyte/Downloads/Lab 7.docx>): dashboard no-code, widget, biểu đồ, cảnh báo và chia sẻ theo quyền.
- [Lab 8](<C:/Users/Gigabyte/Downloads/Lab 8.docx>): ánh xạ dữ liệu, đồng bộ hai chiều, boot/reconnect, đo độ trễ và giảm lưu lượng.
- [Lab 9](<C:/Users/Gigabyte/Downloads/Lab 9.docx>): Rule Chain, phân cấp cảnh báo, gửi thông báo và tự phục hồi.

Mỗi lab có 5 bài trên lớp và 3 bài về nhà, tổng cộng 32 mục. Nội dung lab được dùng làm tiêu chí tham chiếu; các thao tác đăng ký dịch vụ, gửi email, gửi Telegram hoặc đổi nền tảng trong tài liệu không tự trở thành yêu cầu thực thi lên tài khoản của người dùng.

Các mức trong bảng dưới đây phản ánh mã sau đợt bổ sung này:

- **Có**: tìm thấy triển khai tương ứng; mức kiểm thử được ghi riêng ở cuối báo cáo.
- **Một phần**: mới có một số thành phần hoặc dùng cách triển khai tương đương về chức năng.
- **Chưa có**: chưa tìm thấy trong repository.
- **Chưa nghiệm thu**: cần chạy trên dịch vụ hoặc phần cứng thật để xác nhận.

Firebase HTTPS có thể đáp ứng chức năng gửi dữ liệu, nhận cấu hình và phản hồi trạng thái. Tuy nhiên, cách này không chứng minh đã thực hiện MQTT publish/subscribe. Dashboard tự viết cũng không chứng minh đã thiết kế trên nền tảng no-code. Nếu chấm theo đúng công cụ/giao thức trong đề, cần làm riêng các phần tương ứng.

## Các năng lực cốt lõi cần đạt

| Năng lực | Kết quả cần nhìn thấy ở hệ thống hộp thuốc |
|---|---|
| Dữ liệu có cấu trúc | JSON có định danh, kiểu dữ liệu rõ, thời gian đúng, phân biệt dữ liệu chưa hợp lệ. |
| Hai chiều có xác nhận | Web gửi cấu hình/lệnh; ESP32 kiểm tra, áp dụng khi phù hợp và báo lại giá trị đang chạy. |
| Trạng thái đáng tin | Phân biệt web nối Firebase với ESP32 còn gửi dữ liệu; nút vật lý và thay đổi FSM được phản ánh trên web. |
| Phục hồi kết nối | Mất mạng vẫn nhắc theo lịch đã lưu; khi mạng trở lại gửi trạng thái và dữ liệu chờ. |
| Giám sát có lịch sử | Xem nhiệt/ẩm hiện tại, biểu đồ và kết quả lấy thuốc; khoảng mất dữ liệu không được nối thành tín hiệu liên tục. |
| Cảnh báo có vòng đời | Phát hiện → tạo cảnh báo → phân cấp → gửi thông báo khi cần → tự xóa khi phục hồi; hạn chế gửi lặp. |
| Quyền và bằng chứng | Người chỉ xem không ghi được ở database; người cấu hình có quyền phù hợp; có log và phép đo kiểm chứng. |

## Đối chiếu Lab 6

| Mục | Yêu cầu tài liệu | Hiện trạng và phần cần bổ sung |
|---|---|---|
| Trên lớp 1 | Tạo và serialize JSON gồm định danh, nhiệt độ, độ ẩm, timestamp | **Có về chức năng** qua ArduinoJson. Telemetry dùng `deviceId`, `currentTemp`, `currentHumid`, `lastSeen`, `receivedAt`; cần bảng ánh xạ nếu bài chấm đòi đúng tên trường `device_id`, `temperature`, `humidity`, `timestamp`. |
| Trên lớp 2 | Publish JSON MQTT mỗi 5 giây | **Một phần**: gửi Firebase HTTPS, heartbeat mục tiêu 5 giây. **Chưa có MQTT/PubSubClient/broker/topic**. |
| Trên lớp 3 | Subscribe topic và callback nhận lệnh | **Chưa có MQTT**. Luồng tương đương hiện là polling cấu hình/lệnh Firebase. |
| Trên lớp 4 | Parse lệnh JSON để điều khiển | **Có về chức năng**: kiểm tra lịch/liều và lệnh tồn kho. Chưa có lệnh relay ON/OFF hay callback MQTT của bài mẫu. |
| Trên lớp 5 | Vừa publish vừa subscribe, không nghẽn loop | **Một phần**: gửi và nhận được tích hợp, lịch dùng `millis()`. HTTP REST vẫn đồng bộ, có thể chặn FSM khi mạng chậm; không đạt cam kết hoàn toàn không chặn. |
| Về nhà 1 | DHT, LDR, RSSI trong JSON mỗi 10 giây | **Một phần**: có DHT22 và đã thêm RSSI; chưa có LDR hay MQTT. LDR chỉ cần thêm nếu thực hiện đúng bài này hoặc cần đo ánh sáng buồng thuốc. |
| Về nhà 2 | Điều khiển hai thiết bị độc lập bằng JSON | **Một phần**: có nhiều trường cấu hình và ba ngăn logic, nhưng chưa có hai chấp hành độc lập điều khiển từ xa như đèn/quạt. Không dùng ba ngăn logic làm bằng chứng cho ba khóa vật lý. |
| Về nhà 3 | ACK sau khi thực hiện lệnh | **Có về chức năng**: tồn kho có `applied/rejected`; lịch/liều nay có `/reportedConfig` là bản đang chạy. Chưa có topic ACK MQTT. |

## Đối chiếu Lab 7

| Mục | Yêu cầu tài liệu | Hiện trạng và phần cần bổ sung |
|---|---|---|
| Trên lớp 1 | Tạo Template và Data Streams trên nền tảng no-code | **Chưa có** Blynk/Node-RED UI. Firebase schema và web tự viết là kiến trúc hiện tại. |
| Trên lớp 2 | Gauge và Value Display, đơn vị và thang đo | **Một phần**: đã hiển thị số nhiệt/ẩm với đơn vị; chưa có Gauge theo cấu hình no-code. |
| Trên lớp 3 | History Chart và khoảng xem | **Có về chức năng** sau bổ sung: hai biểu đồ nhiệt/ẩm, 15 phút/1 giờ/24 giờ; tối đa một mẫu/phút. |
| Trên lớp 4 | Switch, Button, Slider điều khiển hai chiều | **Một phần**: modal đổi lịch/liều/tồn kho, có xác nhận; chưa có Switch/Slider điều khiển chấp hành của bài mẫu. |
| Trên lớp 5 | Bố cục web và mobile | **Một phần**: CSS responsive, biểu đồ về một cột trên màn hẹp; chưa nghiệm thu trên điện thoại thật hoặc mobile app riêng. |
| Về nhà 1 | 2 Gauge, 1 Chart, trạng thái kết nối, trễ không quá 5 giây | **Một phần**: số liệu, biểu đồ và heartbeat thiết bị đã có; chưa có hai Gauge và chưa đo độ trễ đầu cuối. Chu kỳ gửi 5 giây không có nghĩa độ trễ tổng luôn dưới 5 giây. |
| Về nhà 2 | Vượt ngưỡng → push điện thoại, đổi màu và Event Log | **Một phần**: có đổi màu nhiệt/ẩm trên web. Nhật ký uống thuốc không thay thế nhật ký cảnh báo môi trường. Chưa có push và bản ghi alarm bền vững. |
| Về nhà 3 | Người dùng phụ chỉ xem | **Chưa có** đăng nhập và phân quyền. Cần kiểm tra bằng tài khoản viewer và yêu cầu ghi trực tiếp vào database bị từ chối. Chỉ ẩn nút trên giao diện không đủ. |

## Đối chiếu Lab 8

| Mục | Yêu cầu tài liệu | Hiện trạng và phần cần bổ sung |
|---|---|---|
| Trên lớp 1 | Bảng ánh xạ firmware và kênh dữ liệu, hằng số config | **Có**: bảng bên dưới; các nhánh telemetry, reported config, history và chu kỳ chính được định nghĩa ở `include/config.h`. |
| Trên lớp 2 | Tích hợp client vào firmware chính, duy trì kết nối | **Có nhưng còn hạn chế**: `cloud_init/cloud_loop` trong chương trình chính, dùng HTTP Client đúng một lựa chọn của lab. Request mạng vẫn đồng bộ. |
| Trên lớp 3 | Publish khi trạng thái thực thay đổi | **Có**: so FSM hiện tại với trạng thái đã gửi thành công; gửi ở lần xử lý đủ điều kiện tiếp theo, giới hạn thử gửi cách nhau 1 giây. Không cam kết truyền mọi trạng thái thoáng qua ngắn hơn chu kỳ này. |
| Trên lớp 4 | Sync on Boot | **Có**: lần cloud loop đầu gửi telemetry, công bố cấu hình thực và đồng bộ tồn kho theo luồng hiện có. Chưa đo GPIO thực bằng cảm biến phản hồi; đây là trạng thái logic firmware. |
| Trên lớp 5 | Đo latency vòng App → ESP32 → App | **Chưa nghiệm thu**: có các luồng và ACK nhưng chưa có log đo latency end-to-end thật. |
| Về nhà 1 | Nút vật lý và app cùng điều khiển một LED/relay | **Một phần**: thao tác vật lý/FSM được báo web, web thay lịch/tồn kho. Chưa có đúng kịch bản LED/relay toggle ở cả hai phía. |
| Về nhà 2 | Auto-recovery và resync toàn bộ trạng thái | **Có về logic**: reconnect Wi-Fi theo chu kỳ 5 giây, tải lại cấu hình khi rảnh, gửi lại telemetry, reported config và tồn kho, đẩy event chờ. Test dùng mock; cần thử mất Internet khi Wi-Fi vẫn còn. |
| Về nhà 3 | Debounce, throttling, dead-band | **Có**: nút 50 ms, cảm biến kiểm tra theo chu kỳ 1 giây; gửi thay đổi từ 0,5°C/2 điểm % độ ẩm, heartbeat 5 giây, thử lại telemetry ít nhất cách nhau 1 giây. |

## Đối chiếu Lab 9

| Mục | Yêu cầu tài liệu | Hiện trạng và phần cần bổ sung |
|---|---|---|
| Trên lớp 1 | Rule Chain và các node | **Chưa có** Rule Engine/ThingsBoard/luồng xử lý tương đương phía backend. |
| Trên lớp 2 | Filter vượt ngưỡng và nhánh bình thường | **Một phần**: điều kiện nhiệt >35°C/ẩm >75% ở web và log nhiệt ở firmware. Chưa có tuyến xử lý backend. |
| Trên lớp 3 | Tạo Alarm có loại, severity và tiêu đề | **Chưa có** bản ghi alarm môi trường với trạng thái vòng đời. Cờ `activeAlarm` là nhắc thuốc/lỗi FSM, không phải alarm môi trường. |
| Trên lớp 4 | Send Email với nội dung động | **Chưa có** cấu hình gửi và backend gửi email. |
| Trên lớp 5 | Kiểm thử telemetry → alarm → email thật | **Chưa có** bằng chứng end-to-end. |
| Về nhà 1 | Warning 30–35°C và Critical >35°C | **Chưa có** phân tầng hai mức và hành động tương ứng. Các ngưỡng trong lab là ví dụ học tập. |
| Về nhà 2 | Telegram Bot thay Email | **Chưa có** tích hợp gửi Telegram. Cần token/chat ID ở phía backend và đích nhận được người dùng xác định. |
| Về nhà 3 | Clear Alarm khi giảm dưới 28°C và báo phục hồi | **Chưa có** hysteresis, clear event và thông báo phục hồi. Đổi lại màu widget chưa phải Clear Alarm. |

## Các lỗi đã sửa trong đợt này

| Phát hiện trước khi sửa | Hành vi sau khi sửa | Tệp chính |
|---|---|---|
| `lastSeen = millis()/1000` bị web hiểu thành ngày giờ từ 1970 | `lastSeen` là Unix giây khi RTC/NTP hợp lệ, bằng 0 khi chưa có giờ; `uptimeSeconds` riêng. `receivedAt` do Firebase cấp, đơn vị ms. Event không còn dùng uptime làm timestamp dự phòng. | `src/cloud_sync.cpp` |
| Web nối Firebase được báo như ESP32 online | Web kiểm tra heartbeat mới nhất, trừ sai lệch giờ bằng `serverTimeOffset`; quá 15 giây báo mất tín hiệu. Timer vẫn chạy dù Firebase không có bản tin mới. | `dashboard/model.js`, `dashboard/app.js` |
| Firmware gửi `IDLE/OPEN/ERROR`, web chờ `STATE_*` | Bộ ánh xạ nhận cả hai dạng; trạng thái chưa biết không bị mặc định thành bình thường. | `dashboard/model.js` |
| Telemetry cố định 10 giây, thiếu báo thay đổi trạng thái | Có gửi khi FSM/cảm biến thay đổi, heartbeat 5 giây, retry và dead-band. Bộ nhớ “đã gửi” chỉ cập nhật sau HTTP thành công. | `src/cloud_sync.cpp` |
| Lưu cấu hình trên Firebase chưa chứng minh ESP32 đã áp dụng | `/reportedConfig/compartments` báo cấu hình thực. Web so sánh từng trường, hiển thị chờ hoặc khớp bản ESP32 báo gần nhất. | Firmware và dashboard |
| Không có lịch sử môi trường | Vòng 1.440 ô, mẫu/phút khi có mạng và giờ hợp lệ; biểu đồ lọc theo timestamp và ngắt đường khi thiếu mẫu trên 2 phút. | Firmware và dashboard |
| DHT chưa đọc được vẫn có số mẫu mặc định hoặc giữ số cũ khi lỗi | Khởi tạo NaN, mẫu lỗi không được thay bằng số giả. JSON dùng null/thiếu giá trị và `sensorValid`; web hiển thị `--`. | `src/hardware.cpp`, `src/cloud_sync.cpp` |
| Giới hạn độ dài tên ở web tính theo ký tự, ESP32 theo byte | Web kiểm tra UTF-8 theo giới hạn bộ đệm 31/15 byte, tránh lưu chuỗi tiếng Việt rồi firmware từ chối. | `dashboard/model.js`, `dashboard/app.js` |
| Một số dữ liệu database được chèn trực tiếp vào HTML | Escape các trường log và thẻ ngăn đã chỉnh để nội dung không trở thành thẻ HTML. | `dashboard/app.js` |
| Script demo có token ghi cứng | Script đọc token/hostname từ biến môi trường và dừng trước khi gửi nếu thiếu; thêm ignore cho cấu hình local. File `include/credentials.h` đã được Git theo dõi từ trước vẫn cần xử lý riêng. | `scripts/mock_push.js`, `.gitignore` |

## Hợp đồng dữ liệu sau bổ sung

| Dữ liệu hoặc biến | Nhánh Firebase | Chiều | Quy ước |
|---|---|---|---|
| Định danh | `/deviceStatus/deviceId` | ESP32 → web | Hiện là một thiết bị `pillbox-nhom13`; chưa phải hệ thống nhiều thiết bị. |
| Nhiệt độ, độ ẩm | `/deviceStatus/currentTemp`, `currentHumid` | ESP32 → web | Số hữu hạn; null/không có khi lỗi. |
| Tình trạng mẫu | `/deviceStatus/sensorValid` | ESP32 → web | True khi cả hai mẫu hữu hạn. |
| Thời gian ESP32 | `/deviceStatus/lastSeen`, `timeValid`, `timeSource` | ESP32 → web | `lastSeen`: Unix giây hoặc 0, không dùng uptime. |
| Heartbeat máy chủ | `/deviceStatus/receivedAt` | Firebase → web | Unix mili giây; SDK nhận giá trị số sau khi server xử lý `{ ".sv": "timestamp" }`. |
| Chẩn đoán | `/deviceStatus/uptimeSeconds`, `rssi` | ESP32 → web | Giây từ boot và RSSI dBm. |
| FSM, nhắc/lỗi | `/deviceStatus/currentState`, `activeAlarm` | ESP32 → web | Trạng thái logic; chưa có đo xác nhận chuyển động servo. |
| Cấu hình mong muốn | `/config/compartments/{A,B,C}` | Web → ESP32 | Lịch, tên, mã, liều, trạng thái nạp; kiểm tra toàn bộ trước khi áp dụng khi IDLE. |
| Cấu hình thực | `/reportedConfig/compartments/{A,B,C}`, `/reportedConfig/reportedAt` | ESP32 → web | Snapshot đang chạy và thời điểm máy chủ nhận xác nhận. Không khẳng định máy còn online nếu snapshot đã cũ. |
| Tồn kho thực và lệnh | `/inventory/compartments`, `/inventoryCommands/pending`, `/inventoryCommands/status` | Hai chiều | Giữ giao thức set-target và ACK đã có. |
| Lịch sử môi trường | `/telemetryHistory/{0000..1439}` | ESP32 → web | Ô = `(unixTime / 60) % 1440`; payload có `timestamp` giây, `receivedAt` ms, nhiệt/ẩm và `sensorValid`. |
| Kết quả lấy viên | `/events/{eventId}` | ESP32 → web | Chỉ là bằng chứng tín hiệu lấy viên mô phỏng, không xác nhận đã uống thuốc. |

Chu kỳ truyền là mục tiêu lập lịch trong firmware, không phải SLA. Request HTTPS đồng bộ có thể làm chu kỳ kéo dài. Lịch sử môi trường chưa có hàng đợi offline; khoảng mất mạng sẽ thiếu mẫu. Sau 24 giờ dữ liệu mới ghi đè ô cũ; nếu thiết bị không gửi lâu, các ô cũ vẫn tồn tại nhưng web lọc chúng khỏi khoảng xem. Đây là bộ nhớ vòng theo thời gian, không phải cơ chế xóa đúng hạn theo server.

## Những phần cần làm tiếp theo mức ưu tiên

### Ưu tiên 1 trước khi dùng ngoài demo

1. **Xác thực và phân quyền**: Firebase Auth cùng rules theo vai trò viewer/caregiver/device. Viewer chỉ đọc; người quản lý ghi cấu hình/lệnh; ESP32 ghi reported state/event. Cần kiểm tra rules thực tế; repository hiện chưa có bằng chứng cấu hình đã triển khai. `include/credentials.h` đang được Git theo dõi, thêm `.gitignore` không xóa bản đã tracked hoặc lịch sử Git. Nếu đã chia sẻ token, cần thay token và xử lý lịch sử phù hợp.
2. **Xác minh TLS**: thay `setInsecure()` bằng xác minh chứng chỉ phù hợp môi trường triển khai, có phương án cập nhật chứng chỉ. Chưa thay trong đợt này vì cần kiểm tra kết nối triển khai thật.
3. **Tránh request mạng làm chậm điều khiển**: đưa truyền thông vào tác vụ/hàng đợi riêng với snapshot có kiểm soát truy cập; FSM, nút, khóa và còi cần tiếp tục chạy khi HTTPS timeout. `cloud_init` còn có chờ Wi-Fi tối đa 8 giây; self-test có nhiều `delay()`.
4. **Đối soát tồn kho khi lỗi lấy viên**: mã hiện chỉ trừ kho sau phiên đúng liều; khi thiếu/thừa, tín hiệu lấy viên vẫn có thể đã xảy ra nhưng kho giữ nguyên. Cần quy tắc ghi nhận số viên thực lấy và cờ yêu cầu đối soát, tránh sửa vội thành trừ thêm hai lần.

### Ưu tiên 2 hoàn thành chuỗi cảnh báo của Lab 9

Xây dựng xử lý chạy phía backend để vẫn hoạt động khi không mở web. Có thể chọn một nền tảng Rule Engine đúng bài học hoặc một worker phù hợp kiến trúc Firebase; không coi đổi màu trên browser là backend cảnh báo.

```text
Telemetry hoặc event lấy viên
  → kiểm tra hợp lệ và còn mới
  → xác định loại cảnh báo và severity
  → tạo/cập nhật alarm có mã riêng
  → ghi lịch sử và đưa thông báo vào hàng đợi
  → gửi qua đích đã cấu hình, ghi kết quả và retry
  → điều kiện phục hồi có hysteresis
  → clear alarm và ghi nhận phục hồi
```

Mỗi alarm cần tối thiểu: `alarmId`, `deviceId`, `type`, `severity`, `state`, `openedAt`, `updatedAt`, `clearedAt`, dữ liệu kích hoạt và tình trạng thông báo. Chống spam bằng nhận diện alarm đang mở và chỉ gửi lại khi tăng mức nghiêm trọng hoặc hết khoảng nhắc được cấu hình. Cần tự phát hiện mất heartbeat ở backend nếu muốn cảnh báo khi cả ESP32 lẫn browser đều không hoạt động.

Dùng ngưỡng 30/35/28°C của lab để nghiệm thu logic mẫu; ngưỡng bảo quản thực phải lấy từ yêu cầu từng thuốc. Có thể mở rộng sang bỏ lỡ cữ, lấy thừa, kho thấp và lỗi cảm biến sau khi chuỗi cơ bản đã được kiểm thử.

### Ưu tiên 3 hoàn thiện bằng chứng bài lab và sản phẩm

- Nếu yêu cầu nộp đúng Lab 6: thêm môi trường MQTT riêng, broker/topic rõ, publish, subscribe, callback, lệnh hợp lệ/không hợp lệ và ACK. Xác định nguồn cấu hình duy nhất để REST và MQTT không ghi đè nhau.
- Nếu cần đúng Lab 7 no-code: thiết kế dashboard tham chiếu trên Blynk/Node-RED hoặc nền tảng được môn học chấp nhận; tạo viewer thật và thử trên điện thoại. Có hai Gauge theo yêu cầu bài.
- Bổ sung trạng thái từ chối cấu hình kèm lý do. Snapshot ACK hiện cho biết khớp/chưa khớp nhưng chưa phân biệt tất cả nguyên nhân đang chờ, payload sai hoặc lỗi quyền.
- Đo latency bằng `commandId`, thời điểm web gửi, thời điểm ESP32 áp dụng, thời điểm web nhận ACK. Không diễn giải `reportedAt` hiện có là số đo latency của một lệnh cụ thể.
- Bổ sung phân trang nhật ký `/events`; hiện web còn tải toàn bộ log. Hàng đợi event offline hiện tối đa 10 bản, đầy sẽ mất bản cũ nhất; cần chỉ báo mất dữ liệu hoặc mở rộng lưu trữ theo nhu cầu.
- Nghiệm thu cảm biến đếm viên thật, ba khóa ngăn độc lập, phản hồi khóa/servo và nguồn dự phòng. Mô hình Wokwi một servo và nút REMOVE chưa chứng minh các khả năng đó.
- Kiểm tra restart giữa phiên, lịch chồng nhau và cữ bị bỏ qua khi máy bận hoặc mất nguồn. Đây là yêu cầu mở rộng theo bài toán hộp thuốc, không phải nguyên văn bốn lab.

## Cách chạy và nghiệm thu thay đổi hiện tại

1. Build firmware, rồi chạy Wokwi/ESP32 bằng cấu hình Firebase hiện có. Xác nhận thiết bị có quyền ghi `/reportedConfig` và `/telemetryHistory`, web có quyền đọc hai nhánh. Không mở toàn bộ database công khai để tránh lỗi quyền.
2. Chờ một heartbeat: kiểm tra `receivedAt` là epoch ms hiện tại; `lastSeen` là epoch giây khi RTC/NTP hợp lệ. Khi chưa có giờ, heartbeat vẫn được ghi nhờ server timestamp nhưng không sinh lịch sử có giờ giả.
3. Ngắt ESP32 trong khi trình duyệt vẫn nối Firebase: sau khoảng 15 giây web báo mất tín hiệu. Kết nối lại thiết bị và kiểm tra trạng thái/tồn kho/cấu hình được báo lại.
4. Đổi liều/lịch trên web: thẻ hiện chờ, sau ESP32 áp dụng thì đổi thành khớp. Trong phiên đang lấy thuốc, phải giữ liều cũ và đợi IDLE mới áp dụng.
5. Dùng phím `1/T/R/S/M` để quan sát đổi trạng thái trên web. Kiểm tra các tên `REMINDER`, `OPEN`, `VERIFIED`, `ERROR` được diễn giải đúng.
6. Có mạng và giờ hợp lệ ít nhất hai phút: kiểm tra biểu đồ có mẫu; đổi khoảng 15 phút/1 giờ/24 giờ; ngắt mạng và xác nhận khoảng thiếu mẫu không bị vẽ nối nếu cách hơn 2 phút.
7. Làm DHT trả mẫu không hợp lệ: web hiển thị `--`; không tự dùng 28°C/65% như mẫu thật. Dữ liệu lịch sử không tạo đường giả qua mẫu lỗi.

Các kiểm thử tự động chạy hoàn toàn cục bộ; không đẩy dữ liệu lên Firebase thật:

```powershell
& .\tests\host\run_tests.ps1
node .\tests\dashboard\test_dashboard.cjs
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run
```

| Kiểm chứng | Kết quả |
|---|---|
| Logic lịch, FSM và xác minh trên host | 55 kiểm tra qua, 0 lỗi. |
| Tích hợp firmware với Wi-Fi/HTTP/Firebase/NVS/RTC giả lập | 147 kiểm tra qua, 0 lỗi; gồm timestamp, boot, dead-band, heartbeat, HTTP 503/403, reconnect, ACK và bộ nhớ vòng lịch sử. |
| Mô hình dữ liệu và luồng dashboard trong DOM/Firebase giả lập | 26 kiểm tra qua, 0 lỗi; gồm dữ liệu cũ, ánh xạ FSM, ACK, biểu đồ, dữ liệu rỗng và escape HTML. |
| Build mục tiêu ESP32 | Thành công; RAM tĩnh 49.384/327.680 byte (15,1%), flash 1.002.169/1.310.720 byte (76,5%). |
| Firebase thật, Wokwi đang chạy, phần cứng thật, latency đầu cuối | Chưa nghiệm thu trong đợt này. |
| Bố cục trên trình duyệt/điện thoại thật | Chưa nghiệm thu bằng trình duyệt hoặc điện thoại thật; kiểm thử DOM không thay thế kiểm tra bố cục. |

## Tham chiếu giao thức Firebase

- [Firebase REST Save Data](https://firebase.google.com/docs/database/rest/save-data): REST JSON và server timestamp.
- [Firebase Web Offline Capabilities](https://firebase.google.com/docs/database/web/offline-capabilities): `.info/connected` phản ánh kết nối của từng client; `serverTimeOffset` dùng ước lượng sai lệch đồng hồ.

Các nguồn này giải thích giao thức, không xác nhận rules hoặc kết nối dự án đã được nghiệm thu.
