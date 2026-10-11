#include "sync_interface.h"
#include "credentials.h"
#include "state_machine.h"
#include "hardware_interface.h"

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// Định nghĩa mã màu ANSI cho log Serial
#define CLOUD_ANSI_RESET   "\033[0m"
#define CLOUD_ANSI_BOLD    "\033[1m"
#define CLOUD_ANSI_CYAN    "\033[1;36m"
#define CLOUD_ANSI_GREEN   "\033[1;32m"
#define CLOUD_ANSI_YELLOW  "\033[1;33m"
#define CLOUD_ANSI_RED     "\033[1;31m"
#define CLOUD_ANSI_MAGENTA "\033[1;35m"

// =========================================================================
// 1. CƠ CHẾ OFFLINE BUFFER (CIRCULAR QUEUE TRONG RAM)
// =========================================================================
static const int OFFLINE_QUEUE_SIZE = 10;
static VerificationEvent offlineQueue[OFFLINE_QUEUE_SIZE];
static int queueCount = 0;
static int queueHead = 0;
static int queueTail = 0;

static bool enqueueOfflineEvent(const VerificationEvent &ev) {
    if (queueCount >= OFFLINE_QUEUE_SIZE) {
        // Nếu hàng đợi đầy, ghi đè phần tử cũ nhất (FIFO)
        queueHead = (queueHead + 1) % OFFLINE_QUEUE_SIZE;
        queueCount--;
    }
    offlineQueue[queueTail] = ev;
    queueTail = (queueTail + 1) % OFFLINE_QUEUE_SIZE;
    queueCount++;
    return true;
}

static bool dequeueOfflineEvent(VerificationEvent &outEv) {
    if (queueCount == 0) return false;
    outEv = offlineQueue[queueHead];
    queueHead = (queueHead + 1) % OFFLINE_QUEUE_SIZE;
    queueCount--;
    return true;
}

// =========================================================================
// 2. BIẾN QUẢN LÝ KẾT NỐI & THỜI GIAN
// =========================================================================
static unsigned long lastWifiCheckMillis = 0;
static unsigned long lastTelemetryMillis = 0;
static bool isCloudReady = false;

// Chuẩn hóa Base URL (bỏ dấu '/' ở cuối nếu có)
static String getNormalizedHost() {
    String host = String(FIREBASE_HOST);
    while (host.endsWith("/")) {
        host.remove(host.length() - 1);
    }
    return host;
}

// Tạo URL đầy đủ cho REST API Firebase
static String buildFirebaseUrl(const String &path) {
    String p = path;
    if (!p.startsWith("/")) p = "/" + p;
    return getNormalizedHost() + p + ".json?auth=" + String(FIREBASE_AUTH);
}

// =========================================================================
// 3. KHỞI TẠO MẠNG & FIREBASE (cloud_init)
// =========================================================================
void cloud_init() {
    Serial.printf("\r\n" CLOUD_ANSI_CYAN "+--------------------------------------------------------------+\r\n" CLOUD_ANSI_RESET);
    Serial.printf(CLOUD_ANSI_CYAN "| [CLOUD SYNC] Đang khởi tạo kết nối Wi-Fi & Firebase RTDB...  |\r\n" CLOUD_ANSI_RESET);
    Serial.printf(CLOUD_ANSI_CYAN "+--------------------------------------------------------------+\r\n" CLOUD_ANSI_RESET);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    Serial.printf("  • Đang kết nối tới SSID: " CLOUD_ANSI_YELLOW "%s" CLOUD_ANSI_RESET "...\r\n", WIFI_SSID);

    unsigned long startWait = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startWait < 8000)) {
        delay(250);
        Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        isCloudReady = true;
        Serial.printf("  • " CLOUD_ANSI_GREEN "Wi-Fi kết nối thành công! IP: %s" CLOUD_ANSI_RESET "\r\n", 
                      WiFi.localIP().toString().c_str());
        Serial.printf("  • Firebase Host: %s\r\n", getNormalizedHost().c_str());
    } else {
        isCloudReady = false;
        Serial.printf("  • " CLOUD_ANSI_YELLOW "Wi-Fi chưa sẵn sàng (chạy chế độ Offline Buffer)." CLOUD_ANSI_RESET "\r\n");
    }
}

// =========================================================================
// 4. KIỂM TRA TRẠNG THÁI KẾT NỐI (cloud_isOnline)
// =========================================================================
bool cloud_isOnline() {
    return (WiFi.status() == WL_CONNECTED);
}

// =========================================================================
// 5. GỬI SỰ KIỆN LÊN FIREBASE (cloud_pushEvent)
// =========================================================================
static bool sendEventToFirebase(const VerificationEvent &ev) {
    if (!cloud_isOnline()) return false;

    WiFiClientSecure client;
    client.setInsecure(); // Bỏ qua xác thực chứng chỉ SSL để chạy mượt mà trên MCU/Wokwi
    client.setTimeout(4000);

    HTTPClient http;
    String url = buildFirebaseUrl("/events/" + String(ev.eventId));
    
    if (!http.begin(client, url)) {
        return false;
    }

    http.addHeader("Content-Type", "application/json");

    // Tạo payload JSON
    StaticJsonDocument<384> doc;
    doc["eventId"] = ev.eventId;
    doc["compartmentId"] = ev.compartmentId;
    doc["medicineCode"] = ev.medicineCode;
    doc["expectedUnits"] = ev.expectedUnits;
    doc["detectedUnits"] = ev.detectedUnits;
    doc["compartmentMatch"] = ev.compartmentMatch;
    doc["quantityMatch"] = ev.quantityMatch;
    doc["userConfirmed"] = ev.userConfirmed;
    doc["status"] = ev.status;
    doc["timestamp"] = ev.timestamp > 0 ? ev.timestamp : (millis() / 1000);

    String payload;
    serializeJson(doc, payload);

    int httpCode = http.PUT(payload);
    bool success = (httpCode == 200 || httpCode == 204);
    http.end();

    return success;
}

void cloud_pushEvent(const VerificationEvent &ev) {
    Serial.printf("\r\n  " CLOUD_ANSI_MAGENTA "☁️  [CLOUD SYNC] Đang xử lý sự kiện: %s (Ngăn %s)" CLOUD_ANSI_RESET "\r\n", 
                  ev.eventId, ev.compartmentId);

    if (cloud_isOnline()) {
        bool ok = sendEventToFirebase(ev);
        if (ok) {
            Serial.printf("      ↳ " CLOUD_ANSI_GREEN "Đã đẩy thành công lên Firebase (/events/%s)!" CLOUD_ANSI_RESET "\r\n", ev.eventId);
            return;
        } else {
            Serial.printf("      ↳ " CLOUD_ANSI_YELLOW "Lỗi HTTP khi gửi, chuyển vào Offline Queue." CLOUD_ANSI_RESET "\r\n");
        }
    } else {
        Serial.printf("      ↳ " CLOUD_ANSI_YELLOW "Mất kết nối mạng! Lưu vào Offline Queue (Còn %d chỗ)." CLOUD_ANSI_RESET "\r\n", 
                      OFFLINE_QUEUE_SIZE - queueCount);
    }

    // Đưa vào hàng đợi để đẩy bù sau khi có mạng
    enqueueOfflineEvent(ev);
}

// =========================================================================
// 6. CẬP NHẬT TELEMETRY TRẠNG THÁI MÁY (/deviceStatus)
// =========================================================================
void cloud_updateTelemetry(float t, float h, SystemState st) {
    if (!cloud_isOnline()) return;

    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(3000);

    HTTPClient http;
    String url = buildFirebaseUrl("/deviceStatus");

    if (!http.begin(client, url)) return;

    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["online"] = true;
    doc["lastSeen"] = millis() / 1000;
    doc["currentTemp"] = t;
    doc["currentHumid"] = h;
    doc["currentState"] = fsm_getStateName(st);
    doc["activeAlarm"] = (st == STATE_ERROR || st == STATE_REMINDER);

    String payload;
    serializeJson(doc, payload);

    http.PATCH(payload);
    http.end();
}

// =========================================================================
// 7. ĐỒNG BỘ CẤU HÌNH NGĂN THUỐC TỪ XA (/config/compartments)
// =========================================================================
bool cloud_fetchCompartmentConfig(MedicationCompartment* outList, int maxCount) {
    if (!cloud_isOnline() || outList == NULL || maxCount <= 0) return false;

    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(4000);

    HTTPClient http;
    String url = buildFirebaseUrl("/config/compartments");

    if (!http.begin(client, url)) return false;

    int httpCode = http.GET();
    if (httpCode != 200) {
        http.end();
        return false;
    }

    String response = http.getString();
    http.end();

    DynamicJsonDocument doc(1536);
    DeserializationError error = deserializeJson(doc, response);
    if (error) {
        Serial.printf("  [CLOUD SYNC] Lỗi parse JSON cấu hình: %s\r\n", error.c_str());
        return false;
    }

    JsonObject root = doc.as<JsonObject>();
    int index = 0;
    for (JsonPair kv : root) {
        if (index >= maxCount) break;
        JsonObject obj = kv.value().as<JsonObject>();

        const char* compId = obj["compartmentId"] | kv.key().c_str();
        const char* code = obj["medicineCode"] | "MED-000";
        const char* name = obj["displayName"] | "Thuoc";
        const char* sched = obj["schedule"] | "08:00";
        uint8_t units = obj["unitsPerDose"] | 1;
        uint8_t stock = obj["currentStock"] | 0;
        bool loaded = obj["isLoaded"] | true;

        // Parse schedule HH:MM
        int h = 8, m = 0;
        sscanf(sched, "%d:%d", &h, &m);

        strncpy(outList[index].compartmentId, compId, sizeof(outList[index].compartmentId) - 1);
        strncpy(outList[index].medicineCode, code, sizeof(outList[index].medicineCode) - 1);
        strncpy(outList[index].displayName, name, sizeof(outList[index].displayName) - 1);
        outList[index].scheduleHour = (uint8_t)h;
        outList[index].scheduleMinute = (uint8_t)m;
        outList[index].unitsPerDose = units;
        outList[index].currentStock = stock;
        outList[index].isLoaded = loaded;

        index++;
    }

    Serial.printf("  [CLOUD SYNC] Đã đồng bộ %d ngăn thuốc từ Firebase về thiết bị.\r\n", index);
    return true;
}

// =========================================================================
// 8. VÒNG LẶP NỀN DUY TRÌ & ĐẨY BÙ QUEUE (cloud_loop)
// =========================================================================
void cloud_loop() {
    unsigned long now = millis();

    // 1. Kiểm tra tái lập kết nối Wi-Fi định kỳ nếu bị mất mạng (mỗi 5 giây)
    if (now - lastWifiCheckMillis >= 5000UL) {
        lastWifiCheckMillis = now;
        if (WiFi.status() != WL_CONNECTED) {
            WiFi.reconnect();
        }
    }

    // 2. Nếu có mạng và còn sự kiện tồn đọng trong Offline Queue -> Tự động đẩy bù
    if (cloud_isOnline() && queueCount > 0) {
        VerificationEvent ev;
        if (dequeueOfflineEvent(ev)) {
            Serial.printf("  " CLOUD_ANSI_CYAN "🔄 [OFFLINE SYNC] Đang đẩy bù sự kiện tồn đọng: %s (Còn %d trong Queue)" CLOUD_ANSI_RESET "\r\n", 
                          ev.eventId, queueCount);
            bool ok = sendEventToFirebase(ev);
            if (!ok) {
                // Nếu đẩy lại vẫn thất bại, nạp lại vào hàng đợi
                enqueueOfflineEvent(ev);
            }
        }
    }

    // 3. Heartbeat Telemetry định kỳ mỗi 10 giây
    if (now - lastTelemetryMillis >= 10000UL) {
        lastTelemetryMillis = now;
        float t = 28.0;
        float h = 65.0;
        hw_getEnvData(t, h);
        cloud_updateTelemetry(t, h, fsm_getState());
    }
}
