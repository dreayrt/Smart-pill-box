# Kế hoạch đồng bộ cấu hình và tồn kho giữa Dashboard với ESP32

**Trạng thái:** Đã triển khai mã nguồn và build `pio run` thành công ngày 18/10/2026; còn chờ kiểm tra với Firebase/ESP32 thực tế.

## 1. Kết quả kiểm tra trước khi triển khai

Dashboard đang lưu cấu hình A/B/C vào Firebase tại `/config/compartments`. Firmware đọc đường dẫn này và áp dụng các trường sau khi dữ liệu hợp lệ, khi thiết bị ở `STATE_IDLE`:

| Trường trong Dashboard | Trạng thái hiện tại trên ESP32 |
|---|---|
| Tên thuốc (`displayName`) | Đã có đồng bộ xuống firmware |
| Mã thuốc (`medicineCode`) | Đã có đồng bộ xuống firmware |
| Giờ uống (`schedule`) | Đã có đồng bộ xuống firmware |
| Liều mỗi lần (`unitsPerDose`) | Đã có đồng bộ xuống firmware |
| Trạng thái đã nạp (`isLoaded`) | Đã có đồng bộ xuống firmware; ngăn chưa nạp không được dùng cho lịch uống |
| Tồn kho (`currentStock`) | **Chưa đồng bộ trước khi triển khai kế hoạch này** |

Luồng cấu hình đã được kiểm tra lại khi ESP32 kết nối lại và định kỳ mỗi 15 giây khi FSM ở trạng thái rảnh. Trước triển khai này, firmware giữ nguyên `currentStock` trong RAM thay vì lấy số tồn kho trên Firebase. Đây là chủ ý của phần đồng bộ liều thuốc trước đó, nhằm tránh dữ liệu tồn kho cũ trên Firebase ghi đè số liệu cục bộ.

Trước triển khai này, firmware giảm tồn kho cục bộ sau phiên lấy thuốc được xác minh và tự tăng 10 viên khi thao tác `LOAD`, nhưng chưa ghi các thay đổi đó lên Firebase. Sửa tồn kho trên web chỉ thay đổi dữ liệu Firebase mà chưa cập nhật ESP32; số tồn kho thay đổi trên thiết bị cũng chưa được phản ánh lên Firebase.

Nút lưu trên Dashboard hiện báo lưu thành công sau khi Firebase nhận dữ liệu. Thông báo đó chưa xác nhận ESP32 đã nhận hoặc áp dụng cấu hình.

## 2. Mục tiêu đề xuất

1. Đồng bộ hai chiều tồn kho: Dashboard yêu cầu đặt lại số viên; ESP32 áp dụng và báo số tồn kho thực tế trở lại Firebase.
2. Ghi lên Firebase các thay đổi do ESP32 tạo ra: lấy thuốc thành công và thao tác nạp thuốc `LOAD`.
3. Không để bản cập nhật tồn kho cũ ghi đè thay đổi mới từ thiết bị hoặc Dashboard.
4. Báo rõ cho Dashboard biết yêu cầu sửa tồn kho đang chờ, đã áp dụng hay thất bại.
5. Giữ nguyên cách đồng bộ hiện tại cho tên thuốc, mã thuốc, lịch, liều và trạng thái nạp.

## 3. Thiết kế đã triển khai

### Tách cấu hình tĩnh khỏi tồn kho biến động

- Giữ `/config/compartments/{A,B,C}` cho tên thuốc, mã thuốc, giờ uống, liều và `isLoaded`.
- Tạo `/inventory/compartments/{A,B,C}` cho số tồn kho do thiết bị xác nhận, cùng thời điểm cập nhật, số phiên bản và command ID gần nhất.
- Dashboard tiếp tục trình bày các trường trong cùng một hộp cấu hình, nhưng lưu cấu hình tĩnh riêng. Không dùng thao tác ghi đè toàn bộ `/config/compartments` để cập nhật tồn kho.

Tách đường dẫn để cập nhật thông tin thuốc không vô tình ghi lại số tồn kho cũ mà trang web đã tải trước đó.

### Dashboard gửi yêu cầu thay đổi; ESP32 áp dụng và xác nhận

Khi người dùng sửa số tồn kho trên web, Dashboard tạo yêu cầu tại `/inventoryCommands/pending/{commandId}` với mã ngăn, số lượng đích và thời gian. Trạng thái mới nhất của mỗi ngăn nằm tại `/inventoryCommands/status/{A,B,C}`. ESP32 lấy lệnh cũ nhất khi rảnh, lưu mã lệnh đã áp dụng để không áp dụng lặp, ghi tồn kho lên `/inventory/compartments`, cập nhật trạng thái `applied`, rồi xóa lệnh khỏi hàng chờ. Nếu giá trị không hợp lệ, ESP32 đánh dấu `rejected` và nêu nguyên nhân.

ESP32 vẫn là nơi xác nhận số tồn kho cuối cùng:

- Sau khi phiên uống đi tới `STATE_VERIFIED` và hoàn tất đóng ngăn, ESP32 ghi số tồn kho sau khi trừ liều đã xác minh.
- Sau thao tác `LOAD`, ESP32 ghi số tồn kho sau khi cộng 10 viên.
- Các lần ghi tồn kho có số phiên bản tăng dần để Dashboard và thiết bị nhận biết dữ liệu mới hơn.
- Thiết bị chỉ xử lý lệnh đặt tồn kho khi không có phiên uống đang chạy. Nếu đang trong phiên, yêu cầu chờ đến khi thiết bị rảnh.

Dashboard hiển thị số tồn kho đã được thiết bị xác nhận và trạng thái riêng cho lần sửa gần nhất. Trạng thái “đã lưu yêu cầu” không được trình bày như thể thiết bị đã áp dụng.

### Khi mất mạng hoặc khởi động lại

- Lệnh tồn kho chưa xử lý phải được giữ lại trên Firebase để ESP32 nhận sau khi kết nối lại.
- ESP32 cần lưu số tồn kho đã xác nhận và mã lệnh gần nhất vào NVS để giữ trạng thái qua lần khởi động lại khi offline.
- Khi online, thiết bị gửi các thay đổi tồn kho chưa xác nhận và xử lý lệnh đang chờ theo thứ tự, mỗi lệnh chỉ áp dụng một lần.
- Nếu Dashboard đặt lại số tồn kho trong lúc thiết bị offline, giao diện thể hiện rõ trạng thái đang chờ thiết bị thay vì cập nhật nhầm thành số tồn kho đã xác nhận.

## 4. Các bước đã triển khai

1. **Quy tắc nghiệp vụ:** số nhập trên web là số lượng đích tuyệt đối, giới hạn 0–100 viên.
2. **Cấu trúc Firebase:** tách cấu hình tĩnh, tồn kho đã xác nhận và hàng đợi lệnh.
3. **Dashboard:** lưu cấu hình theo từng trường; chỉ tạo lệnh tồn kho khi số trong form khác số ban đầu; hiển thị chờ/đã áp dụng/từ chối.
4. **Firmware:** xử lý lệnh khi rảnh; ghi tồn kho sau khi lấy thuốc đã xác minh và sau `LOAD`; chống áp dụng lặp bằng `commandId`; lưu tồn kho và cờ chờ đồng bộ trong NVS.
5. **Tài liệu:** cập nhật README và kế hoạch này với cấu trúc dữ liệu và các bước nghiệm thu.

## 5. Tiêu chí nghiệm thu

| Tình huống | Kết quả mong đợi |
|---|---|
| Trên Dashboard đặt tồn kho ngăn A thành 15 khi ESP32 online và rảnh | ESP32 nhận đúng một lệnh, áp dụng 15, Firebase có số tồn kho 15 và lệnh được xác nhận `applied` |
| Thay tên thuốc hoặc giờ uống trên web | Cấu hình mới xuống ESP32; tồn kho không bị đổi theo giá trị cũ trong form |
| ESP32 xác minh đã lấy một liều 3 viên | Tồn kho giảm 3 và số mới được ghi lên Firebase |
| Nhấn `LOAD` một lần | Tồn kho thiết bị tăng 10 và Firebase nhận số mới |
| Gửi lại cùng một `commandId` | ESP32 không áp dụng yêu cầu lần thứ hai |
| Dashboard sửa tồn kho khi thiết bị đang có phiên uống | Lệnh chờ; không làm thay đổi cấu hình giữa phiên; được xử lý khi thiết bị rảnh |
| Dashboard sửa tồn kho khi thiết bị offline | Dashboard báo đang chờ; thiết bị nhận và xác nhận sau khi kết nối lại |
| ESP32 khởi động lại khi offline | Dùng số tồn kho đã lưu gần nhất, không quay về mặc định ngoài ý muốn |
| ESP32 hoặc Firebase trả lỗi khi ghi tồn kho | Không hiển thị đã đồng bộ; giữ thay đổi chờ gửi lại và báo trạng thái phù hợp |
| Giao diện hiển thị cấu hình và tồn kho | Người dùng phân biệt được dữ liệu đã lưu trên Firebase với dữ liệu đã được ESP32 xác nhận |

## 6. Phạm vi tệp dự kiến

- `dashboard/app.js`: tách lưu cấu hình khỏi yêu cầu đặt tồn kho; hiển thị trạng thái áp dụng.
- `src/cloud_sync.cpp`: đọc lệnh tồn kho, ghi số liệu tồn kho và xác nhận trạng thái.
- `src/main.cpp`: phát sinh cập nhật tồn kho khi `LOAD`.
- `src/state_machine.cpp`: phát sinh cập nhật sau phiên lấy thuốc được xác minh.
- `include/sync_interface.h`: khai báo API báo tồn kho mới cho cloud sync.
- `README.md`: cập nhật cấu trúc Firebase và hướng dẫn nghiệm thu.

## 7. Kết quả triển khai và quy tắc đã chọn

- Trường tồn kho trên web được hiểu là **số lượng đích tuyệt đối** trong khoảng 0–100 viên. Dashboard chỉ gửi lệnh khi số nhập khác số đang hiển thị lúc mở modal.
- ESP32 xử lý lệnh khi `STATE_IDLE`, lưu số lượng và `commandId` vào NVS trước khi gửi xác nhận. Lệnh được lấy theo thứ tự Firebase; mã lệnh đã áp dụng được dùng để tránh áp dụng lặp khi ACK hoặc xóa lệnh bị lỗi.
- Sau khi phiên đã vào `STATE_VERIFIED` và tới thời điểm tự đóng ngăn, ESP32 trừ liều và đánh dấu tồn kho cần đồng bộ. `LOAD` cộng tối đa 10 viên, không vượt 100.
- NVS giữ tồn kho, revision, cờ chờ đồng bộ và command ID cuối cùng. Nếu chưa có NVS, thiết bị nạp số tồn kho từ `/inventory/compartments`; nếu đường dẫn mới chưa có dữ liệu thì chuyển số cũ ở `/config/compartments` sang cấu trúc mới, sau đó mới dùng mặc định firmware.
- Dashboard đọc tồn kho từ `/inventory/compartments`, lệnh chờ từ `/inventoryCommands/pending` và ACK gần nhất từ `/inventoryCommands/status`. Cấu hình tĩnh được cập nhật bằng các đường dẫn con, không ghi đè cả object chứa dữ liệu cũ.
- Tệp đã cập nhật: `src/cloud_sync.cpp`, `src/state_machine.cpp`, `src/main.cpp`, `include/sync_interface.h`, `dashboard/app.js`, `dashboard/style.css` và `README.md`.

**Còn cần kiểm tra:** cho phép quyền Firebase trên `/inventory` và `/inventoryCommands`, sau đó chạy các tình huống nghiệm thu ở mục 5 trên ESP32/Firebase. Build PlatformIO đã thành công ngày 18/10/2026; các kiểm tra chạy thực tế chưa được thực hiện.
