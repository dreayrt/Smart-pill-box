from pathlib import Path
from math import atan2, cos, sin

from PIL import Image, ImageDraw, ImageFont


W, H = 3000, 1850
OUT = Path(__file__).resolve().parents[1] / "report_screenshots" / "luong-hoat-dong-hop-thuoc.png"
OUT.parent.mkdir(parents=True, exist_ok=True)

BG = "#F2F5FA"
WHITE = "#FFFFFF"
INK = "#17283F"
MUTED = "#5E7087"
LINE = "#8192A8"
BLUE = "#3478C5"
BLUE_LIGHT = "#EAF3FF"
TEAL = "#0D827D"
TEAL_LIGHT = "#E7F6F4"
PURPLE = "#7255AA"
PURPLE_LIGHT = "#F1ECFA"
GREEN = "#19845B"
GREEN_LIGHT = "#E8F6EE"
ORANGE = "#B97817"
ORANGE_LIGHT = "#FFF4E2"
RED = "#C64D4D"
RED_LIGHT = "#FCEDEE"
BORDER = "#DCE4EE"

font_regular_candidates = [
    Path("C:/Windows/Fonts/arial.ttf"),
    Path("C:/Windows/Fonts/segoeui.ttf"),
]
font_bold_candidates = [
    Path("C:/Windows/Fonts/arialbd.ttf"),
    Path("C:/Windows/Fonts/segoeuib.ttf"),
]
font_regular_path = next((p for p in font_regular_candidates if p.exists()), None)
font_bold_path = next((p for p in font_bold_candidates if p.exists()), font_regular_path)


def font(size, bold=False):
    path = font_bold_path if bold else font_regular_path
    return ImageFont.truetype(str(path), size) if path else ImageFont.load_default()


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)


def rounded(rect, fill, outline=None, radius=28, width=3):
    d.rounded_rectangle(rect, radius=radius, fill=fill, outline=outline, width=width)


def centered_lines(cx, y, lines, fnt, fill=INK, gap=10):
    yy = y
    for line in lines:
        box = d.textbbox((0, 0), line, font=fnt)
        tw = box[2] - box[0]
        th = box[3] - box[1]
        d.text((cx - tw / 2, yy), line, font=fnt, fill=fill)
        yy += th + gap
    return yy


def panel(rect, title, accent):
    x1, y1, x2, y2 = rect
    d.rounded_rectangle((x1 + 8, y1 + 10, x2 + 8, y2 + 10), radius=34, fill="#E3EAF2")
    rounded(rect, WHITE, BORDER, 34, 3)
    d.rounded_rectangle((x1, y1, x2, y1 + 105), radius=32, fill=accent)
    d.rectangle((x1, y1 + 70, x2, y1 + 105), fill=accent)
    fnt = font(31, True)
    box = d.textbbox((0, 0), title, font=fnt)
    d.text(((x1 + x2 - (box[2] - box[0])) / 2, y1 + 34), title, font=fnt, fill=WHITE)


def card(rect, title, lines, color, pale, title_size=29, body_size=25, radius=24):
    x1, y1, x2, y2 = rect
    rounded(rect, pale, BORDER, radius, 2)
    d.rounded_rectangle((x1, y1, x1 + 12, y2), radius=6, fill=color)
    tf = font(title_size, True)
    bodyf = font(body_size)
    title_box = d.textbbox((0, 0), title, font=tf)
    d.text(((x1 + x2 - (title_box[2] - title_box[0])) / 2, y1 + 20), title, font=tf, fill=color)
    heights = [d.textbbox((0, 0), line, font=bodyf)[3] - d.textbbox((0, 0), line, font=bodyf)[1] for line in lines]
    total = sum(heights) + max(0, len(lines) - 1) * 7
    yy = y1 + 58 + max(0, (y2 - y1 - 65 - total) / 2)
    for line, th in zip(lines, heights):
        box = d.textbbox((0, 0), line, font=bodyf)
        tw = box[2] - box[0]
        d.text(((x1 + x2 - tw) / 2, yy), line, font=bodyf, fill=INK)
        yy += th + 7


def diamond(rect, lines, color=TEAL, pale=TEAL_LIGHT, fsize=28):
    x1, y1, x2, y2 = rect
    pts = [((x1+x2)//2, y1), (x2, (y1+y2)//2), ((x1+x2)//2, y2), (x1, (y1+y2)//2)]
    d.polygon(pts, fill=pale, outline=color)
    d.line(pts + [pts[0]], fill=color, width=4, joint="curve")
    total_height = len(lines) * (fsize + 9)
    centered_lines((x1+x2)//2, (y1+y2-total_height)//2 + 3, lines, font(fsize, True), INK, 8)


def arrow(points, color=LINE, width=7, head=22):
    d.line(points, fill=color, width=width, joint="curve")
    x1, y1 = points[-2]
    x2, y2 = points[-1]
    ang = atan2(y2 - y1, x2 - x1)
    left = (x2 - head*cos(ang) + head*0.55*sin(ang), y2 - head*sin(ang) - head*0.55*cos(ang))
    right = (x2 - head*cos(ang) - head*0.55*sin(ang), y2 - head*sin(ang) + head*0.55*cos(ang))
    d.polygon([(x2, y2), left, right], fill=color)


def tag(x, y, text, fill, ink):
    fnt = font(21, True)
    bb = d.textbbox((0, 0), text, font=fnt)
    tw = bb[2] - bb[0]
    d.rounded_rectangle((x, y, x + tw + 24, y + 38), radius=18, fill=fill)
    d.text((x + 12, y + 7), text, font=fnt, fill=ink)


# Header
d.rounded_rectangle((60, 55, 2940, 205), radius=36, fill="#122A45")
d.ellipse((100, 91, 164, 155), fill="#65D3C5")
d.line([(113, 123), (128, 138), (152, 109)], fill="#123B48", width=8, joint="curve")
d.text((195, 76), "LUỒNG HOẠT ĐỘNG HỘP THUỐC THÔNG MINH IoT", font=font(52, True), fill=WHITE)
d.text((198, 143), "ESP32 • Lịch uống • Xác minh liều • Đồng bộ Firebase", font=font(29), fill="#D3DFEC")

# Main panels
panel((60, 245, 610, 1780), "THIẾT BỊ NGOẠI VI", BLUE)
panel((650, 245, 2350, 1780), "ESP32 + FIRMWARE", TEAL)
panel((2400, 245, 2940, 1780), "LƯU TRỮ & GIÁM SÁT", PURPLE)

# Hardware input / output blocks
tag(92, 385, "ĐẦU VÀO", BLUE_LIGHT, BLUE)
card((90, 435, 580, 595), "RTC DS3231 · I2C", ["Cung cấp thời gian thực"], BLUE, BLUE_LIGHT, 26, 23)
card((90, 620, 580, 780), "DHT22 · GPIO", ["Nhiệt độ và độ ẩm"], BLUE, BLUE_LIGHT, 26, 23)
card((90, 805, 580, 1015), "CỤM NÚT NHẤN · GPIO", ["TAKE · SNOOZE · REMOVE", "MENU: xác nhận cảnh báo", "LOAD: nạp thêm · UP/DOWN: xem ngăn"], BLUE, BLUE_LIGHT, 25, 22)
tag(92, 1070, "ĐẦU RA", GREEN_LIGHT, GREEN)
card((90, 1120, 580, 1280), "LCD 1602 · I2C", ["Giờ, trạng thái và liều"], GREEN, GREEN_LIGHT, 26, 23)
card((90, 1305, 580, 1475), "LED XANH/ĐỎ + CÒI", ["Nhắc uống và cảnh báo lỗi"], GREEN, GREEN_LIGHT, 25, 23)
card((90, 1500, 580, 1670), "SERVO SG90 · GPIO", ["Mở / đóng nắp ngăn thuốc"], GREEN, GREEN_LIGHT, 25, 23)

# I/O arrows between peripherals and controller
arrow([(610, 720), (650, 720)], BLUE, 8, 18)
arrow([(650, 1390), (610, 1390)], GREEN, 8, 18)

# Controller flow: startup and continuous schedule check
card((700, 405, 1165, 555), "1 · KHỞI ĐỘNG", ["Khởi tạo ESP32 và phần cứng"], TEAL, TEAL_LIGHT, 27, 23)
card((1225, 405, 1735, 555), "2 · NẠP DỮ LIỆU", ["Lịch, liều, tồn kho từ NVS", "Cập nhật từ Firebase khi online"], TEAL, TEAL_LIGHT, 27, 22)
card((1795, 405, 2300, 555), "3 · ĐỌC THỜI GIAN", ["RTC DS3231; NTP hiệu chỉnh", "Thiếu giờ hợp lệ: chưa nhắc"], TEAL, TEAL_LIGHT, 26, 22)
arrow([(1165, 480), (1225, 480)], TEAL, 7, 18)
arrow([(1735, 480), (1795, 480)], TEAL, 7, 18)
arrow([(2047, 555), (2047, 590), (1500, 590), (1500, 615)], TEAL, 7, 18)

diamond((1240, 615, 1760, 800), ["ĐẾN LỊCH UỐNG?", "Ngăn đã nạp thuốc"], TEAL, TEAL_LIGHT, 27)
card((1835, 640, 2280, 785), "CHƯA ĐẾN LỊCH", ["Tiếp tục kiểm tra giờ"], BLUE, BLUE_LIGHT, 25, 23)
arrow([(1760, 707), (1835, 707)], BLUE, 7, 18)
tag(1768, 660, "KHÔNG", BLUE_LIGHT, BLUE)
arrow([(2280, 707), (2310, 707), (2310, 480), (2300, 480)], BLUE, 6, 18)
arrow([(1500, 800), (1500, 840)], GREEN, 8, 20)
tag(1520, 800, "CÓ", GREEN_LIGHT, GREEN)

card((1170, 840, 1830, 975), "4 · PHÁT NHẮC UỐNG THUỐC", ["Bật còi / LED · LCD hiển thị ngăn và liều"], ORANGE, ORANGE_LIGHT, 27, 24)
arrow([(1500, 975), (1500, 1005)], ORANGE, 7, 18)
diamond((1290, 1005, 1710, 1115), ["CHỜ THAO TÁC"], ORANGE, ORANGE_LIGHT, 25)

# Reminder actions
card((700, 1145, 1150, 1305), "SNOOZE", ["Tắt chuông 5 phút", "Sau đó nhắc lại"], ORANGE, ORANGE_LIGHT, 27, 23)
card((1200, 1145, 1740, 1305), "TAKE", ["Mở nắp bằng servo", "Bắt đầu đếm REMOVE · tối đa 60 giây"], BLUE, BLUE_LIGHT, 27, 22)
card((1810, 1145, 2280, 1305), "KHÔNG PHẢN HỒI", ["Sau 10 phút: ghi nhận", "MISSED_DOSE"], RED, RED_LIGHT, 25, 23)
arrow([(1290, 1060), (1240, 1060), (1240, 1100), (1150, 1185)], ORANGE, 6, 18)
tag(1138, 1063, "SNOOZE", ORANGE_LIGHT, ORANGE)
arrow([(1500, 1115), (1500, 1145)], BLUE, 7, 18)
tag(1515, 1116, "TAKE", BLUE_LIGHT, BLUE)
arrow([(1710, 1060), (1760, 1060), (1760, 1100), (1810, 1185)], RED, 6, 18)
tag(1730, 1063, "10 PHÚT", RED_LIGHT, RED)

# Snooze loop back to reminder
arrow([(700, 1225), (670, 1225), (670, 910), (1170, 910)], ORANGE, 6, 18)
tag(690, 970, "HẸN LẠI SAU 5 PHÚT", ORANGE_LIGHT, ORANGE)

# Dose verification and outcomes
arrow([(1470, 1305), (1470, 1330)], BLUE, 7, 18)
diamond((1200, 1330, 1740, 1485), ["ĐỦ ĐÚNG LIỀU?", "Đếm số viên REMOVE"], TEAL, TEAL_LIGHT, 26)
arrow([(1200, 1407), (1130, 1407), (1130, 1515), (1080, 1515)], GREEN, 7, 18)
tag(1085, 1420, "ĐÚNG", GREEN_LIGHT, GREEN)
arrow([(1740, 1407), (1810, 1407), (1810, 1515), (1900, 1515)], RED, 7, 18)
tag(1750, 1420, "SAI / HẾT GIỜ", RED_LIGHT, RED)

card((700, 1515, 1460, 1670), "HOÀN TẤT LIỀU", ["Báo thành công → chờ 8 giây → đóng nắp", "Trừ tồn kho và gửi sự kiện xác minh"], GREEN, GREEN_LIGHT, 27, 22)
card((1510, 1515, 2300, 1670), "CẢNH BÁO / BỎ LỠ", ["Thừa, thiếu hoặc quá hạn: báo lỗi, đóng nắp", "Ghi log lên Firebase; MENU xác nhận lỗi"], RED, RED_LIGHT, 26, 22)
arrow([(2045, 1305), (2045, 1515)], RED, 6, 18)

# End state after success or acknowledged error
rounded((1170, 1690, 1830, 1760), "#E9EEF5", BORDER, 28, 2)
centered_lines(1500, 1707, ["ĐÓNG CHU TRÌNH  →  TRỞ LẠI IDLE"], font(24, True), INK, 4)
arrow([(1080, 1670), (1080, 1725), (1170, 1725)], GREEN, 6, 17)
arrow([(1900, 1670), (1900, 1725), (1830, 1725)], RED, 6, 17)

# Local storage and cloud/dashboard
card((2430, 405, 2910, 610), "NVS · FLASH ESP32", ["Cache lịch, liều và tồn kho", "Dùng dữ liệu đã lưu khi offline"], PURPLE, PURPLE_LIGHT, 25, 22)
arrow([(2350, 485), (2390, 485), (2430, 485)], PURPLE, 6, 17)
tag(2340, 440, "LƯU / ĐỌC", PURPLE_LIGHT, PURPLE)

card((2460, 700, 2880, 830), "WI-FI", ["HTTPS REST"], BLUE, BLUE_LIGHT, 27, 24)
card((2430, 915, 2910, 1145), "FIREBASE REALTIME DATABASE", ["Cấu hình lịch và liều", "Tồn kho · sự kiện xác minh", "Trạng thái / telemetry"], PURPLE, PURPLE_LIGHT, 23, 21)
card((2460, 1240, 2880, 1435), "WEB DASHBOARD", ["Theo dõi trạng thái thiết bị", "Cập nhật lịch và tồn kho"], BLUE, BLUE_LIGHT, 25, 22)

# ESP32-to-cloud path, dashboard-to-database exchange
arrow([(2350, 895), (2390, 895), (2390, 980), (2430, 980)], PURPLE, 7, 17)
tag(2350, 850, "HTTPS", PURPLE_LIGHT, PURPLE)
arrow([(2670, 830), (2670, 915)], BLUE, 6, 18)
arrow([(2740, 915), (2740, 830)], BLUE, 6, 18)
arrow([(2670, 1145), (2670, 1240)], BLUE, 6, 18)
arrow([(2740, 1240), (2740, 1145)], BLUE, 6, 18)

rounded((2430, 1500, 2910, 1690), "#F7F4FC", BORDER, 24, 2)
centered_lines(2670, 1530, ["ĐỒNG BỘ HAI CHIỀU", "Lịch / lệnh điều chỉnh ↓", "Tồn kho / log / trạng thái ↑"], font(22, True), PURPLE, 13)

# Footer note
d.text((75, 1800), "Nhóm 13  ·  Mô hình vận hành: ESP32 + RTC DS3231 + Firebase Realtime Database", font=font(21), fill=MUTED)

img.save(OUT, format="PNG", optimize=True, dpi=(300, 300))
print(OUT)
print(f"{W}x{H} px")

