#include "sync_interface.h"
#include "credentials.h"
#include "state_machine.h"
#include "hardware_interface.h"
#include "schedule.h"

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <ctype.h>
#include <stdio.h>
#include <string.h>

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
static unsigned long lastConfigPollMillis = 0;
static const unsigned long CONFIG_POLL_INTERVAL_MS = 15000UL;
static bool isCloudReady = false;
static bool wasWifiOnline = false;
static bool configSyncRequested = false;
static bool hasAppliedRemoteConfig = false;
static unsigned long lastCommandPollMillis = 0;
static unsigned long lastInventorySyncMillis = 0;
static unsigned long lastInventoryBootstrapMillis = 0;
static const unsigned long COMMAND_POLL_INTERVAL_MS = 3000UL;
static const unsigned long INVENTORY_SYNC_INTERVAL_MS = 5000UL;
static const unsigned long INVENTORY_BOOTSTRAP_INTERVAL_MS = 15000UL;
static const uint8_t MAX_COMPARTMENT_STOCK = 100;

static const uint32_t INVENTORY_NVS_MAGIC = 0x50424F58UL;
static const uint32_t COMPARTMENT_CONFIG_NVS_MAGIC = 0x43464731UL;
static const uint8_t COMPARTMENT_CONFIG_NVS_VERSION = 1;
static const size_t LAST_COMMAND_ID_SIZE = 40;
struct InventoryNvsState {
    uint32_t magic;
    uint8_t stocks[NUM_COMPARTMENTS];
    uint8_t dirtyMask;
    uint8_t initialized;
    uint32_t revisions[NUM_COMPARTMENTS];
    char lastAppliedCommandId[LAST_COMMAND_ID_SIZE];
};
struct CompartmentConfigNvsEntry {
    char compartmentId[4];
    char medicineCode[16];
    char displayName[32];
    uint8_t unitsPerDose;
    uint8_t scheduleHour;
    uint8_t scheduleMinute;
    uint8_t isLoaded;
};
struct CompartmentConfigNvsState {
    uint32_t magic;
    uint8_t version;
    CompartmentConfigNvsEntry entries[NUM_COMPARTMENTS];
};
static InventoryNvsState inventoryState = {};
static bool inventoryNvsLoaded = false;

static bool syncRemoteCompartmentConfig();
static int compartmentIndexFromId(const char* id);
static void restoreInventoryFromNvs();
static bool saveCompartmentConfigToNvs();
static void restoreCompartmentConfigFromNvs();
static bool bootstrapInventoryFromFirebase();
static bool processNextInventoryCommand();
static void syncDirtyInventory();

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

    // Khôi phục tồn kho gần nhất trước khi bắt đầu kết nối mạng.
    restoreInventoryFromNvs();
    restoreCompartmentConfigFromNvs();

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
        wasWifiOnline = true;
        Serial.printf("  • " CLOUD_ANSI_GREEN "Wi-Fi kết nối thành công! IP: %s" CLOUD_ANSI_RESET "\r\n", 
                      WiFi.localIP().toString().c_str());
        Serial.printf("  • Firebase Host: %s\r\n", getNormalizedHost().c_str());
        Serial.println("  • Đang tải cấu hình các ngăn từ Firebase...");
        syncRemoteCompartmentConfig();
        bootstrapInventoryFromFirebase();
        syncDirtyInventory();
        lastConfigPollMillis = millis();
        lastInventoryBootstrapMillis = millis();
    } else {
        isCloudReady = false;
        wasWifiOnline = false;
        Serial.printf("  • " CLOUD_ANSI_YELLOW "Wi-Fi chưa sẵn sàng (chạy chế độ Offline Buffer)." CLOUD_ANSI_RESET "\r\n");
    }
}

// =========================================================================
// 4. KIỂM TRA TRẠNG THÁI KẾT NỐI (cloud_isOnline)
// =========================================================================
bool cloud_isOnline() {
    return (WiFi.status() == WL_CONNECTED);
}

bool cloud_hasScheduleConfig() {
    return hasAppliedRemoteConfig;
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
static int compartmentIndexFromId(const char* id) {
    if (!id) return -1;
    if (strcmp(id, "A") == 0) return 0;
    if (strcmp(id, "B") == 0) return 1;
    if (strcmp(id, "C") == 0) return 2;
    return -1;
}

static bool saveInventoryNvs() {
    Preferences prefs;
    if (!prefs.begin("pillbox", false)) {
        Serial.println("  [INVENTORY] Không mở được NVS để lưu tồn kho.");
        return false;
    }
    inventoryState.magic = INVENTORY_NVS_MAGIC;
    size_t written = prefs.putBytes("inventory", &inventoryState, sizeof(inventoryState));
    prefs.end();
    if (written != sizeof(inventoryState)) {
        Serial.println("  [INVENTORY] Lưu NVS chưa đầy đủ; sẽ thử lại ở lần cập nhật kế tiếp.");
        return false;
    }
    return true;
}

static void restoreInventoryFromNvs() {
    MedicationCompartment* compartments = schedule_getCompartments();
    memset(&inventoryState, 0, sizeof(inventoryState));
    inventoryState.magic = INVENTORY_NVS_MAGIC;
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        inventoryState.stocks[i] = compartments[i].currentStock;
    }

    Preferences prefs;
    if (prefs.begin("pillbox", true)) {
        if (prefs.getBytesLength("inventory") == sizeof(inventoryState)) {
            InventoryNvsState saved = {};
            if (prefs.getBytes("inventory", &saved, sizeof(saved)) == sizeof(saved) &&
                saved.magic == INVENTORY_NVS_MAGIC &&
                saved.initialized <= 1 &&
                (saved.dirtyMask & (uint8_t)~((1U << NUM_COMPARTMENTS) - 1U)) == 0 &&
                memchr(saved.lastAppliedCommandId, '\0', sizeof(saved.lastAppliedCommandId)) != NULL) {
                bool valid = true;
                for (int i = 0; i < NUM_COMPARTMENTS; i++) {
                    if (saved.stocks[i] > MAX_COMPARTMENT_STOCK) valid = false;
                }
                if (valid) inventoryState = saved;
            }
        }
        prefs.end();
    }

    inventoryNvsLoaded = true;
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        compartments[i].currentStock = inventoryState.stocks[i];
    }
    if (inventoryState.initialized) {
        Serial.println("  [INVENTORY] Đã khôi phục tồn kho gần nhất từ NVS.");
    } else {
        Serial.println("  [INVENTORY] Chưa có bản tồn kho đã đồng bộ; sẽ nạp từ Firebase khi online.");
    }
}

static bool saveCompartmentConfigToNvs() {
    CompartmentConfigNvsState saved = {};
    saved.magic = COMPARTMENT_CONFIG_NVS_MAGIC;
    saved.version = COMPARTMENT_CONFIG_NVS_VERSION;

    MedicationCompartment* compartments = schedule_getCompartments();
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        CompartmentConfigNvsEntry &entry = saved.entries[i];
        memcpy(entry.compartmentId, compartments[i].compartmentId, sizeof(entry.compartmentId));
        memcpy(entry.medicineCode, compartments[i].medicineCode, sizeof(entry.medicineCode));
        memcpy(entry.displayName, compartments[i].displayName, sizeof(entry.displayName));
        entry.unitsPerDose = compartments[i].unitsPerDose;
        entry.scheduleHour = compartments[i].scheduleHour;
        entry.scheduleMinute = compartments[i].scheduleMinute;
        entry.isLoaded = compartments[i].isLoaded ? 1 : 0;
    }

    Preferences prefs;
    if (!prefs.begin("pillbox", false)) {
        Serial.println("  [CLOUD SYNC] Khong mo duoc NVS de luu cau hinh lich.");
        return false;
    }
    const size_t written = prefs.putBytes("compConfig", &saved, sizeof(saved));
    prefs.end();
    if (written != sizeof(saved)) {
        Serial.println("  [CLOUD SYNC] Luu cau hinh lich vao NVS that bai.");
        return false;
    }
    return true;
}

static void restoreCompartmentConfigFromNvs() {
    Preferences prefs;
    if (!prefs.begin("pillbox", true)) return;

    CompartmentConfigNvsState saved = {};
    const bool present = prefs.getBytesLength("compConfig") == sizeof(saved) &&
        prefs.getBytes("compConfig", &saved, sizeof(saved)) == sizeof(saved);
    prefs.end();
    if (!present || saved.magic != COMPARTMENT_CONFIG_NVS_MAGIC ||
        saved.version != COMPARTMENT_CONFIG_NVS_VERSION) {
        Serial.println("  [CLOUD SYNC] Chua co cau hinh lich offline hop le trong NVS.");
        return;
    }

    bool valid = true;
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        const CompartmentConfigNvsEntry &entry = saved.entries[i];
        const char expectedId = (char)('A' + i);
        if (entry.compartmentId[0] != expectedId || entry.compartmentId[1] != '\0' ||
            entry.unitsPerDose < 1 || entry.unitsPerDose > 10 ||
            entry.scheduleHour > 23 || entry.scheduleMinute > 59 || entry.isLoaded > 1 ||
            memchr(entry.medicineCode, '\0', sizeof(entry.medicineCode)) == NULL ||
            memchr(entry.displayName, '\0', sizeof(entry.displayName)) == NULL) {
            valid = false;
            break;
        }
    }
    if (!valid) {
        Serial.println("  [CLOUD SYNC] Cau hinh lich trong NVS sai dinh dang; bo qua.");
        return;
    }

    MedicationCompartment* current = schedule_getCompartments();
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        const CompartmentConfigNvsEntry &entry = saved.entries[i];
        MedicationCompartment restored = current[i];
        memcpy(restored.medicineCode, entry.medicineCode, sizeof(restored.medicineCode));
        memcpy(restored.displayName, entry.displayName, sizeof(restored.displayName));
        restored.unitsPerDose = entry.unitsPerDose;
        restored.scheduleHour = entry.scheduleHour;
        restored.scheduleMinute = entry.scheduleMinute;
        restored.isLoaded = entry.isLoaded != 0;
        schedule_updateCompartment(restored);
    }
    hasAppliedRemoteConfig = true;
    Serial.println("  [CLOUD SYNC] Da khoi phuc cau hinh lich A/B/C tu NVS.");
}

static bool readFirebaseJson(const String &path, DynamicJsonDocument &doc) {
    if (!cloud_isOnline()) return false;

    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(4000);
    HTTPClient http;
    if (!http.begin(client, buildFirebaseUrl(path))) return false;

    int httpCode = http.GET();
    if (httpCode != 200) {
        Serial.printf("  [INVENTORY] Đọc %s thất bại (HTTP %d).\r\n", path.c_str(), httpCode);
        http.end();
        return false;
    }
    String response = http.getString();
    http.end();

    DeserializationError error = deserializeJson(doc, response);
    if (error) {
        Serial.printf("  [INVENTORY] JSON tại %s không hợp lệ: %s\r\n", path.c_str(), error.c_str());
        return false;
    }
    return true;
}

static bool publishInventoryForIndex(int index) {
    if (!cloud_isOnline() || index < 0 || index >= NUM_COMPARTMENTS) return false;
    MedicationCompartment* compartments = schedule_getCompartments();

    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(4000);
    HTTPClient http;
    String url = buildFirebaseUrl(String("/inventory/compartments/") + compartments[index].compartmentId);
    if (!http.begin(client, url)) return false;
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<192> doc;
    doc["currentStock"] = inventoryState.stocks[index];
    doc["revision"] = inventoryState.revisions[index];
    doc["lastCommandId"] = inventoryState.lastAppliedCommandId;
    JsonObject timestamp = doc["updatedAt"].to<JsonObject>();
    timestamp[".sv"] = "timestamp";
    String payload;
    serializeJson(doc, payload);

    int httpCode = http.PATCH(payload);
    bool success = (httpCode == 200 || httpCode == 204);
    http.end();
    if (success) {
        uint8_t previousDirtyMask = inventoryState.dirtyMask;
        inventoryState.dirtyMask &= (uint8_t)~(1U << index);
        if (!saveInventoryNvs()) inventoryState.dirtyMask = previousDirtyMask;
    } else {
        Serial.printf("  [INVENTORY] Ghi tồn kho ngăn %s thất bại (HTTP %d).\r\n",
                      compartments[index].compartmentId, httpCode);
    }
    return success;
}

static bool writeInventoryCommandStatus(const char* compartmentId, const char* commandId,
                                        const char* status, int targetStock, int appliedStock,
                                        uint32_t revision, const char* message) {
    if (!cloud_isOnline() || !compartmentId || !commandId || !status) return false;

    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(4000);
    HTTPClient http;
    String url = buildFirebaseUrl(String("/inventoryCommands/status/") + compartmentId);
    if (!http.begin(client, url)) return false;
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<384> doc;
    doc["commandId"] = commandId;
    doc["compartmentId"] = compartmentId;
    doc["state"] = status;
    doc["targetStock"] = targetStock;
    if (appliedStock >= 0) doc["appliedStock"] = appliedStock;
    doc["revision"] = revision;
    doc["message"] = message ? message : "";
    JsonObject timestamp = doc["updatedAt"].to<JsonObject>();
    timestamp[".sv"] = "timestamp";
    String payload;
    serializeJson(doc, payload);

    int httpCode = http.PATCH(payload);
    http.end();
    return httpCode == 200 || httpCode == 204;
}

static bool deletePendingInventoryCommand(const char* commandId) {
    if (!cloud_isOnline() || !commandId) return false;
    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(4000);
    HTTPClient http;
    String url = buildFirebaseUrl(String("/inventoryCommands/pending/") + commandId);
    if (!http.begin(client, url)) return false;
    int httpCode = http.sendRequest("DELETE");
    http.end();
    return httpCode == 200 || httpCode == 204;
}

static bool bootstrapInventoryFromFirebase() {
    if (!cloud_isOnline()) return false;
    if (inventoryState.initialized) return true;

    DynamicJsonDocument inventoryDoc(1536);
    DynamicJsonDocument legacyConfigDoc(1536);
    if (!readFirebaseJson("/inventory/compartments", inventoryDoc) ||
        !readFirebaseJson("/config/compartments", legacyConfigDoc)) {
        return false;
    }

    JsonObject inventoryRoot = inventoryDoc.as<JsonObject>();
    JsonObject legacyRoot = legacyConfigDoc.as<JsonObject>();
    MedicationCompartment* compartments = schedule_getCompartments();
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        const char* id = compartments[i].compartmentId;
        const uint8_t bit = (uint8_t)(1U << i);
        bool remoteFound = false;
        int remoteStock = -1;
        if (!inventoryRoot.isNull()) {
            JsonObject item = inventoryRoot[id].as<JsonObject>();
            if (!item.isNull() && item["currentStock"].is<int>()) {
                int value = item["currentStock"].as<int>();
                if (value >= 0 && value <= MAX_COMPARTMENT_STOCK) {
                    remoteFound = true;
                    remoteStock = value;
                }
            }
        }

        bool legacyFound = false;
        int legacyStock = -1;
        if (!legacyRoot.isNull()) {
            JsonObject item = legacyRoot[id].as<JsonObject>();
            if (!item.isNull() && item["currentStock"].is<int>()) {
                int value = item["currentStock"].as<int>();
                if (value >= 0 && value <= MAX_COMPARTMENT_STOCK) {
                    legacyFound = true;
                    legacyStock = value;
                }
            }
        }

        if (!(inventoryState.dirtyMask & bit)) {
            if (remoteFound) {
                inventoryState.stocks[i] = (uint8_t)remoteStock;
                JsonObject item = inventoryRoot[id].as<JsonObject>();
                uint32_t revision = item["revision"] | 0U;
                inventoryState.revisions[i] = revision;
            } else if (legacyFound) {
                inventoryState.stocks[i] = (uint8_t)legacyStock;
                inventoryState.dirtyMask |= bit; // Ghi bản dữ liệu cũ sang đường dẫn mới.
            } else {
                inventoryState.stocks[i] = compartments[i].currentStock;
                inventoryState.dirtyMask |= bit;
            }
        }
        compartments[i].currentStock = inventoryState.stocks[i];
    }

    inventoryState.initialized = 1;
    if (!saveInventoryNvs()) {
        // Tiếp tục trong RAM; nếu mất điện sẽ lặp lại bước bootstrap an toàn.
    }
    Serial.println("  [INVENTORY] Đã nạp tồn kho từ Firebase hoặc chuyển dữ liệu cũ sang /inventory.");
    return true;
}

void cloud_stockChanged(const char* compartmentId, uint8_t currentStock) {
    int index = compartmentIndexFromId(compartmentId);
    if (index < 0 || currentStock > MAX_COMPARTMENT_STOCK) return;

    if (!inventoryNvsLoaded) restoreInventoryFromNvs();
    if (inventoryState.stocks[index] == currentStock) return;

    inventoryState.stocks[index] = currentStock;
    inventoryState.revisions[index]++;
    inventoryState.dirtyMask |= (uint8_t)(1U << index);
    saveInventoryNvs();
    Serial.printf("  [INVENTORY] Ngăn %s đổi tồn kho thành %u; đã xếp lịch đồng bộ Firebase.\r\n",
                  compartmentId, (unsigned int)currentStock);
}

static bool copyConfigString(char* destination, size_t destinationSize, const char* value) {
    if (!destination || !value || destinationSize == 0) return false;
    size_t length = strlen(value);
    if (length == 0 || length >= destinationSize) return false;
    memcpy(destination, value, length + 1);
    return true;
}

static bool parseScheduleTime(const char* value, uint8_t &hour, uint8_t &minute) {
    if (!value || strlen(value) != 5 || value[2] != ':') return false;
    if (!isdigit((unsigned char)value[0]) || !isdigit((unsigned char)value[1]) ||
        !isdigit((unsigned char)value[3]) || !isdigit((unsigned char)value[4])) {
        return false;
    }

    int parsedHour = (value[0] - '0') * 10 + (value[1] - '0');
    int parsedMinute = (value[3] - '0') * 10 + (value[4] - '0');
    if (parsedHour > 23 || parsedMinute > 59) return false;

    hour = (uint8_t)parsedHour;
    minute = (uint8_t)parsedMinute;
    return true;
}

bool cloud_fetchCompartmentConfig(MedicationCompartment* outList, int maxCount) {
    if (!cloud_isOnline() || outList == NULL || maxCount < NUM_COMPARTMENTS) return false;

    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(4000);

    HTTPClient http;
    String url = buildFirebaseUrl("/config/compartments");

    if (!http.begin(client, url)) return false;

    int httpCode = http.GET();
    if (httpCode != 200) {
        Serial.printf("  [CLOUD SYNC] Đọc /config/compartments thất bại (HTTP %d).\r\n", httpCode);
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
    if (root.isNull()) {
        Serial.println("  [CLOUD SYNC] Cấu hình Firebase không phải object; giữ cấu hình hiện tại.");
        return false;
    }

    MedicationCompartment staged[NUM_COMPARTMENTS] = {};
    uint8_t seenMask = 0;

    for (JsonPair kv : root) {
        JsonObject obj = kv.value().as<JsonObject>();
        if (obj.isNull()) {
            Serial.println("  [CLOUD SYNC] Có mục cấu hình không hợp lệ; giữ cấu hình hiện tại.");
            return false;
        }

        const char* databaseKey = kv.key().c_str();
        const char* compId = obj["compartmentId"] | databaseKey;
        int index = compartmentIndexFromId(compId);
        if (index < 0 || strcmp(databaseKey, compId) != 0 || (seenMask & (1U << index))) {
            Serial.println("  [CLOUD SYNC] ID ngăn phải là A/B/C và khớp key Firebase; giữ cấu hình hiện tại.");
            return false;
        }

        const char* code = obj["medicineCode"] | "";
        const char* name = obj["displayName"] | "";
        const char* sched = obj["schedule"] | "";
        int units = obj["unitsPerDose"] | 0;
        JsonVariant loadedValue = obj["isLoaded"];
        uint8_t hour = 0;
        uint8_t minute = 0;

        if (units < 1 || units > 10 || !loadedValue.is<bool>() ||
            !parseScheduleTime(sched, hour, minute) ||
            !copyConfigString(staged[index].compartmentId, sizeof(staged[index].compartmentId), compId) ||
            !copyConfigString(staged[index].medicineCode, sizeof(staged[index].medicineCode), code) ||
            !copyConfigString(staged[index].displayName, sizeof(staged[index].displayName), name)) {
            Serial.printf("  [CLOUD SYNC] Cấu hình ngăn %s thiếu trường hoặc ngoài giới hạn; giữ cấu hình hiện tại.\r\n", compId);
            return false;
        }

        staged[index].unitsPerDose = (uint8_t)units;
        staged[index].scheduleHour = hour;
        staged[index].scheduleMinute = minute;
        staged[index].isLoaded = loadedValue.as<bool>();
        seenMask |= (uint8_t)(1U << index);
    }

    const uint8_t allCompartmentsMask = (uint8_t)((1U << NUM_COMPARTMENTS) - 1U);
    if (seenMask != allCompartmentsMask) {
        Serial.println("  [CLOUD SYNC] Thiếu cấu hình một hoặc nhiều ngăn A/B/C; giữ cấu hình hiện tại.");
        return false;
    }

    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        outList[i] = staged[i];
    }

    Serial.printf("  [CLOUD SYNC] Đã tải cấu hình %d ngăn hợp lệ từ Firebase.\r\n", NUM_COMPARTMENTS);
    return true;
}

static bool syncRemoteCompartmentConfig() {
    if (!cloud_isOnline()) return false;
    if (fsm_getState() != STATE_IDLE) {
        Serial.println("  [CLOUD SYNC] Đang có phiên thuốc; hoãn áp dụng cấu hình mới đến khi thiết bị rảnh.");
        return false;
    }

    MedicationCompartment remote[NUM_COMPARTMENTS] = {};
    if (!cloud_fetchCompartmentConfig(remote, NUM_COMPARTMENTS)) return false;

    MedicationCompartment merged[NUM_COMPARTMENTS] = {};
    bool configChanged = !hasAppliedRemoteConfig;
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        MedicationCompartment* current = schedule_getCompartmentById(remote[i].compartmentId);
        if (!current) {
            Serial.printf("  [CLOUD SYNC] Không tìm thấy ngăn %s trong firmware; không áp dụng cấu hình.\r\n",
                          remote[i].compartmentId);
            return false;
        }

        merged[i] = remote[i];
        // Tồn kho được đồng bộ riêng; không lấy trường currentStock cũ từ payload cấu hình.
        merged[i].currentStock = current->currentStock;

        if (strcmp(current->medicineCode, merged[i].medicineCode) != 0 ||
            strcmp(current->displayName, merged[i].displayName) != 0 ||
            current->unitsPerDose != merged[i].unitsPerDose ||
            current->scheduleHour != merged[i].scheduleHour ||
            current->scheduleMinute != merged[i].scheduleMinute ||
            current->isLoaded != merged[i].isLoaded) {
            configChanged = true;
        }
    }

    if (!configChanged) return true;

    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        if (!schedule_updateCompartment(merged[i])) {
            Serial.printf("  [CLOUD SYNC] Áp dụng cấu hình ngăn %s thất bại.\r\n", merged[i].compartmentId);
            return false;
        }
        Serial.printf("  [CLOUD SYNC] Ngăn %s: %02u:%02u, liều %u viên/lần, %s.\r\n",
                      merged[i].compartmentId,
                      (unsigned int)merged[i].scheduleHour,
                      (unsigned int)merged[i].scheduleMinute,
                      (unsigned int)merged[i].unitsPerDose,
                      merged[i].isLoaded ? "đã nạp" : "chưa nạp");
    }

    hasAppliedRemoteConfig = true;
    Serial.println("  [CLOUD SYNC] Cấu hình Firebase đã được áp dụng cho firmware.");
    if (saveCompartmentConfigToNvs()) {
        Serial.println("  [CLOUD SYNC] Da luu cau hinh lich moi nhat vao NVS de dung khi offline.");
    }
    return true;
}

static void syncDirtyInventory() {
    if (!cloud_isOnline() || !inventoryState.initialized) return;
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        if (inventoryState.dirtyMask & (uint8_t)(1U << i)) {
            publishInventoryForIndex(i);
        }
    }
}

static bool processNextInventoryCommand() {
    if (!cloud_isOnline() || fsm_getState() != STATE_IDLE || !inventoryState.initialized) return false;

    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(4000);
    HTTPClient http;
    String url = buildFirebaseUrl("/inventoryCommands/pending");
    url += "&orderBy=%22%24key%22&limitToFirst=1";
    if (!http.begin(client, url)) return false;
    int httpCode = http.GET();
    if (httpCode != 200) {
        Serial.printf("  [INVENTORY] Đọc lệnh tồn kho thất bại (HTTP %d).\r\n", httpCode);
        http.end();
        return false;
    }
    String response = http.getString();
    http.end();

    DynamicJsonDocument doc(768);
    DeserializationError error = deserializeJson(doc, response);
    if (error) {
        Serial.printf("  [INVENTORY] JSON lệnh tồn kho không hợp lệ: %s\r\n", error.c_str());
        return false;
    }

    JsonObject root = doc.as<JsonObject>();
    if (root.isNull()) return true;

    char commandId[LAST_COMMAND_ID_SIZE] = {};
    char compartmentId[4] = {};
    int targetStock = -1;
    bool found = false;
    for (JsonPair entry : root) {
        const char* key = entry.key().c_str();
        JsonObject command = entry.value().as<JsonObject>();
        if (strlen(key) < sizeof(commandId)) {
            memcpy(commandId, key, strlen(key) + 1);
            if (!command.isNull()) {
                const char* id = command["compartmentId"] | "";
                if (strlen(id) < sizeof(compartmentId)) memcpy(compartmentId, id, strlen(id) + 1);
                if (command["targetStock"].is<int>()) targetStock = command["targetStock"].as<int>();
            }
            found = true;
        }
        break; // Query chỉ trả về lệnh cũ nhất.
    }
    if (!found) return true;

    int index = compartmentIndexFromId(compartmentId);
    if (index < 0 || targetStock < 0 || targetStock > MAX_COMPARTMENT_STOCK) {
        Serial.printf("  [INVENTORY] Từ chối lệnh %s: ngăn hoặc số tồn kho không hợp lệ.\r\n", commandId);
        if (index >= 0) {
            if (!writeInventoryCommandStatus(compartmentId, commandId, "rejected", targetStock,
                                             -1, 0, "Ngăn hoặc số tồn kho không hợp lệ.")) return false;
        } else if (!writeInventoryCommandStatus("unknown", commandId, "rejected", targetStock,
                                                -1, 0, "Mã ngăn không hợp lệ.")) {
            return false;
        }
        return deletePendingInventoryCommand(commandId);
    }

    const uint8_t bit = (uint8_t)(1U << index);
    if (strcmp(inventoryState.lastAppliedCommandId, commandId) == 0) {
        // Lệnh đã áp dụng nhưng có thể lần trước đã mất kết nối trước khi Firebase nhận ACK.
        if (inventoryState.dirtyMask & bit) {
            if (!publishInventoryForIndex(index) || (inventoryState.dirtyMask & bit)) return false;
        }
        bool statusOk = writeInventoryCommandStatus(compartmentId, commandId, "applied", targetStock,
                                                    inventoryState.stocks[index], inventoryState.revisions[index],
                                                    "ESP32 đã áp dụng số tồn kho.");
        if (!statusOk) return false;
        return deletePendingInventoryCommand(commandId);
    }

    writeInventoryCommandStatus(compartmentId, commandId, "applying", targetStock,
                                inventoryState.stocks[index], inventoryState.revisions[index],
                                "ESP32 đang áp dụng yêu cầu.");

    InventoryNvsState previousState = inventoryState;
    inventoryState.stocks[index] = (uint8_t)targetStock;
    inventoryState.revisions[index]++;
    inventoryState.dirtyMask |= bit;
    memcpy(inventoryState.lastAppliedCommandId, commandId, strlen(commandId) + 1);
    MedicationCompartment* compartment = schedule_getCompartmentById(compartmentId);
    if (compartment) compartment->currentStock = (uint8_t)targetStock;

    // Chỉ xác nhận áp dụng sau khi tồn kho và mã lệnh đã được ghi bền vững vào NVS.
    if (!saveInventoryNvs()) {
        inventoryState = previousState;
        if (compartment) compartment->currentStock = previousState.stocks[index];
        writeInventoryCommandStatus(compartmentId, commandId, "pending", targetStock,
                                    previousState.stocks[index], previousState.revisions[index],
                                    "Chưa lưu được vào bộ nhớ thiết bị; sẽ thử lại.");
        return false;
    }

    Serial.printf("  [INVENTORY] Áp dụng lệnh %s: ngăn %s đặt thành %d viên.\r\n",
                  commandId, compartmentId, targetStock);
    if (!publishInventoryForIndex(index) || (inventoryState.dirtyMask & bit)) {
        writeInventoryCommandStatus(compartmentId, commandId, "pending", targetStock,
                                    inventoryState.stocks[index], inventoryState.revisions[index],
                                    "Đã lưu trên ESP32; đang chờ Firebase xác nhận.");
        return false;
    }

    if (!writeInventoryCommandStatus(compartmentId, commandId, "applied", targetStock,
                                      inventoryState.stocks[index], inventoryState.revisions[index],
                                      "ESP32 đã áp dụng số tồn kho.")) return false;
    return deletePendingInventoryCommand(commandId);
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

    bool onlineNow = cloud_isOnline();
    if (!onlineNow) {
        wasWifiOnline = false;
    } else {
        if (!wasWifiOnline) {
            wasWifiOnline = true;
            configSyncRequested = true;
            Serial.println("  [CLOUD SYNC] Wi-Fi đã kết nối lại; yêu cầu tải cấu hình Firebase.");
        }

        if (fsm_getState() == STATE_IDLE &&
            (configSyncRequested || now - lastConfigPollMillis >= CONFIG_POLL_INTERVAL_MS)) {
            configSyncRequested = false;
            lastConfigPollMillis = now;
            syncRemoteCompartmentConfig();
        }

        if (fsm_getState() == STATE_IDLE && !inventoryState.initialized &&
            now - lastInventoryBootstrapMillis >= INVENTORY_BOOTSTRAP_INTERVAL_MS) {
            lastInventoryBootstrapMillis = now;
            bootstrapInventoryFromFirebase();
        }

        if (fsm_getState() == STATE_IDLE && inventoryState.initialized &&
            now - lastCommandPollMillis >= COMMAND_POLL_INTERVAL_MS) {
            lastCommandPollMillis = now;
            processNextInventoryCommand();
        }

        if (inventoryState.dirtyMask && now - lastInventorySyncMillis >= INVENTORY_SYNC_INTERVAL_MS) {
            lastInventorySyncMillis = now;
            syncDirtyInventory();
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
