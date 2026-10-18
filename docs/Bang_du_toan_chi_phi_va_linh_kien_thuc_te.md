# 💰 BẢNG DỰ TOÁN CHI PHÍ & ĐÁNH GIÁ LINH KIỆN THỰC TẾ
# DỰ ÁN HỘP THUỐC THÔNG MINH IOT (NHÓM 13)

> **Mục đích tài liệu**: Đánh giá chi tiết từng linh kiện phần cứng khi triển khai mạch thật từ mô hình mô phỏng Wokwi, so sánh mức giá thị trường Việt Nam, phân tích ưu/nhược điểm và đề xuất các phương án cấu hình tối ưu chi phí cho đồ án.

---

## MỤC LỤC
1. [Tổng quan thị trường linh kiện & Tiêu chí lựa chọn](#1-tổng-quan-thị-trường-linh-kiện--tiêu-chí-lựa-chọn)
2. [Phân tích chi tiết từng linh kiện & Các lựa chọn thay thế](#2-phân-tích-chi-tiết-từng-linh-kiện--các-lựa-chọn-thay-thế)
   - [2.1. Vi điều khiển trung tâm (MCU)](#21-vi-điều-khiển-trung-tâm-mcu)
   - [2.2. Khối thời gian thực (RTC)](#22-khối-thời-gian-thực-rtc)
   - [2.3. Khối màn hình hiển thị (Display)](#23-khối-màn-hình-hiển-thị-display)
   - [2.4. Khối cảm biến môi trường (Nhiệt/Ẩm)](#24-khối-cảm-biến-môi-trường-nhiệtẩm)
   - [2.5. Khối chấp hành cơ khí (Khóa / Mở ngăn)](#25-khối-chấp-hành-cơ-khí-khóamở-ngăn)
   - [2.6. Khối xác minh liều lượng thuốc thực tế](#26-khối-xác-minh-liều-lượng-thuốc-thực-tế)
   - [2.7. Khối giao tiếp người dùng & Cảnh báo](#27-khối-giao-tiếp-người-dùng--cảnh-báo)
   - [2.8. Khối nguồn nuôi (Power Supply)](#28-khối-nguồn-nuôi-power-supply)
3. [Bảng so sánh 3 gói giải pháp chi phí (BOM Scenarios)](#3-bảng-so-sánh-3-gói-giải-pháp-chi-phí-bom-scenarios)
   - [Gói 1: Bản Tiêu chuẩn (Standard - Bám sát Wokwi nhất)](#gói-1-bản-tiêu-chuẩn-standard---bám-sát-wokwi-nhất)
   - [Gói 2: Bản Tối ưu chi phí tối đa (Ultra-Budget)](#gói-2-bản-tối-ưu-chi-phí-tối-đa-ultra-budget)
   - [Gói 3: Bản Nâng cao / Prototype hoàn thiện (Pro Product)](#gói-3-bản-nâng-cao--prototype-hoàn-thiện-pro-product)
4. [Kinh nghiệm mua hàng & Tránh lỗi phần cứng thực tế](#4-kinh-nghiệm-mua-hàng--tránh-lỗi-phần-cứng-thực-tế)
5. [Địa chỉ tham khảo nguồn hàng tại Việt Nam](#5-địa-chỉ-tham-khảo-nguồn-hàng-tại-việt-nam)

---

## 1. TỔNG QUAN THỊ TRƯỜNG LINH KIỆN & TIÊU CHÍ LỰA CHỌN

Khi chuyển từ mô phỏng **Wokwi** sang chế tạo **Phần cứng thực tế (Hardware Prototype)**, các rào cản chi phí và kỹ thuật thường gặp gồm:
1. **Tính tương thích phần mềm**: Thay linh kiện rẻ hơn nhưng không được làm phát sinh công viết lại toàn bộ mã nguồn.
2. **Độ ổn định nguồn điện**: ESP32 khi kích hoạt Wi-Fi có thể sụt áp đỉnh (peak current lên tới 500mA), các động cơ Servo khi quay cũng gây sụt áp làm reset chip.
3. **Mức độ phổ biến tại Việt Nam**: Ưu tiên linh kiện dễ mua trên các sàn TMĐT (Shopee, Lazada) hoặc cửa hàng linh kiện trong nước (Hshop, TheGioiIC, BanLinhKien) để giao hàng nhanh.

---

## 2. PHÂN TÍCH CHI TIẾT TỪNG LINH KIỆN & CÁC LỰA CHỌN THAY THẾ

### 2.1. Vi điều khiển trung tâm (MCU)

| Sản phẩm | Mức giá tham khảo | Ưu điểm | Nhược điểm | Đánh giá áp dụng cho đồ án |
|---|---|---|---|---|
| **ESP32 DevKit V1 (30 hoặc 38 chân)** *(Lựa chọn tiêu chuẩn)* | **75.000 – 95.000 đ** | • Giống 100% bản mô phỏng Wokwi.<br>• Tích hợp cổng MicroUSB/Type-C và mạch nạp CH340/CP2102.<br>• Nhiều chân GPIO, cắm thẳng Breadboard tiện lợi. | • Kích thước to, khó đóng hộp nhỏ.<br>• Mạch nạp trên board tiêu tốn thêm một phần dòng điện. | ⭐⭐⭐⭐⭐ **Khuyên dùng số 1** cho đồ án sinh viên để lắp ráp và nạp code nhanh nhất. |
| **ESP32-C3 SuperMini** *(Lựa chọn nhỏ gọn, rẻ)* | **38.000 – 48.000 đ** | • Giá siêu rẻ (chỉ bằng một nửa DevKit).<br>• Kích thước siêu nhỏ (bằng ngón tay cái).<br>• Lõi RISC-V mới, Wi-Fi + BLE 5.0, có sẵn cổng Type-C. | • Ít chân GPIO hơn (khoảng 13 chân khả dụng).<br>• Phải tính toán gom chân cẩn thận (chia sẻ bus I2C). | ⭐⭐⭐⭐ Rất phù hợp nếu muốn tối ưu chi phí mà vẫn giữ được chuẩn code C++. |
| **ESP8266 NodeMCU V3** | **45.000 – 55.000 đ** | • Giá rẻ, cộng đồng lâu đời. | • Quá ít chân GPIO (chỉ có ~8 chân dùng được).<br>• Không đủ chân cắm LCD, Servo, 7 nút, RTC và cảm biến cùng lúc. | ❌ **Không nên dùng** vì thiếu chân trầm trọng cho hệ thống nhiều nút. |
| **Module trần ESP32-WROOM-32E** | **42.000 – 50.000 đ** | • Rất rẻ, gọn gàng chuẩn công nghiệp. | • Dạng chip dán (SMD), bắt buộc phải thiết kế mạch in PCB và cần mạch nạp ngoài (USB-TTL). | ⚠️ Chỉ dùng khi làm đồ án tốt nghiệp vẽ bo mạch in PCB hoàn chỉnh. |

---

### 2.2. Khối thời gian thực (RTC)

| Sản phẩm | Mức giá tham khảo | Ưu điểm | Nhược điểm | Đánh giá áp dụng cho đồ án |
|---|---|---|---|---|
| **Module RTC DS3231 (kèm pin CR2032)** *(Bản Wokwi)* | **32.000 – 45.000 đ** | • Cực kỳ chính xác (tích hợp thạch anh bù nhiệt TCXO, sai lệch chỉ vài giây/tháng).<br>• Dùng I2C, có pin dự phòng lưu giờ khi rút điện. | • Tốn thêm chi phí mua pin CR2032 (~5k). | ⭐⭐⭐⭐⭐ **Rất khuyên dùng** để hệ thống đảm bảo tính "Offline-First" không phụ thuộc mạng. |
| **Module RTC DS1307** | **15.000 – 20.000 đ** | • Rất rẻ. | • Sai số rất lớn (có thể lệch 1-2 phút/tuần do nhiệt độ môi trường).<br>• Yêu cầu mức logic 5V (cần mạch chia áp cho ESP32 3.3V). | ❌ Không nên dùng vì dễ sai giờ uống thuốc. |
| **Đồng bộ giờ qua Internet (NTP Server) + RTC nội ESP32** | **0 đ** *(Miễn phí)* | • Tiết kiệm 100% tiền mua module RTC.<br>• Giờ luôn khớp chuẩn nguyên tử quốc tế. | • Bắt buộc phải có Wi-Fi lúc khởi động để lấy giờ.<br>• Khi mất điện và mất Wi-Fi cùng lúc, giờ sẽ bị reset về 1970. | ⭐⭐⭐⭐ Lựa chọn tối ưu chi phí số 1 nếu giả định gia đình luôn có Wi-Fi 24/7. |

---

### 2.3. Khối màn hình hiển thị (Display)

| Sản phẩm | Mức giá tham khảo | Ưu điểm | Nhược điểm | Đánh giá áp dụng cho đồ án |
|---|---|---|---|---|
| **LCD 16x2 + Module I2C PCF8574** *(Bản Wokwi)* | **45.000 – 60.000 đ** | • Đúng 100% code Wokwi.<br>• Chữ to, dễ đọc từ xa đối với người già.<br>• Giao tiếp 2 dây I2C. | • Kích thước cồng kềnh, viền dày.<br>• Chỉ hiển thị được ký tự ASCII, không hiện được tiếng Việt có dấu hoặc hình ảnh/icon. | ⭐⭐⭐⭐ Phù hợp nhất nếu muốn giữ nguyên code mô phỏng không cần sửa giao diện. |
| **OLED 0.96 inch I2C (SSD1306)** | **32.000 – 42.000 đ** | • Giá rẻ hơn combo LCD.<br>• Siêu nhỏ gọn, hiện đại, độ tương phản cực cao.<br>• Vẽ được icon viên thuốc, mặt cười, đồng hồ đồ họa rất đẹp. | • Kích thước hiển thị hơi nhỏ (0.96"), người mắt kém phải nhìn gần.<br>• Phải sửa code hiển thị (dùng thư viện `Adafruit_SSD1306` hoặc `U8g2`). | ⭐⭐⭐⭐⭐ **Lựa chọn tối ưu thẩm mỹ & chi phí**. |
| **LED 7 đoạn 4 số (TM1637)** | **18.000 – 25.000 đ** | • Giá rẻ nhất, sáng rõ ban đêm. | • Chỉ hiện được giờ (ví dụ `08:00`), không thể hiện tên thuốc hay thông báo chữ. | ⚠️ Không phù hợp cho bài toán hiển thị tên thuốc. |
| **Màn hình màu TFT 1.8" SPI (ST7735)** | **65.000 – 85.000 đ** | • Màn hình màu rực rỡ, giao diện như smartwatch. | • Tốn nhiều chân kết nối (chuẩn SPI mất 5-6 chân).<br>• Đắt hơn và code xử lý nặng hơn. | ⚠️ Thừa thãi so với nhu cầu đồ án. |

---

### 2.4. Khối cảm biến môi trường (Nhiệt/Ẩm)

| Sản phẩm | Mức giá tham khảo | Ưu điểm | Nhược điểm | Đánh giá áp dụng cho đồ án |
|---|---|---|---|---|
| **DHT22 (AM2302)** *(Bản Wokwi)* | **65.000 – 85.000 đ** | • Độ chính xác cao (Nhiệt: ±0.5°C, Ẩm: ±2%).<br>• Dải đo rộng, bám sát mô phỏng. | • Giá đắt.<br>• Kích thước to.<br>• Tốc độ đọc chậm (2 giây/lần). | ⭐⭐⭐ Chỉ nên mua nếu giảng viên yêu cầu bắt buộc đúng mã linh kiện trong đề cương. |
| **DHT11** | **22.000 – 30.000 đ** | • Rất rẻ, phổ biến, cùng thư viện với DHT22. | • Sai số lớn hơn (±2°C, ±5%), dải đo độ ẩm hạn chế (20-90%). | ⭐⭐⭐⭐ Đủ dùng cho mục đích cảnh báo nhiệt ẩm thông thường trong phòng. |
| **AHT20 / AHT10 (I2C)** | **18.000 – 26.000 đ** | • Giá siêu rẻ.<br>• Cực kỳ chính xác (tương đương DHT22).<br>• Chuẩn I2C: Dùng chung 2 dây SDA/SCL với màn hình, không tốn thêm chân GPIO nào! | • Dạng mạch module nhỏ, cần cẩn thận khi hàn dây. | ⭐⭐⭐⭐⭐ **Khuyên dùng số 1** để tối ưu cả tiền lẫn chân cắm ESP32. |

---

### 2.5. Khối chấp hành cơ khí (Khóa/Mở ngăn)

| Sản phẩm | Mức giá tham khảo | Ưu điểm | Nhược điểm | Đánh giá áp dụng cho đồ án |
|---|---|---|---|---|
| **Micro Servo SG90 (Bánh răng nhựa)** *(Bản Wokwi)* | **22.000 – 30.000 đ** | • Giá rẻ, quay đúng góc 0° - 180° theo lệnh PWM.<br>• Dễ gá lắp vào nắp hộp thuốc. | • Bánh răng nhựa dễ mòn/kẹt nếu người dùng cố cạy nắp.<br>• Tiêu thụ dòng xung lớn, dễ gây reset ESP32 nếu chung nguồn. | ⭐⭐⭐⭐ Đạt yêu cầu demo đồ án 1 ngăn. |
| **Micro Servo MG90S (Bánh răng kim loại)** | **40.000 – 55.000 đ** | • Bền gấp 3 lần SG90, lực kéo khỏe hơn (2.2kg.cm), khó bị vỡ bánh răng. | • Đắt hơn SG90 khoảng 15.000 - 20.000 đ/con. | ⭐⭐⭐⭐⭐ Rất đáng nâng cấp nếu muốn hộp thuốc đóng mở chắc chắn, bền bỉ. |
| **Động cơ bước 28BYJ-48 + Mạch ULN2003** | **22.000 – 30.000 đ** *(Cả bộ)* | • Rất rẻ cho cả bộ động cơ + driver.<br>• Dùng 1 động cơ duy nhất xoay khay tròn phân phát được cho 4 - 8 ngăn thuốc. | • Tốn 4 chân GPIO điều khiển.<br>• Cần thiết kế cơ khí dạng đĩa xoay (Carousel) phức tạp hơn nắp lật. | ⭐⭐⭐⭐⭐ Lựa chọn tối ưu nhất nếu muốn làm hộp thuốc nhiều ngăn (3-6 ngăn) mà chi phí thấp. |
| **Khóa chốt điện từ mini (Solenoid Lock 5V/12V)** | **45.000 – 65.000 đ** | • Khóa bằng sắt rất chắc chắn, thụt chốt cực nhanh. | • Thường dùng nguồn 12V (cần thêm mạch hạ áp, Mosfet/Relay lái). Ăn dòng rất lớn (1A - 2A). | ❌ Quá phức tạp và cồng kềnh cho hộp thuốc cá nhân. |

---

### 2.6. Khối xác minh liều lượng thuốc thực tế

> *Trên Wokwi chỉ có nút bấm mô phỏng. Khi làm thật, bạn có 3 giải pháp vật lý sau:*

| Sản phẩm / Công nghệ | Mức giá tham khảo | Ưu điểm | Nhược điểm | Đánh giá áp dụng cho đồ án |
|---|---|---|---|---|
| **Cảm biến trọng lượng Loadcell 1kg + Mạch HX711** | **45.000 – 60.000 đ** *(Cả bộ)* | • Cân được khối lượng thuốc thay đổi trước và sau khi lấy.<br>• Tính điểm đồ án rất cao vì có cảm biến thật.<br>• Thư viện Arduino `HX711` hỗ trợ tận răng. | • Viên thuốc nhẹ (< 0.5g) đòi hỏi hiệu chuẩn rất tỉ mỉ.<br>• Cơ khí phải lắp dạng đòn bẩy chịu lực đúng cách. | ⭐⭐⭐⭐⭐ **Khuyên dùng nếu muốn đồ án đạt điểm A/A+** về tính thực tế. |
| **Cảm biến hồng ngoại thu phát vạch / Khe rãnh (IR Beam Sensor)** | **12.000 – 20.000 đ** | • Cực rẻ, phát hiện viên thuốc rơi qua rãnh thoát ngay lập tức.<br>• Tín hiệu Digital HIGH/LOW rất dễ đọc, không cần ADC. | • Chỉ phù hợp cơ chế viên thuốc rơi tự do (dạng máy bán hàng tự động). | ⭐⭐⭐⭐ Giải pháp thông minh nếu thiết kế cơ khí dạng trượt rơi. |
| **Công tắc hành trình Micro Switch (Gắn dưới đáy khay)** | **5.000 – 10.000 đ** | • Siêu rẻ, bền.<br>• Đóng ngắt tiếp điểm khi nhấc hộp/khay thuốc lên. | • Chỉ phát hiện được hành động "có nhấc khay", không đếm được số viên thuốc. | ⭐⭐⭐ Giải pháp tiết kiệm tối đa để thay thế nút bấm Wokwi. |

---

### 2.7. Khối giao tiếp người dùng & Cảnh báo

| Sản phẩm | Mức giá tham khảo | Ưu điểm | Nhược điểm | Đánh giá áp dụng |
|---|---|---|---|---|
| **Active Buzzer 5V** *(Còi chủ động)* | **3.000 – 5.000 đ** | Cấp nguồn là kêu, code điều khiển cực dễ (`digitalWrite(HIGH)`). | Âm lượng cố định, chỉ kêu 1 tần số "bíp bíp". | ⭐⭐⭐⭐⭐ Đạt chuẩn đề bài. |
| **Passive Buzzer 5V** *(Còi thụ động)* | **3.000 – 5.000 đ** | Phát được nhạc chuông đa âm sắc bằng hàm `tone()`. | Tốn tài nguyên phát xung PWM của vi điều khiển. | ⭐⭐⭐ Có thể thay thế nếu thích đổi chuông. |
| **LED phi 5mm (Đỏ + Xanh)** | **1.000 đ / 2 bóng** | Giá gần như miễn phí, sáng rõ. | Cần hàn kèm trở hạn dòng 220Ω - 330Ω. | ⭐⭐⭐⭐⭐ Bắt buộc có. |
| **Nút nhấn 4 chân 12x12mm (Kèm nắp chụp màu)** | **2.000 – 3.000 đ / cái** | Nắp chụp có nút màu Đỏ, Xanh, Vàng phân biệt nút TAKE, SNOOZE trực quan. | Cần hàn dây. | ⭐⭐⭐⭐ Rất đẹp cho hộp tự chế. |
| **Tận dụng chân cảm ứng Touch Pin ESP32** | **0 đ** | Không tốn tiền mua nút, chỉ cần nối dây ra đinh tán/ốc kim loại trên vỏ hộp. | Cần tinh chỉnh ngưỡng cảm ứng (`touchRead()`) để tránh chạm nhầm. | ⭐⭐⭐⭐ Độc đáo, tiết kiệm chi phí. |

---

### 2.8. Khối nguồn nuôi (Power Supply)

| Sản phẩm | Mức giá tham khảo | Ưu điểm | Nhược điểm | Đánh giá áp dụng |
|---|---|---|---|---|
| **Củ sạc điện thoại 5V 2A + Cáp sạc** | **25.000 – 40.000 đ** | Nguồn ổn định, công suất đủ cho ESP32 + Servo quay không bị sụt áp, an toàn. | Hộp thuốc phải cắm cố định cạnh ổ điện. | ⭐⭐⭐⭐⭐ **Khuyên dùng cho buổi bảo vệ đồ án** để tránh rủi ro hết pin. |
| **Pin dự phòng + bộ sạc có power-path/UPS 5V** | **Chưa chốt** | Mục tiêu đã chọn: duy trì toàn hệ thống 4 giờ khi mất điện lưới. | Cần đo tải trung bình/cực đại, chọn pin và bộ chuyển đổi có bảo vệ, dòng đỉnh đủ cho ESP32 + servo; TP4056/boost rời không mặc nhiên bảo đảm chuyển nguồn liên tục hay thời lượng. | Chỉ chốt BOM sau khi đo trên mạch thật và nghiệm thu đủ 4 giờ. |

---

## 3. BẢNG SO SÁNH 3 GÓI GIẢI PHÁP CHI PHÍ (BOM SCENARIOS)

Nhóm có thể lựa chọn 1 trong 3 gói linh kiện sau tùy theo kinh phí và mục tiêu điểm số:

---

### Gói 1: Bản Tiêu chuẩn (Standard - Bám sát Wokwi nhất)
> *Mục tiêu: Đạt 100% chức năng theo đề cương và mô phỏng, code không cần sửa nhiều, dễ lắp ráp trên Breadboard để nộp đồ án.*

| STT | Tên linh kiện | Số lượng | Đơn giá dự tính | Thành tiền (VNĐ) |
|---|---|:---:|---:|---:|
| 1 | Bo mạch ESP32 DevKit V1 (30 chân) | 1 | 85.000 | 85.000 |
| 2 | Màn hình LCD 16x2 xanh lá + I2C PCF8574 | 1 | 55.000 | 55.000 |
| 3 | Module RTC DS3231 + Pin CR2032 | 1 | 38.000 | 38.000 |
| 4 | Cảm biến nhiệt độ DHT11 (thay DHT22) | 1 | 25.000 | 25.000 |
| 5 | Động cơ Servo mini SG90 | 1 | 25.000 | 25.000 |
| 6 | Active Buzzer 5V | 1 | 4.000 | 4.000 |
| 7 | LED 5mm Đỏ + Xanh + Trở hạn dòng 220Ω | 1 bộ | 3.000 | 3.000 |
| 8 | Nút nhấn nhả 12x12mm có nắp màu | 5 | 2.500 | 12.500 |
| 9 | Testboard cắm (Breadboard MB-102 830 lỗ) | 1 | 25.000 | 25.000 |
| 10 | Bó dây cắm Breadboard Đực - Cái (40 sợi) | 1 | 15.000 | 15.000 |
| 11 | Cáp MicroUSB / Type-C nạp code kiêm cấp nguồn | 1 | 15.000 | 15.000 |
| **TỔNG CỘNG** | *(Chưa gồm vỏ hộp)* | | | **~ 302.500 VNĐ** |

* **Đánh giá**: Mức giá rất hợp lý cho nhóm 3 người (~100.000 đ/thành viên). Rủi ro kỹ thuật thấp nhất.

---

### Gói 2: Bản Tối ưu chi phí tối đa (Ultra-Budget)
> *Mục tiêu: Dành cho sản phẩm muốn hạ giá thành thấp nhất có thể, đưa tính năng lên Cloud và tận dụng tính năng có sẵn của ESP32.*

| STT | Tên linh kiện | Số lượng | Đơn giá dự tính | Thành tiền (VNĐ) |
|---|---|:---:|---:|---:|
| 1 | Bo mạch ESP32-C3 SuperMini (Type-C) | 1 | 42.000 | 42.000 |
| 2 | Màn hình OLED 0.96 inch I2C (SSD1306) | 1 | 35.000 | 35.000 |
| 3 | Đồng bộ giờ NTP (Bỏ RTC ngoài) | - | 0 | 0 |
| 4 | Cảm biến AHT20 I2C | 1 | 20.000 | 20.000 |
| 5 | Động cơ Servo mini SG90 | 1 | 25.000 | 25.000 |
| 6 | Active Buzzer + 2 LED + Điện trở | 1 bộ | 6.000 | 6.000 |
| 7 | Nút nhấn cơ nhỏ (chỉ giữ 2 nút TAKE, SNOOZE; nút khác đưa lên Web) | 2 | 2.000 | 4.000 |
| 8 | Dây nối & Mạch đục lỗ (Testboard hàn) | 1 | 15.000 | 15.000 |
| 9 | Tận dụng củ sạc + dây sạc điện thoại có sẵn | 1 | 0 | 0 |
| **TỔNG CỘNG** | | | | **~ 147.000 VNĐ** |

* **Mức tiết kiệm**: **Giảm ~52%** so với Gói Tiêu chuẩn. Thiết bị rất nhỏ gọn, thẩm mỹ cao nhờ màn hình OLED.

---

### Gói 3: Bản Nâng cao / Prototype hoàn thiện (Pro Product)
> *Mục tiêu: Đồ án xuất sắc, có cân Loadcell đo thuốc thật, có pin sạc di động dự phòng, nắp hộp bánh răng kim loại bền bỉ.*

| STT | Tên linh kiện | Số lượng | Đơn giá dự tính | Thành tiền (VNĐ) |
|---|---|:---:|---:|---:|
| 1 | Bo mạch ESP32 DevKit V1 Type-C | 1 | 85.000 | 85.000 |
| 2 | Màn hình OLED 0.96" hoặc LCD 16x2 I2C | 1 | 45.000 | 45.000 |
| 3 | Module RTC DS3231 chính xác cao | 1 | 38.000 | 38.000 |
| 4 | Cảm biến AHT20 nhiệt ẩm chuẩn I2C | 1 | 20.000 | 20.000 |
| 5 | Động cơ Servo MG90S (Bánh răng kim loại siêu bền) | 1 | 45.000 | 45.000 |
| 6 | **Bộ cảm biến trọng lượng Loadcell 1kg + Mạch HX711** | 1 bộ | 50.000 | 50.000 |
| 7 | Còi Buzzer + LED + Bộ 5 nút bấm có nắp | 1 bộ | 20.000 | 20.000 |
| 8 | Bộ sạc/chuyển nguồn dự phòng 5V có power-path/UPS, dòng đỉnh phù hợp | 1 | TBD | TBD |
| 9 | Bộ pin được sizing để đạt 4 giờ theo tải đo thực tế | 1 bộ | TBD | TBD |
| 10 | Hộp nhựa đựng mạch chuyên dụng (kích thước 120x80x40mm) | 1 | 25.000 | 25.000 |
| 11 | Phụ kiện, ốc vít M3, dây cắm | 1 bộ | 20.000 | 20.000 |
| **TỔNG CỘNG** | | | | **~ 348.000 VNĐ + bộ pin/UPS TBD** |

* **Đánh giá**: Đây là sản phẩm hoàn chỉnh nhất có thể mang đi dự thi Nghiên cứu Khoa học hoặc làm Đồ án Tốt nghiệp vì có chức năng cân khối lượng thực tế. Mục tiêu pin 4 giờ cần bộ UPS/power-path được chọn theo tải đo; danh sách linh kiện hiện tại chưa xác nhận thời lượng này.

---

## 4. KINH NGHIỆM MUA HÀNG & TRÁNH LỖI PHẦN CỨNG THỰC TẾ

1. **Hiện tượng ESP32 bị Reset khi Servo hoạt động**:
   - **Nguyên nhân**: Khi Servo SG90 quay từ 0° sang 90°, nó hút dòng tức thời từ 300mA - 600mA làm sụt áp chân 5V của ESP32.
   - **Cách khắc phục thực tế**: Hàn thêm **1 tụ hóa 100uF - 470uF (giá 1.000 đ)** nối song song vào chân nguồn `VCC` và `GND` của Servo để lọc sụt áp.
2. **I2C bị treo hoặc không nhận LCD/RTC**:
   - **Nguyên nhân**: Dây bus quá dài hoặc trùng địa chỉ I2C.
   - **Cách khắc phục**: DS3231 mặc định địa chỉ `0x68`, LCD I2C mặc định `0x27` (hoặc `0x3F`). Dùng chương trình quét I2C Scanner trên Arduino để kiểm tra trước khi nạp code chính.
3. **Chân cắm ESP32 lỏng lẻo trên Breadboard**:
   - Bản ESP32 38 chân thường chiếm hết 2 hàng lỗ trên Breadboard thông thường, không còn chỗ cắm dây.
   - **Mẹo**: Mua loại **ESP32 30 chân** hoặc mua **Board mở rộng chân ESP32 (Terminal Adapter)** giá ~25.000 đ để vặn ốc dây nối chắc chắn.

---

## 5. ĐỊA CHỈ THAM KHẢO NGUỒN HÀNG TẠI VIỆT NAM

Khi mua đồ cho nhóm làm đồ án, nên gom mua chung trên **1 - 2 Shop** trên Shopee để tiết kiệm phí vận chuyển:

* **Tại TP. Hồ Chí Minh**:
  - *Hshop.vn*: Linh kiện chất lượng cao, giao nhanh, tài liệu hướng dẫn kỹ thuật rất chuẩn.
  - *TheGioiIC*: Đầy đủ linh kiện IC, chân cắm chuyên sâu.
  - *Linh kiện điện tử NShop*: Giá rẻ, nhiều module cho sinh viên, giao nhanh qua Shopee.
* **Tại Hà Nội**:
  - *Linh Kiện Cầu Giấy (LKCG)*: Giá sinh viên, hàng có sẵn phong phú.
  - *Điện tử 360 / BanLinhKien*: Phổ biến, hỗ trợ kỹ thuật tốt.
* **Đặt hàng trực tuyến (Shopee / Lazada)**:
  - Tìm kiếm theo từ khóa: `ESP32 30 chân Type-C`, `Module RTC DS3231`, `OLED 0.96 I2C`, `Servo SG90`, `Bộ Loadcell HX711`.

---
*Tài liệu được soạn thảo phục vụ triển khai phần cứng đồ án IoT - Nhóm 13.*
