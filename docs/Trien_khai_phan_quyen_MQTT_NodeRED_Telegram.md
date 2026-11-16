# Triển khai phân quyền MQTT Node RED và Telegram trên máy này

Bản mở rộng ngày 16/11/2026 chạy dịch vụ nền Node.js trên máy Windows hiện tại, dùng Firebase Auth cho web, MQTT TLS cho ESP32 và FlowFuse Dashboard trong Node-RED cho dashboard kéo thả. Telegram gửi từ backend, không cần mở web.

## Trạng thái kết nối thực tế

Đã xác thực đúng tài khoản chủ dự án `smart-pillbox-iot-c2775`, tạo Web App, bật Email/Password qua Firebase Console và triển khai rules lên Firebase thật. Đã kiểm tra đăng nhập admin/viewer, khách chưa đăng nhập bị chặn, viewer đọc được nhưng không ghi được liều, admin ghi được. Các phép kiểm tra ghi dùng đúng giá trị hiện tại, không thay đổi liều. Rules và cấu hình/tồn kho cũ đã được sao lưu tại `services/data/backups`.

Backend cùng hai Node-RED đã được khởi động chạy nền trên máy này; thông tin tiến trình ở `.pio/services.pid`, log ở `.pio/services.log` và `.pio/services-error.log`. MQTT TLS của phiên chạy thật đã nhận được cấu hình đủ A/B/C qua subscribe; đây là kiểm tra kết nối broker, chưa phải bằng chứng ESP32/Wokwi đã chạy thông suốt. Bot Telegram `@hopthuoc_thuan_2026_bot` đã được xác minh, nhận chat sau tin `ketnoi`, gửi tin kiểm tra thành công và bật trong dịch vụ nền. Hàng đợi cảnh báo đã ghi nhận giao nhận thật ở trạng thái `SENT`.

Tài khoản Firebase Auth riêng của dashboard được lưu ở `services/secrets/dashboard-accounts.json`, gồm admin và viewer với mật khẩu ngẫu nhiên. Chúng độc lập với tài khoản Google quản trị dự án. Không đưa tệp này vào Git hoặc chia sẻ cả hai tài khoản cho người chỉ xem.

### Cách xác thực backend đang dùng trên máy này

Đã chọn rõ tài khoản đã đăng nhập bằng `FIREBASE_CLI_ACCOUNT` trong `services/.env`. Backend lấy access token từ bộ đệm riêng sẵn có của Firebase CLI và tự refresh trong bộ nhớ; không sao chép refresh token hay mật khẩu Google vào dự án. Đã kiểm tra refresh token thành công. Cách này cần Firebase CLI đã đăng nhập dưới cùng tài khoản Windows; nếu đăng xuất/thu hồi quyền hoặc CLI thay đổi API nội bộ, cần đăng nhập lại hoặc chuyển sang service account.

Đường dẫn thư viện CLI mặc định trên Windows là `%USERPROFILE%/AppData/Roaming/npm/node_modules/firebase-tools/lib`, có thể đổi qua `FIREBASE_TOOLS_LIB`. `GOOGLE_APPLICATION_CREDENTIALS` vẫn được ưu tiên nếu được cấu hình; phương án service account bên dưới là lựa chọn khác khi triển khai lên máy chủ, không phải bước còn thiếu của phiên chạy cục bộ hiện tại.

`services/.env` và `include/mqtt_credentials.h` đã được tạo riêng với mật khẩu ngẫu nhiên. Không đưa các tệp này hoặc `services/secrets/` vào Git, ảnh chụp hay báo cáo. Chứng chỉ MQTT cục bộ được ghim trong firmware và có thời hạn 365 ngày; cần cấp lại và cập nhật firmware khi hết hạn hoặc địa chỉ máy đổi. Chạy lại setup không ghi đè cấu hình firmware đã được chỉnh thủ công.

## Kiến trúc

```text
Web người dùng ─ Firebase Auth và ID token ─ Firebase RTDB rules
                                                  ↑
ESP32 ─ MQTT TLS có tài khoản và ACL ─ broker ─ bridge Admin SDK
                                                  │
                    alarm state + outbox trên đĩa ← telemetry
                              │                   │
                     Telegram Bot API       API có phân quyền
                                                  │
                          Node-RED viewer và caregiver riêng
```

Chế độ mặc định PlatformIO là `esp32dev-mqtt`; Wokwi trỏ tới bản này. Chế độ MQTT không dùng REST secret cũ để ghi Firebase. Backend bridge là bên được tin cậy ghi trạng thái thực bằng Admin SDK. Không triển khai rules mới rồi tiếp tục chạy firmware REST cũ vì đường ghi trực tiếp của firmware cũ sẽ bị chặn.

## Bước 1 Kết nối đúng Firebase

1. Đăng nhập tài khoản có dự án:

   ```powershell
   firebase login:add
   firebase projects:list
   ```

   Nếu máy có nhiều tài khoản, chọn tài khoản đúng bằng `firebase login:use EMAIL`. Danh sách phải có `smart-pillbox-iot-c2775` trước khi tiếp tục. Không chia sẻ kết quả `firebase login:list --json` vì đầu ra có thể chứa token; chỉ dùng `firebase login:list` khi kiểm tra tài khoản.

2. Trong Firebase Console của đúng dự án, bật Authentication → Sign-in method → Email/Password. Tạo tài khoản cho người quản lý và người chỉ xem bằng mật khẩu riêng.

3. Tạo service account key phù hợp dự án trong Project settings → Service accounts. Lưu JSON ở `E:\IoT\services\secrets\firebase-admin.json`. Điền dòng sau trong `E:\IoT\services\.env`:

   ```dotenv
   GOOGLE_APPLICATION_CREDENTIALS=E:/IoT/services/secrets/firebase-admin.json
   ```

   Service account chỉ ở backend. Admin SDK bỏ qua client rules theo thiết kế; không đặt file này trong dashboard hoặc firmware.

4. Lấy Firebase Web app config từ Project settings → Your apps. Tạo `dashboard/firebase-config.local.js` với cấu hình **web công khai**:

   ```javascript
   window.PILLBOX_FIREBASE_CONFIG = {
     apiKey: 'WEB_API_KEY_CUA_DU_AN',
     authDomain: 'smart-pillbox-iot-c2775.firebaseapp.com',
     databaseURL: 'https://smart-pillbox-iot-c2775-default-rtdb.asia-southeast1.firebasedatabase.app/',
     projectId: 'smart-pillbox-iot-c2775'
   };
   ```

5. Cấp claims cho hai email đã tạo:

   ```powershell
   npm run user:role -- EMAIL_NGUOI_QUAN_LY caregiver
   npm run user:role -- EMAIL_CHI_XEM viewer
   ```

   Người dùng phải đăng nhập lại sau khi đổi claims. Claims được Admin SDK gán, người dùng không tự ghi vai trò. Tất cả vai trò đều gắn với `pillboxId=pillbox-nhom13`.

## Bước 2 Khởi động dịch vụ và chuyển sang rules mới

```powershell
npm ci
npm run setup:local
npm start
```

Dịch vụ cần kết nối Firebase thành công trước khi mở API và broker. Thiếu service account sẽ báo lỗi rồi dừng; không tự giả lập đã kết nối. Chạy trên loopback mặc định:

| Thành phần | Địa chỉ |
|---|---|
| Web chính và API | `http://127.0.0.1:8787` |
| Broker MQTT TLS | `mqtts://127.0.0.1:8883` |
| Node-RED chỉ xem | `http://127.0.0.1:1880/dashboard/pillbox` |
| Node-RED người chăm sóc | `http://127.0.0.1:1881/dashboard/pillbox` |

Sau khi backend, tài khoản web và firmware MQTT sẵn sàng, triển khai rules:

```powershell
firebase deploy --only database --project smart-pillbox-iot-c2775
```

Rules mới khóa đọc/ghi mặc định. Viewer chỉ đọc các nhánh cần giám sát. Caregiver/admin đổi cấu hình và tạo yêu cầu tồn kho; không được tự ghi telemetry, tồn kho thực, ACK applied, alarm hoặc vai trò. Bridge ghi các nhánh đó sau khi nhận dữ liệu thiết bị hoặc chạy logic cảnh báo.

Rules cấu hình yêu cầu đủ A/B/C và chỉ các trường `compartmentId`, `medicineCode`, `displayName`, `unitsPerDose`, `schedule`, `isLoaded`. Nếu cấu hình cũ còn `currentStock`, cần chuyển số sang `/inventory/compartments` và loại trường cũ khỏi cấu hình trước khi cập nhật bằng web mới. Có lệnh kiểm tra và chuyển cấu trúc:

```powershell
npm run firebase:check
npm run firebase:migrate
```

Lệnh migrate sao lưu cấu hình/tồn kho trong `services/data/backups` trước khi ghi. Nó giữ tồn kho đã có, chỉ khởi tạo ngăn chưa có từ số legacy hợp lệ hoặc 0; không dùng số mẫu trong firmware làm số đo thật. Dự án mới có cấu hình ba ngăn mặc định chưa nạp và tồn kho 0. Hãy kiểm tra/nạp đúng thuốc rồi mới bật trạng thái sẵn sàng.

## Bước 3 Chạy ESP32 bằng MQTT TLS

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e esp32dev-mqtt
```

Wokwi for VS Code có Private IoT Gateway tích hợp để ESP32 mô phỏng truy cập máy này qua `host.wokwi.internal`, theo [tài liệu cấu hình Wokwi](https://docs.wokwi.com/vscode/project-config). Nếu dùng Wokwi trên web, cần chạy/bật Private Gateway theo [hướng dẫn Wi-Fi](https://docs.wokwi.com/guides/esp32-wifi). Nếu gateway chưa hoạt động, firmware không thể truy cập broker loopback; việc build thành công không xác nhận mô phỏng đã nối được broker.

Với ESP32 thật, đổi `MQTT_BROKER_HOST` thành IP LAN có trong SAN chứng chỉ, cấu hình broker nghe địa chỉ LAN bằng `MQTT_BIND` và cho phép cổng MQTT TLS qua firewall theo mạng sử dụng. Không đổi sang `setInsecure()` để bỏ qua lỗi chứng chỉ. Backend từ chối mở broker ra LAN nếu không có cert/key.

| Topic | Bên gửi | Ý nghĩa |
|---|---|---|
| `pillbox/pillbox-nhom13/telemetry` | ESP32 | JSON định danh, nhiệt/ẩm, timestamp, FSM, RSSI. |
| `.../events` | ESP32 | Event lấy viên, lưu NVS đến khi bridge ACK sau ghi Firebase. |
| `.../state` | ESP32 | Cấu hình đang chạy và tồn kho/revision. |
| `.../ack` | ESP32 | Kết quả áp dụng cấu hình hoặc lệnh tồn kho. |
| `.../presence` | ESP32/LWT | Online/offline MQTT, không thay thế kiểm tra heartbeat. |
| `.../config` | Bridge | Cấu hình mong muốn, retained; thiết bị áp dụng khi IDLE. |
| `.../cmd` | Bridge | Lệnh set_stock có commandId và expectedRevision. |
| `.../eventAck` | Bridge | Xác nhận event đã ghi Firebase. |

Tài khoản thiết bị chỉ xuất bản trạng thái của chính nó và chỉ đọc config/cmd/eventAck. Không đọc topic wildcard hoặc gửi lệnh cho thiết bị khác. Bridge có mật khẩu riêng. MQTT telemetry dùng publish QoS 0 của PubSubClient; event có retry ở tầng ứng dụng với eventId và ACK bền vững, ghi Firebase theo eventId để tránh thêm log trùng.

## Bước 4 Chạy dashboard kéo thả Node RED

Mở hai terminal khác nhau:

```powershell
npm run dashboard:viewer
```

```powershell
npm run dashboard:caregiver
```

Tên đăng nhập HTTP lần lượt là `viewer` và `caregiver`. Mật khẩu riêng nằm ở các dòng `NODERED_VIEWER_PASSWORD`, `NODERED_CAREGIVER_PASSWORD` trong `services/.env`. Editor `/editor` dùng tên `admin` và `NODERED_ADMIN_PASSWORD`.

Cả HTTP dashboard lẫn Socket.IO đều kiểm tra đăng nhập. Viewer không có slider/switch và tiến trình viewer xóa API token ghi khỏi môi trường. Backend cũng từ chối POST từ token viewer. Không chia sẻ mật khẩu editor cho người chỉ xem.

Sau khi các cấu hình đã đủ, dùng `npm run start:all` để chạy backend và cả hai Node-RED trong một lệnh; Ctrl+C để dừng.

Flow có hai Gauge nhiệt/ẩm, biểu đồ nhiệt độ, trạng thái kết nối và bảng alarm. Bản caregiver có slider liều và switch trạng thái nạp của ngăn A. Cấu hình B/C và tên/mã/giờ dùng web chính; có thể mở rộng flow bằng editor đã bảo vệ. Hai flow JSON để import/chỉnh sửa nằm trong `services/nodered/flows.viewer.json` và `flows.caregiver.json`; không chứa mật khẩu. Lịch sử chart no-code hiện tích lũy khi runtime đang chạy; lịch sử bền vững 24 giờ xem trên web chính.

## Bước 5 Tạo và nối bot Telegram

1. Mở [BotFather chính thức](https://t.me/BotFather), gửi `/newbot`, đặt tên và username theo hướng dẫn.
2. Chép token vào dòng `TELEGRAM_BOT_TOKEN=` trong `services/.env`. Không dán token vào mã nguồn hoặc chat hỗ trợ.
3. Mở bot vừa tạo, bấm Start hoặc gửi `/start`. Nếu nhận trong nhóm, thêm bot vào đúng nhóm và gửi một tin nhắn cho bot trong nhóm đó.
4. Chạy:

   ```powershell
   npm run telegram:configure
   ```

   Lệnh xác minh token bằng getMe và tìm chat trong getUpdates. Nếu chỉ có một chat, lệnh lưu chat ID và bật Telegram trong `.env`. Khi có nhiều chat, lệnh dừng để bạn chọn bằng `TELEGRAM_CHAT_ID`; không tự gửi vào nhóm bất kỳ. Bước cấu hình không gửi tin nhắn.

5. Khởi động lại `npm start`. Khi có cảnh báo Critical mới, tăng cấp hoặc phục hồi sau Critical, backend gửi Telegram về chat đã cấu hình. Warning chỉ ghi alarm. Để nghiệm thu, gửi telemetry thử lên broker cục bộ theo thông tin topic; không sửa `/deviceStatus` bằng tài khoản viewer/caregiver.

## Vòng đời và tính tin cậy của cảnh báo

- Nhiệt độ từ 30°C đến 35°C: `WARNING`; trên 35°C: `CRITICAL`. Đây là ngưỡng demo của lab, có thể đổi qua `ALARM_*` trong `.env`.
- Từ 28°C đến dưới 30°C: giữ cảnh báo trước đó. Dưới 28°C: `CLEARED`. Tránh xóa/mở liên tục sát ngưỡng.
- Người quản lý có thể chuyển `ACTIVE` thành `ACKNOWLEDGED` để ghi đã xem; thao tác không làm sự cố biến mất.
- Tăng từ Warning lên Critical mở lại trạng thái cần chú ý và tạo một job thông báo. Bản tin vượt ngưỡng lặp lại không tạo job trùng.
- Không có telemetry mới trên 15 giây: tạo `DEVICE_OFFLINE` Critical. Có heartbeat mới: tự phục hồi. Mẫu cảm biến lỗi có alarm Warning riêng và không được dùng để xóa cảnh báo nhiệt.
- Alarm, event và outbox được lưu qua file ghi tạm rồi đổi tên ở `services/data/state.json`, đồng thời phản chiếu lên Firebase. Không xóa thư mục data khi nâng cấp.
- Telegram retry tối đa 8 lần, backoff, tôn trọng retry_after; lỗi quyền/token là FAILED, thông báo quá một giờ là EXPIRED. Khi chưa bật Telegram, không giả báo SENT. Nếu tiến trình chết sau khi Telegram đã nhận nhưng trước khi lưu SENT, lần khởi động sau có thể gửi trùng; đây là giao nhận ít nhất một lần, không cam kết đúng một lần tuyệt đối.
- Dịch vụ nền cần chạy liên tục trên máy này. Nếu cả máy hoặc dịch vụ dừng, nó không thể tự gửi cảnh báo; muốn giám sát trường hợp đó cần chuyển backend sang máy chủ luôn hoạt động hoặc thêm một bộ giám sát độc lập.

## Kiểm thử

```powershell
npm test
npm run test:rules
npm run test:system
npm run test:nodered
& .\tests\host\run_tests.ps1
```

Firebase Emulator cần Java; trên máy này có thể dùng `C:\Program Files\Java\jdk-23` qua `JAVA_HOME` và PATH. Những cảnh báo permission_denied trong kiểm thử rules là kết quả mong đợi của các yêu cầu trái quyền. Kiểm thử Telegram dùng HTTP giả lập; không thay thế kiểm tra tin nhắn thật sau khi tạo bot.

Kết quả kiểm tra cục bộ:

| Nhóm | Kết quả |
|---|---|
| Logic firmware trên host | 55 kiểm tra qua. |
| Tích hợp firmware và helper MQTT với mock | 164 kiểm tra qua, gồm áp dụng cấu hình khi rảnh, revision tồn kho và lệnh lặp sau restart. |
| Dashboard và phân quyền giao diện | 34 kiểm tra qua. |
| Dịch vụ, MQTT thật localhost, logic alarm và Telegram mô phỏng | Các ca kiểm thử đều qua. |
| Firebase Database Emulator | Các ca đọc/ghi theo vai trò, schema và chống giả ACK đều qua. |
| MQTT → Firebase Emulator → vòng đời alarm và phản hồi event | Qua kiểm thử xuyên suốt. |
| Node-RED thật và MQTT TLS | HTTP/WebSocket trái quyền bị chặn; chứng chỉ ghim được chấp nhận, CA không tin cậy bị từ chối. |
| Build ESP32 MQTT TLS | Thành công; RAM tĩnh 51.640 byte (15,8%), flash 981.501 byte (74,9%). |
| Firebase thật | Đăng nhập hai vai trò, đọc/ghi theo rules đã triển khai và tự refresh phiên CLI đều thành công. |
| Broker MQTT TLS và hai Node-RED của phiên chạy thật | Kết nối TLS/subscription cấu hình A/B/C thành công; hai dashboard chặn khách chưa đăng nhập. |
| Telegram thật | Xác minh bot/chat, gửi tin kiểm tra thành công; dịch vụ đã bật Telegram và có cảnh báo tự động ghi nhận SENT. |
| Mô phỏng/phần cứng ESP32 đang chạy | Chưa nghiệm thu phiên lấy thuốc hoàn chỉnh trên thiết bị. |

Các công cụ kiểm tra lại (không in token/mật khẩu):

```powershell
node --env-file=services/.env services/verify-local-services.cjs
node --env-file=services/.env services/verify-live-mqtt.cjs
node --env-file=services/.env services/verify-live-firebase.cjs --rules
```

Tệp `include/credentials.h` cũ từng chứa thông tin REST bí mật và đã được Git theo dõi trước đây. Phiên MQTT mới không dùng bí mật đó để ghi Firebase. Sau khi xác nhận toàn bộ thiết bị đã chuyển sang MQTT, cần xử lý token legacy và lịch sử Git theo kế hoạch bảo mật; luật client không vô hiệu hóa thông tin quản trị đã được cấp từ trước.

Nguồn kỹ thuật: [Firebase RTDB Security](https://firebase.google.com/docs/database/security), [Firebase Rules Tests](https://firebase.google.com/docs/rules/unit-tests), [Node-RED Security](https://nodered.org/docs/user-guide/runtime/securing-node-red), [FlowFuse Dashboard](https://dashboard.flowfuse.com/), [PubSubClient](https://pubsubclient.knolleary.net/api), [Telegram Bot API](https://core.telegram.org/bots/api).
