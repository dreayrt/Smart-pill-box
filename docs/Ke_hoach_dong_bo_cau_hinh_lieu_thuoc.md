# Kế hoạch khắc phục đồng bộ liều thuốc từ Dashboard xuống ESP32

**Trạng thái:** Đã triển khai phần firmware và build `pio run` thành công ngày 18/10/2026; còn chờ kiểm tra chạy thực tế.
**Vấn đề cần giải quyết:** Dashboard đặt ngăn A là 3 viên/lần nhưng firmware vẫn dùng 2 viên/lần.

**Cập nhật cấu hình kết nối:** `include/credentials.h` hiện đã có host và giá trị xác thực, host khớp URL database trong `dashboard/app.js`. Đây là kiểm tra cấu hình tĩnh; chưa phải xác nhận thiết bị đã đọc/ghi Firebase thành công khi chạy.

## 1. Nguyên nhân và trạng thái hiện tại

Nguyên nhân nằm ở luồng đồng bộ chưa được nối hoàn chỉnh, không phải do hệ thống bắt buộc mỗi ngăn chỉ có một liều cố định:

- Dashboard ghi `unitsPerDose` vào `/config/compartments/{A,B,C}`.
- Firmware khởi tạo cấu hình mặc định trong `schedule_init()`: A = 2, B = 1, C = 1.
- Nguyên nhân trước khi sửa: `cloud_fetchCompartmentConfig()` có thể đọc `unitsPerDose` nhưng không được gọi để cập nhật lịch đang dùng; `schedule_updateCompartment()` cũng chưa được gọi.
- FSM và phần xác minh lấy liều từ `activeComp->unitsPerDose`, nên tiếp tục dùng giá trị mặc định.
- Dashboard cho nhập liều 1–10 viên/lần; cấu trúc firmware lưu liều dưới dạng số nguyên `uint8_t`, nên có thể nhận các giá trị này.
- Cấu hình host và xác thực trong `include/credentials.h` hiện đã được điền; host khớp database URL Dashboard. Cần kiểm chứng kết nối và quyền đọc `/config/compartments` lúc chạy trước khi xác nhận đồng bộ trực tiếp.

Luồng tải và áp dụng cấu hình đã được nối trong `src/cloud_sync.cpp`. Hiệu lực thực tế còn phụ thuộc firmware đọc được dữ liệu Firebase; cần kiểm tra bằng Serial Monitor và mô phỏng.

## 2. Mục tiêu và phạm vi đề xuất

### Mục tiêu

1. Firebase tại `/config/compartments` là nguồn cấu hình lịch và liều cho thiết bị.
2. Khi Dashboard lưu A = 3, firmware áp dụng 3 viên/lần và dùng giá trị đó xuyên suốt lời nhắc, xác minh liều và bản ghi sự kiện.
3. Mất mạng hoặc cấu hình lỗi không làm thiết bị xóa cấu hình hợp lệ đang dùng.
4. Có thể xác nhận từ Serial Monitor cấu hình nào đã được thiết bị áp dụng.

### Phạm vi đợt sửa này

Đồng bộ các trường cấu hình ảnh hưởng đến lịch và liều: `compartmentId`, `displayName`, `medicineCode`, `schedule`, `unitsPerDose`, `isLoaded`.

**Tồn kho `currentStock` được xử lý riêng.** Đợt đồng bộ lịch/liều này giữ tồn kho cục bộ để tránh dữ liệu cũ trên Firebase ghi đè RAM. Phần tồn kho hai chiều sau đó đã được triển khai theo [kế hoạch tồn kho](Ke_hoach_dong_bo_ton_kho_va_cau_hinh_thiet_bi.md).

## 3. Hành vi đã triển khai

1. Firmware vẫn khởi tạo cấu hình mặc định an toàn để thiết bị có trạng thái ban đầu.
2. Sau khi kết nối Wi-Fi/Firebase, firmware tải `/config/compartments`, ghép từng cấu hình theo `compartmentId` (A/B/C), rồi áp dụng các trường trong phạm vi.
3. Khi online, firmware kiểm tra cấu hình mới mỗi 15 giây khi FSM ở `STATE_IDLE`; sau khi Wi-Fi kết nối lại, firmware yêu cầu đồng bộ ngay khi thiết bị rảnh. Nếu mất mạng trong cùng phiên chạy, thiết bị giữ cấu hình RAM hiện tại. Nếu khởi động khi offline, thiết bị dùng giá trị mặc định cho tới khi kết nối lại.
4. Cấu hình chỉ được áp dụng khi FSM ở `STATE_IDLE`. Khi đang báo thuốc, mở ngăn hoặc xác minh, cấu hình hiện hành không bị thay giữa phiên; cấu hình mới có hiệu lực khi phiên kết thúc.
5. Khi cấu hình lần đầu được nạp hoặc có thay đổi, Serial Monitor in mã ngăn, giờ, liều `unitsPerDose` và trạng thái nạp.
6. Toàn bộ payload A/B/C được xác thực trước khi áp dụng. ID, giờ, trường bắt buộc hoặc liều sai (ngoài 1–10) làm firmware giữ cấu hình hiện hành và in lý do.

## 4. Các bước triển khai

### Bước 1 — Xác nhận điều kiện kết nối *(còn kiểm tra chạy thực tế)*

- Host và giá trị xác thực đã được cấu hình trong `include/credentials.h`; không sao chép bí mật vào tài liệu hoặc log.
- Khi chạy firmware, xác nhận Serial Monitor báo Wi-Fi kết nối thành công và yêu cầu đọc `/config/compartments` được Firebase chấp nhận.
- Nếu đọc bị từ chối, kiểm tra token và Firebase Rules; không mở quyền đọc/ghi công khai cho dữ liệu thật.
- Chỉ chuyển sang kiểm tra logic liều sau khi đã xác nhận firmware đọc được cấu hình A/B/C từ đúng database.

### Bước 2 — Hoàn thiện bộ đọc cấu hình *(đã triển khai)*

- Giữ JSON hiện tại của Dashboard làm hợp đồng dữ liệu.
- Kiểm tra các ID A/B/C, giờ `HH:MM`, `unitsPerDose` trong khoảng 1–10 và các trường bắt buộc.
- Đảm bảo chuỗi được kết thúc đúng ký tự null và ghép theo ID, không dựa vào thứ tự Firebase trả về.
- Nếu thiếu hoặc sai một mục, không ghi cấu hình dở dang lên danh sách đang chạy.

### Bước 3 — Nối dữ liệu Firebase vào lịch firmware *(đã triển khai)*

- Sau `schedule_init()` và khi Cloud sẵn sàng, tải cấu hình vào vùng tạm.
- Nếu tải và kiểm tra thành công, cập nhật từng ngăn hiện có bằng `schedule_updateCompartment()`.
- Thêm kiểm tra định kỳ có giới hạn thời gian trong `cloud_loop()` và chỉ áp dụng bản mới khi FSM rảnh.
- Không chặn luồng FSM bằng việc tải lặp liên tục; cấu hình chỉ được kiểm tra theo chu kỳ hoặc sau khi Wi-Fi kết nối lại.

### Bước 4 — Giữ liều ổn định trong một phiên *(đã triển khai)*

- Chỉ áp dụng dữ liệu mới khi FSM đang ở `STATE_IDLE`, nên dữ liệu của ngăn đang được dùng không bị thay giữa phiên.
- Nếu Dashboard thay đổi liều giữa phiên, firmware sẽ nhận cấu hình ở lần tải kế tiếp sau khi FSM rảnh.

### Bước 5 — Hướng dẫn và trạng thái đồng bộ *(đã cập nhật một phần)*

- Serial Monitor hiển thị rõ liều firmware vừa áp dụng.
- Dashboard chỉ báo đã lưu Firebase; không coi đó là xác nhận thiết bị đã nhận cấu hình.
- README mô tả đồng bộ lịch/liều và luồng tồn kho hai chiều được bổ sung sau đó.
- Trạng thái “Thiết bị đã đồng bộ cấu hình lúc…” trên Dashboard chưa được bổ sung.

## 5. Tiêu chí nghiệm thu đề xuất

| Tình huống | Kết quả mong đợi |
|---|---|
| Firebase có A = 3; khởi động thiết bị online | Serial báo A = 3; lời nhắc hiển thị 3; firmware không quay về 2 |
| Đang nhắc A = 3; nhấn TAKE rồi REMOVE 3 lần | Phiên được xác minh đủ liều 3/3 |
| A yêu cầu 3; lấy 2 rồi hết thời gian hoặc lấy dư | Kết quả sai liều phản ánh liều 3, không dùng mặc định 2 |
| Đổi A từ 2 lên 3 khi thiết bị đang idle và online | Thiết bị nhận cấu hình trong tối đa một chu kỳ tải đề xuất 15 giây |
| Đổi liều trong lúc một phiên đang diễn ra | Phiên hiện tại giữ nguyên liều cũ; phiên kế tiếp dùng liều mới |
| Firebase lỗi quyền, mất mạng hoặc JSON sai | Thiết bị giữ cấu hình hợp lệ đang dùng, báo lỗi; không áp dụng dữ liệu một phần |
| Cấu hình B/C không đổi | B/C vẫn giữ đúng giá trị riêng, không bị gán nhầm do thứ tự JSON |

## 6. Tệp đã sửa và giới hạn còn lại

- `src/cloud_sync.cpp`: tải cấu hình lúc kết nối và theo chu kỳ, xác thực JSON, ghép theo ID; tồn kho được đồng bộ riêng qua đường dẫn `/inventory` và hàng đợi lệnh.
- `README.md`: mô tả thời gian nhận cấu hình và luồng tồn kho hiện tại.
- `docs/Ke_hoach_dong_bo_cau_hinh_lieu_thuoc.md`: kế hoạch và kết quả triển khai.
- `schedule_init()` vẫn giữ các giá trị mặc định làm fallback cho cấu hình lịch. Tồn kho đã được lưu vào NVS; khởi động offline dùng tồn kho gần nhất nếu đã có.
- Dashboard xác nhận riêng yêu cầu tồn kho; trạng thái firmware đã áp dụng thay đổi lịch/liều vẫn chưa hiển thị thành một ACK riêng.
- Đọc cấu hình dùng HTTP đồng bộ, chỉ chạy khi FSM rảnh; một lần đọc có thể làm loop chờ đến timeout mạng hiện tại.

## 7. Kiểm tra nghiệm thu còn chờ thực hiện

1. Đã chạy build sau thay đổi; PlatformIO báo `[SUCCESS]` cho `esp32dev` ngày 18/10/2026.
2. Trên Dashboard đặt ngăn A thành 3 viên/lần; xác nhận Serial báo cấu hình A = 3 sau khi firmware khởi động hoặc ở lần đọc định kỳ.
3. Đến cữ A, xác nhận lời nhắc hiển thị 3 viên; nhấn `TAKE` và `REMOVE` ba lần để kiểm tra kết quả 3/3.
4. Xác nhận đổi liều giữa phiên không làm thay đổi phiên hiện hành, nhưng có hiệu lực ở cữ kế tiếp.
5. Xác nhận khi mất quyền truy cập hoặc mất Wi-Fi, firmware giữ cấu hình hiện hành và báo lỗi thay vì áp dụng JSON một phần.

**Build đã thành công; các kiểm tra chạy thực tế trên đây chưa được thực hiện.**
