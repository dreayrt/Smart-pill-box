#include "state_machine.h"
#include "hardware_interface.h"
#include "sync_interface.h"
#include "time_service.h"
#include "mqtt_sync.h"
#include "Preferences.h"
#include "WiFi.h"
#include "FirebaseMock.h"
#include "esp_sntp.h"
#include <ArduinoJson.h>

#include <cstdio>
#include <cstring>
#include <string>
#include <cmath>

TestSerialPort Serial;
unsigned long fakeMillis = 0;
unsigned long millis() { return fakeMillis; }
void delay(unsigned long milliseconds) { fakeMillis += milliseconds; }

static bool rtcAvailable = false;
static uint32_t rtcUnixTime = 0;
static int rtcWriteCount = 0;
static int ntpRequestCount = 0;
static std::string configuredTimezone;
static sntp_sync_callback_t ntpCallback = nullptr;
static time_t fakeUnixTime = 0;
static float sensorTemperature = 22.0f;
static float sensorHumidity = 50.0f;

extern void cloud_resetForTest();
extern void time_service_resetForTest();

time_t host_time(time_t* output) {
    if (output) *output = fakeUnixTime;
    return fakeUnixTime;
}
int host_settimeofday(const timeval* value, const void*) {
    if (!value) return -1;
    fakeUnixTime = (time_t)value->tv_sec;
    return 0;
}
tm* host_localtime_r(const time_t* value, tm* output) {
    if (!value || !output) return nullptr;
    time_t local = *value + 7 * 60 * 60;
    return gmtime_s(output, &local) == 0 ? output : nullptr;
}
int host_setenv(const char* name, const char* value, int) {
    if (name && std::strcmp(name, "TZ") == 0) configuredTimezone = value ? value : "";
    return 0;
}
void host_tzset() {}

void sntp_set_time_sync_notification_cb(sntp_sync_callback_t callback) { ntpCallback = callback; }
void configTzTime(const char* timezone, const char*, const char*, const char*) {
    configuredTimezone = timezone ? timezone : "";
    ntpRequestCount++;
}

static void signalNtpSuccess(uint32_t unixTime) {
    fakeUnixTime = (time_t)unixTime;
    if (ntpCallback) ntpCallback(nullptr);
}

void hw_initAll() {}
ButtonEvent hw_getButtonEvent() { return BTN_NONE; }
void hw_setServoLock(bool) {}
void hw_setAlarmReminder(bool) {}
void hw_setAlarmError(bool) {}
void hw_displayIdle(int, int, int, bool, const char*, float, float) {}
void hw_displayReminder(const char*, const char*, int) {}
void hw_displayVerifying(int, int) {}
void hw_displayResult(bool, const char*) {}
void hw_displayCompartmentInfo(const char*, const char*, int, int, int) {}
void hw_displayLoadResult(const char*, int, int) {}
void hw_getEnvData(float& temperature, float& humidity) { temperature = sensorTemperature; humidity = sensorHumidity; }
bool hw_readRTCUnixTime(uint32_t& output) {
    if (!rtcAvailable) return false;
    output = rtcUnixTime;
    return true;
}
bool hw_setRTCUnixTime(uint32_t value) {
    rtcUnixTime = value;
    rtcAvailable = true;
    rtcWriteCount++;
    return true;
}
void hw_update() {}
void hw_runSelfTest() {}

static int passed = 0;
static int failed = 0;
static void check(bool condition, const char* expression, const char* test, int line) {
    if (condition) { passed++; return; }
    failed++;
    std::printf("FAIL [%s:%d] %s\n", test, line, expression);
}
#define CHECK(test_name, condition) check((condition), #condition, (test_name), __LINE__)

static void resetWorld(bool online) {
    Preferences::clearAll();
    FakeFirebase::clear();
    WiFi.setStatus(online ? WL_CONNECTED : 0);
    fakeMillis = 0;
    fakeUnixTime = 0;
    rtcAvailable = false;
    rtcUnixTime = 0;
    rtcWriteCount = 0;
    ntpRequestCount = 0;
    configuredTimezone.clear();
    ntpCallback = nullptr;
    sensorTemperature = 22.0f;
    sensorHumidity = 50.0f;
    cloud_resetForTest();
    time_service_resetForTest();
    fsm_init();
}

static std::string validConfig(int doseA = 2) {
    return std::string("{\"A\":{\"compartmentId\":\"A\",\"medicineCode\":\"MED-A\",\"displayName\":\"Medicine A\",\"unitsPerDose\":") +
        std::to_string(doseA) +
        ",\"schedule\":\"08:00\",\"isLoaded\":true},"
        "\"B\":{\"compartmentId\":\"B\",\"medicineCode\":\"MED-B\",\"displayName\":\"Medicine B\",\"unitsPerDose\":1,\"schedule\":\"12:00\",\"isLoaded\":true},"
        "\"C\":{\"compartmentId\":\"C\",\"medicineCode\":\"MED-C\",\"displayName\":\"Medicine C\",\"unitsPerDose\":1,\"schedule\":\"20:00\",\"isLoaded\":true}}";
}

static std::string validInventory(int stockA = 40) {
    return std::string("{\"A\":{\"currentStock\":") + std::to_string(stockA) +
        ",\"revision\":1},\"B\":{\"currentStock\":20,\"revision\":1},"
        "\"C\":{\"currentStock\":30,\"revision\":1}}";
}

static void seedFirebase(int doseA = 2, int stockA = 40) {
    FakeFirebase::set("/config/compartments", validConfig(doseA));
    FakeFirebase::set("/inventory/compartments", validInventory(stockA));
}

static const FakeFirebase::Write* lastWrite(const std::string& method, const std::string& path) {
    return FakeFirebase::lastWrite(method, path);
}

static const FakeFirebase::Write* eventWriteWithStatus(const char* status) {
    for (auto it = FakeFirebase::writes.rbegin(); it != FakeFirebase::writes.rend(); ++it) {
        if (it->method != "PUT" || it->path.find("/events/") != 0) continue;
        DynamicJsonDocument doc(512);
        if (deserializeJson(doc, it->payload)) continue;
        if (std::strcmp(doc["status"].as<const char*>(), status) == 0) return &*it;
    }
    return nullptr;
}

static void startOnlineCloud(int doseA = 2, int stockA = 40) {
    resetWorld(true);
    seedFirebase(doseA, stockA);
    cloud_init();
}

static void tick(ButtonEvent button, uint8_t hour, uint8_t minute, uint32_t unixTime, unsigned long now) {
    fakeMillis = now;
    fsm_update(button, hour, minute, 20261019, unixTime, true, now);
}

static void testT01RtcThenNtpUsesIctAndUpdatesRtc() {
    const char* name = "T01 RTC then successful NTP updates ICT clock and RTC";
    resetWorld(true);
    rtcAvailable = true;
    rtcUnixTime = 1792371600UL;
    time_service_init();

    TimeSnapshot snapshot = {};
    CHECK(name, time_service_getSnapshot(snapshot));
    CHECK(name, snapshot.source == TIME_SOURCE_RTC);
    CHECK(name, configuredTimezone == "ICT-7");
    CHECK(name, ntpRequestCount == 1);

    const uint32_t ntpUnix = 1792375200UL;
    signalNtpSuccess(ntpUnix);
    time_service_loop();
    CHECK(name, time_service_getSnapshot(snapshot));
    CHECK(name, snapshot.source == TIME_SOURCE_NTP);
    CHECK(name, snapshot.unixTime == ntpUnix);
    CHECK(name, rtcUnixTime == ntpUnix && rtcWriteCount == 1);
    CHECK(name, std::strcmp(time_service_sourceName(snapshot.source), "NTP") == 0);
}

static void testT02InvalidRtcAndNtpNeverTriggersDefaultSchedule() {
    const char* name = "T02 invalid RTC/NTP keeps default schedule disabled";
    resetWorld(false);
    cloud_init();
    time_service_init();
    TimeSnapshot snapshot = {};
    CHECK(name, !time_service_getSnapshot(snapshot));

    WiFi.setStatus(WL_CONNECTED);
    fakeMillis = 100;
    time_service_loop();
    CHECK(name, ntpRequestCount == 1);
    fakeMillis = 10099;
    time_service_loop();
    CHECK(name, ntpRequestCount == 1);
    fakeMillis = 10100;
    time_service_loop();
    CHECK(name, ntpRequestCount == 2);
    CHECK(name, !time_service_getSnapshot(snapshot));

    uint32_t dateKey = cloud_hasScheduleConfig() && snapshot.valid ? snapshot.dateKey : 0;
    fsm_update(BTN_NONE, 8, 0, dateKey, 0, snapshot.valid, fakeMillis);
    CHECK(name, fsm_getState() == STATE_IDLE);
    CHECK(name, !cloud_hasScheduleConfig());
}

static void testT03CachedScheduleAndRtcWorkOfflineAfterRestart() {
    const char* name = "T03 cached schedule and RTC restore offline after restart";
    resetWorld(true);
    seedFirebase(2, 42);
    rtcAvailable = true;
    rtcUnixTime = 1792371600UL;
    cloud_init();
    time_service_init();
    CHECK(name, cloud_hasScheduleConfig());

    WiFi.setStatus(0);
    cloud_resetForTest();
    time_service_resetForTest();
    fsm_init();
    cloud_init();
    time_service_init();

    TimeSnapshot snapshot = {};
    CHECK(name, time_service_getSnapshot(snapshot));
    CHECK(name, snapshot.source == TIME_SOURCE_RTC);
    CHECK(name, cloud_hasScheduleConfig());
    CHECK(name, schedule_getCompartmentById("A")->unitsPerDose == 2);
    CHECK(name, schedule_getCompartmentById("A")->currentStock == 42);

    const uint32_t dateKey = 20261019;
    fsm_update(BTN_NONE, 8, 0, dateKey, (uint32_t)snapshot.unixTime, true, fakeMillis);
    CHECK(name, fsm_getState() == STATE_REMINDER);
    CHECK(name, fsm_getActiveCompartment() != nullptr);
    CHECK(name, std::strcmp(fsm_getActiveCompartment()->compartmentId, "A") == 0);
}

static void testT04NoOfflineCacheDoesNotUseSampleSchedule() {
    const char* name = "T04 missing offline cache does not use sample schedule";
    resetWorld(false);
    cloud_init();
    time_service_init();
    TimeSnapshot snapshot = {};
    const bool timeValid = time_service_getSnapshot(snapshot);
    const uint32_t dateKey = timeValid && cloud_hasScheduleConfig() ? snapshot.dateKey : 0;
    fsm_update(BTN_NONE, 8, 0, dateKey, 0, timeValid, fakeMillis);
    CHECK(name, !cloud_hasScheduleConfig());
    CHECK(name, !timeValid);
    CHECK(name, fsm_getState() == STATE_IDLE);
    CHECK(name, fsm_getActiveCompartment() == nullptr);
}

static void testT05CorrectDoseWritesCloudEventAndStockOnce() {
    const char* name = "T05 correct dose posts success and decrements inventory once";
    startOnlineCloud(2, 40);
    tick(BTN_NONE, 8, 0, 1792375200UL, 1000);
    tick(BTN_TAKE_PRESSED, 8, 0, 1792375200UL, 1100);
    tick(BTN_REMOVE_PRESSED, 8, 0, 1792375200UL, 1200);
    tick(BTN_REMOVE_PRESSED, 8, 0, 1792375200UL, 1300);
    CHECK(name, fsm_getState() == STATE_VERIFIED);
    tick(BTN_NONE, 8, 0, 1792375200UL, 9299);
    CHECK(name, fsm_getState() == STATE_VERIFIED);
    tick(BTN_NONE, 8, 0, 1792375200UL, 9300);
    CHECK(name, fsm_getState() == STATE_CLOSED);
    CHECK(name, schedule_getCompartmentById("A")->currentStock == 38);
    CHECK(name, eventWriteWithStatus("VERIFIED_BY_SIMULATION") != nullptr);
    cloud_loop();
    const FakeFirebase::Write* stock = lastWrite("PATCH", "/inventory/compartments/A");
    CHECK(name, stock != nullptr);
    if (stock) {
        DynamicJsonDocument doc(256);
        CHECK(name, !deserializeJson(doc, stock->payload));
        CHECK(name, doc["currentStock"].as<int>() == 38);
    }
}

static void testT06NoRemovalAndPartialRemovalWriteExpectedFailures() {
    const char* name = "T06 zero and partial removal write correct failure events";
    startOnlineCloud(2, 40);
    tick(BTN_NONE, 8, 0, 1792375200UL, 1000);
    tick(BTN_TAKE_PRESSED, 8, 0, 1792375200UL, 1100);
    tick(BTN_NONE, 8, 0, 1792375200UL, 61100);
    tick(BTN_NONE, 8, 0, 1792375200UL, 61110);
    CHECK(name, fsm_getState() == STATE_ERROR);
    CHECK(name, schedule_getCompartmentById("A")->currentStock == 40);
    CHECK(name, eventWriteWithStatus("NO_DETECTION") != nullptr);
    int noDetectionCount = 0;
    for (const auto& write : FakeFirebase::writes) {
        if (write.method == "PUT" && write.path.find("/events/") == 0 && write.payload.find("NO_DETECTION") != std::string::npos) noDetectionCount++;
    }
    CHECK(name, noDetectionCount == 1);

    startOnlineCloud(2, 40);
    tick(BTN_NONE, 8, 0, 1792375200UL, 1000);
    tick(BTN_TAKE_PRESSED, 8, 0, 1792375200UL, 1100);
    tick(BTN_REMOVE_PRESSED, 8, 0, 1792375200UL, 1200);
    tick(BTN_NONE, 8, 0, 1792375200UL, 61100);
    tick(BTN_NONE, 8, 0, 1792375200UL, 61110);
    CHECK(name, fsm_getState() == STATE_ERROR);
    CHECK(name, schedule_getCompartmentById("A")->currentStock == 40);
    const FakeFirebase::Write* less = eventWriteWithStatus("MISMATCH_LESS");
    CHECK(name, less != nullptr);
    if (less) {
        DynamicJsonDocument doc(512);
        CHECK(name, !deserializeJson(doc, less->payload));
        CHECK(name, doc["expectedUnits"].as<int>() == 2);
        CHECK(name, doc["detectedUnits"].as<int>() == 1);
    }
}

static void testT07OverdoseWritesOneMismatchMoreAndKeepsStock() {
    const char* name = "T07 overdose writes mismatch more and keeps stock";
    startOnlineCloud(2, 40);
    tick(BTN_NONE, 12, 0, 1792389600UL, 1000);
    tick(BTN_TAKE_PRESSED, 12, 0, 1792389600UL, 1100);
    tick(BTN_REMOVE_PRESSED, 12, 0, 1792389600UL, 1200);
    tick(BTN_REMOVE_PRESSED, 12, 0, 1792389600UL, 1300);
    tick(BTN_NONE, 12, 0, 1792389600UL, 1310);
    CHECK(name, fsm_getState() == STATE_ERROR);
    CHECK(name, schedule_getCompartmentById("B")->currentStock == 20);
    const FakeFirebase::Write* more = eventWriteWithStatus("MISMATCH_MORE");
    CHECK(name, more != nullptr);
    int eventCount = 0;
    for (const auto& write : FakeFirebase::writes) {
        if (write.method == "PUT" && write.path.find("/events/") == 0) eventCount++;
    }
    CHECK(name, eventCount == 1);
}

static void testT08SnoozeRealertsThenWritesSingleMissedEvent() {
    const char* name = "T08 snooze realerts and reports missed dose after ten minutes";
    startOnlineCloud(2, 40);
    tick(BTN_NONE, 8, 0, 1792375200UL, 1000);
    tick(BTN_SNOOZE_PRESSED, 8, 0, 1792375200UL, 2000);
    tick(BTN_NONE, 8, 0, 1792375200UL, 301999);
    CHECK(name, fsm_getState() == STATE_SNOOZED);
    tick(BTN_NONE, 8, 0, 1792375200UL, 302000);
    CHECK(name, fsm_getState() == STATE_REMINDER);
    tick(BTN_NONE, 8, 0, 1792375200UL, 601999);
    CHECK(name, fsm_getState() == STATE_REMINDER);
    tick(BTN_NONE, 8, 0, 1792375200UL, 901999);
    CHECK(name, fsm_getState() == STATE_REMINDER);
    tick(BTN_NONE, 8, 0, 1792375200UL, 902000);
    CHECK(name, fsm_getState() == STATE_ERROR);
    const FakeFirebase::Write* missed = eventWriteWithStatus("MISSED_DOSE");
    CHECK(name, missed != nullptr);
    if (missed) {
        DynamicJsonDocument doc(512);
        CHECK(name, !deserializeJson(doc, missed->payload));
        CHECK(name, !doc["userConfirmed"].as<bool>());
    }
    tick(BTN_NONE, 8, 0, 1792375200UL, 902010);
    int eventCount = 0;
    for (const auto& write : FakeFirebase::writes) {
        if (write.method == "PUT" && write.path.find("/events/") == 0) eventCount++;
    }
    CHECK(name, eventCount == 1);
}

static void testT09RemoteDoseUpdateAppliesAndFlowsThroughVerification() {
    const char* name = "T09 remote dose update applies atomically and controls dose";
    resetWorld(true);
    seedFirebase(2, 40);
    cloud_init();
    CHECK(name, schedule_getCompartmentById("A")->unitsPerDose == 2);

    FakeFirebase::set("/config/compartments", validConfig(3));
    fakeMillis = 15000;
    cloud_loop();
    CHECK(name, schedule_getCompartmentById("A")->unitsPerDose == 3);
    CHECK(name, cloud_hasScheduleConfig());

    fsm_update(BTN_NONE, 8, 0, 20261019, 1792375200UL, true, 15001);
    fsm_update(BTN_TAKE_PRESSED, 8, 0, 20261019, 1792375200UL, true, 15002);
    fsm_update(BTN_REMOVE_PRESSED, 8, 0, 20261019, 1792375200UL, true, 15003);
    fsm_update(BTN_REMOVE_PRESSED, 8, 0, 20261019, 1792375200UL, true, 15004);
    fsm_update(BTN_REMOVE_PRESSED, 8, 0, 20261019, 1792375200UL, true, 15005);
    CHECK(name, fsm_getState() == STATE_VERIFIED);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792375200UL, true, 23005);
    CHECK(name, fsm_getState() == STATE_CLOSED);
    CHECK(name, schedule_getCompartmentById("A")->currentStock == 37);
    const FakeFirebase::Write* event = nullptr;
    for (const auto& write : FakeFirebase::writes) {
        if (write.method == "PUT" && write.path.find("/events/") == 0) event = &write;
    }
    CHECK(name, event != nullptr);
    if (event) {
        DynamicJsonDocument doc(512);
        CHECK(name, !deserializeJson(doc, event->payload));
        CHECK(name, doc["expectedUnits"].as<int>() == 3);
        CHECK(name, doc["detectedUnits"].as<int>() == 3);
        CHECK(name, std::strcmp(doc["status"].as<const char*>(), "VERIFIED_BY_SIMULATION") == 0);
    }
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792375200UL, true, 23006);
    fakeMillis = 23006;
    cloud_loop();
    const FakeFirebase::Write* stock = lastWrite("PATCH", "/inventory/compartments/A");
    CHECK(name, stock != nullptr);
    if (stock) {
        DynamicJsonDocument doc(256);
        CHECK(name, !deserializeJson(doc, stock->payload));
        CHECK(name, doc["currentStock"].as<int>() == 37);
    }
}

static void testT10InvalidRemoteConfigKeepsLastGoodConfig() {
    const char* name = "T10 invalid remote config keeps last good config";
    resetWorld(true);
    seedFirebase(2, 40);
    cloud_init();
    CHECK(name, cloud_hasScheduleConfig());

    FakeFirebase::set("/config/compartments",
        "{\"A\":{\"compartmentId\":\"A\",\"medicineCode\":\"MED-A\",\"displayName\":\"A\",\"unitsPerDose\":3,\"schedule\":\"25:90\",\"isLoaded\":true},"
        "\"B\":{\"compartmentId\":\"B\",\"medicineCode\":\"MED-B\",\"displayName\":\"B\",\"unitsPerDose\":1,\"schedule\":\"12:00\",\"isLoaded\":true}}");
    fakeMillis = 15000;
    cloud_loop();
    CHECK(name, schedule_getCompartmentById("A")->unitsPerDose == 2);
    CHECK(name, schedule_getCompartmentById("A")->scheduleHour == 8);
    CHECK(name, cloud_hasScheduleConfig());
}

static void testT11InventoryCommandAppliesAndRejectsSafely() {
    const char* name = "T11 inventory command applies and invalid target is rejected";
    resetWorld(true);
    seedFirebase(2, 40);
    cloud_init();
    FakeFirebase::set("/inventoryCommands/pending", "{\"cmd-apply\":{\"compartmentId\":\"A\",\"targetStock\":45}}");
    fakeMillis = 3000;
    cloud_loop();
    CHECK(name, schedule_getCompartmentById("A")->currentStock == 45);
    CHECK(name, FakeFirebase::wrote("DELETE", "/inventoryCommands/pending/cmd-apply"));
    const FakeFirebase::Write* applied = lastWrite("PATCH", "/inventoryCommands/status/A");
    CHECK(name, applied != nullptr);
    if (applied) {
        DynamicJsonDocument doc(512);
        CHECK(name, !deserializeJson(doc, applied->payload));
        CHECK(name, std::strcmp(doc["state"].as<const char*>(), "applied") == 0);
        CHECK(name, doc["appliedStock"].as<int>() == 45);
    }

    FakeFirebase::set("/inventoryCommands/pending", "{\"cmd-reject\":{\"compartmentId\":\"A\",\"targetStock\":101}}");
    fakeMillis = 6000;
    cloud_loop();
    CHECK(name, schedule_getCompartmentById("A")->currentStock == 45);
    CHECK(name, FakeFirebase::wrote("DELETE", "/inventoryCommands/pending/cmd-reject"));
    const FakeFirebase::Write* rejected = lastWrite("PATCH", "/inventoryCommands/status/A");
    CHECK(name, rejected != nullptr);
    if (rejected) {
        DynamicJsonDocument doc(512);
        CHECK(name, !deserializeJson(doc, rejected->payload));
        CHECK(name, std::strcmp(doc["state"].as<const char*>(), "rejected") == 0);
    }
}

static void testT12OfflineEventAndInventorySurviveResetAndReconnect() {
    const char* name = "T12 offline event and stock persist through reboot and sync";
    resetWorld(false);
    cloud_init();

    VerificationEvent event = {};
    std::strcpy(event.compartmentId, "A");
    std::strcpy(event.medicineCode, "MED-A");
    std::strcpy(event.status, "MISMATCH_LESS");
    event.expectedUnits = 2;
    event.detectedUnits = 1;
    event.quantityMatch = false;
    schedule_getCompartmentById("A")->currentStock = 12;
    for (int i = 1; i <= 11; i++) {
        std::snprintf(event.eventId, sizeof(event.eventId), "EVT-OFFLINE-%02d", i);
        cloud_pushEvent(event);
    }
    cloud_stockChanged("A", 12);
    CHECK(name, FakeFirebase::writes.empty());

    // Simulate a power cycle: RAM state is reset while Preferences (NVS) remains.
    cloud_resetForTest();
    time_service_resetForTest();
    fsm_init();
    cloud_init();
    CHECK(name, schedule_getCompartmentById("A")->currentStock == 12);

    seedFirebase(2, 40);
    WiFi.setStatus(WL_CONNECTED);
    for (int i = 0; i < 10; i++) {
        fakeMillis = (unsigned long)(15000 + i);
        cloud_loop();
    }
    CHECK(name, !FakeFirebase::wrote("PUT", "/events/EVT-OFFLINE-01"));
    for (int i = 2; i <= 11; i++) {
        char eventId[48] = {};
        std::snprintf(eventId, sizeof(eventId), "EVT-OFFLINE-%02d", i);
        CHECK(name, FakeFirebase::wrote("PUT", std::string("/events/") + eventId));
    }
    const FakeFirebase::Write* stock = lastWrite("PATCH", "/inventory/compartments/A");
    CHECK(name, stock != nullptr);
    if (stock) {
        DynamicJsonDocument doc(256);
        CHECK(name, !deserializeJson(doc, stock->payload));
        CHECK(name, doc["currentStock"].as<int>() == 12);
    }

    WiFi.setStatus(0);
    cloud_resetForTest();
    fsm_init();
    cloud_init();
    CHECK(name, schedule_getCompartmentById("A")->currentStock == 12);
    WiFi.setStatus(WL_CONNECTED);
    fakeMillis = 20000;
    cloud_loop();
    int sentEvents = 0;
    for (const auto& write : FakeFirebase::writes) {
        if (write.method == "PUT" && write.path.find("/events/") == 0) sentEvents++;
    }
    CHECK(name, sentEvents == 10);
}

static int countWrites(const char* method, const char* pathPrefix) {
    int count = 0;
    for (const auto& write : FakeFirebase::writes) {
        if (write.method == method && write.path.find(pathPrefix) == 0) ++count;
    }
    return count;
}

static void testT13TelemetryUsesUtcAndServerHeartbeat() {
    const char* name = "T13 UTC timestamp, server heartbeat and boot state";
    startOnlineCloud();
    rtcAvailable = true;
    rtcUnixTime = 1792375200UL;
    time_service_init();
    cloud_loop();
    const auto* write = lastWrite("PATCH", "/deviceStatus");
    CHECK(name, write != nullptr);
    if (write) {
        DynamicJsonDocument doc(1536);
        CHECK(name, !deserializeJson(doc, write->payload));
        CHECK(name, doc["lastSeen"].as<uint32_t>() == rtcUnixTime);
        CHECK(name, doc["uptimeSeconds"].as<uint32_t>() == 0);
        CHECK(name, std::strcmp(doc["receivedAt"][".sv"], "timestamp") == 0);
        CHECK(name, std::strcmp(doc["currentState"], "IDLE") == 0);
        CHECK(name, doc["timeValid"].as<bool>() && doc["sensorValid"].as<bool>());
    }
    startOnlineCloud();
    cloud_loop();
    DynamicJsonDocument invalid(1536);
    CHECK(name, !deserializeJson(invalid, lastWrite("PATCH", "/deviceStatus")->payload));
    CHECK(name, invalid["lastSeen"].as<uint32_t>() == 0 && !invalid["timeValid"].as<bool>());
    CHECK(name, countWrites("PUT", "/telemetryHistory/") == 0);
}

static void testT14DeadbandHeartbeatAndPhysicalStateChange() {
    const char* name = "T14 deadband suppresses noise, heartbeat and state changes are sent";
    startOnlineCloud();
    cloud_loop();
    CHECK(name, countWrites("PATCH", "/deviceStatus") == 1);
    sensorTemperature = 22.1f;
    sensorHumidity = 50.5f;
    fakeMillis = 1000;
    cloud_loop();
    CHECK(name, countWrites("PATCH", "/deviceStatus") == 1);
    sensorTemperature = 22.6f;
    fakeMillis = 2000;
    cloud_loop();
    CHECK(name, countWrites("PATCH", "/deviceStatus") == 2);
    fakeMillis = 6999;
    cloud_loop();
    CHECK(name, countWrites("PATCH", "/deviceStatus") == 2);
    fakeMillis = 7000;
    cloud_loop();
    CHECK(name, countWrites("PATCH", "/deviceStatus") == 3);
    fakeMillis = 8000;
    fsm_simulateReminderForCompartment("A", fakeMillis);
    cloud_loop();
    DynamicJsonDocument doc(1536);
    CHECK(name, !deserializeJson(doc, lastWrite("PATCH", "/deviceStatus")->payload));
    CHECK(name, std::strcmp(doc["currentState"], "REMINDER") == 0);
    CHECK(name, doc["activeAlarm"].as<bool>());
}

static void testT15FailedPublishRetriesAndReconnectResyncs() {
    const char* name = "T15 failed telemetry retries without flooding and reconnect resends";
    startOnlineCloud();
    FakeFirebase::responseCodes["PATCH /deviceStatus"] = 503;
    cloud_loop();
    CHECK(name, countWrites("PATCH", "/deviceStatus") == 0);
    const size_t firstAttempts = FakeFirebase::attempts.size();
    fakeMillis = 500;
    cloud_loop();
    CHECK(name, FakeFirebase::attempts.size() == firstAttempts);
    FakeFirebase::responseCodes.clear();
    fakeMillis = 1000;
    cloud_loop();
    CHECK(name, countWrites("PATCH", "/deviceStatus") == 1);
    WiFi.setStatus(0);
    fakeMillis = 2000;
    cloud_loop();
    WiFi.setStatus(WL_CONNECTED);
    fakeMillis = 2100;
    cloud_loop();
    CHECK(name, countWrites("PATCH", "/deviceStatus") == 2);
}

static void testT16ReportedConfigAcknowledgesOnlyAppliedValues() {
    const char* name = "T16 reported config ACK, retry and active session deferral";
    startOnlineCloud();
    FakeFirebase::responseCodes["PUT /reportedConfig"] = 403;
    fakeMillis = 1000;
    cloud_loop();
    CHECK(name, lastWrite("PUT", "/reportedConfig") == nullptr);
    FakeFirebase::responseCodes.clear();
    fakeMillis = 2000;
    cloud_loop();
    CHECK(name, lastWrite("PUT", "/reportedConfig") != nullptr);
    DynamicJsonDocument doc(3072);
    CHECK(name, !deserializeJson(doc, lastWrite("PUT", "/reportedConfig")->payload));
    CHECK(name, doc["compartments"]["A"]["unitsPerDose"].as<int>() == 2);
    CHECK(name, std::strcmp(doc["compartments"]["A"]["schedule"], "08:00") == 0);
    CHECK(name, doc["compartments"].size() == 3);
    fsm_simulateReminderForCompartment("A", 2000);
    FakeFirebase::set("/config/compartments", validConfig(4));
    fakeMillis = 15000;
    cloud_loop();
    CHECK(name, countWrites("PUT", "/reportedConfig") == 1);
    CHECK(name, schedule_getCompartmentById("A")->unitsPerDose == 2);
    fsm_resetToIdle();
    fakeMillis = 15001;
    cloud_loop();
    CHECK(name, !deserializeJson(doc, lastWrite("PUT", "/reportedConfig")->payload));
    CHECK(name, doc["compartments"]["A"]["unitsPerDose"].as<int>() == 4);
}

static void testT17HistoryIsBoundedAndInvalidSensorsAreNotInvented() {
    const char* name = "T17 history ring is bounded, invalid samples are explicit";
    startOnlineCloud();
    rtcAvailable = true;
    rtcUnixTime = 1792375200UL;
    time_service_init();
    for (unsigned int minute = 0; minute <= TELEMETRY_HISTORY_SLOTS; ++minute) {
        fakeUnixTime = rtcUnixTime + minute * 60UL;
        fakeMillis = minute * 60000UL;
        cloud_updateTelemetry(22.0f, 50.0f, STATE_IDLE);
    }
    int historySlots = 0;
    for (const auto& item : FakeFirebase::documents) {
        if (item.first.find("/telemetryHistory/") == 0) historySlots++;
    }
    CHECK(name, historySlots == TELEMETRY_HISTORY_SLOTS);
    const int previousHistoryWrites = countWrites("PUT", "/telemetryHistory/");
    cloud_updateTelemetry(NAN, NAN, STATE_IDLE);
    CHECK(name, countWrites("PUT", "/telemetryHistory/") == previousHistoryWrites);
    DynamicJsonDocument doc(1536);
    CHECK(name, !deserializeJson(doc, lastWrite("PATCH", "/deviceStatus")->payload));
    CHECK(name, !doc["sensorValid"].as<bool>());
    CHECK(name, doc["currentTemp"].isNull() && doc["currentHumid"].isNull());
    fakeUnixTime += 60;
    cloud_updateTelemetry(NAN, NAN, STATE_IDLE);
    const FakeFirebase::Write& history = FakeFirebase::writes.back();
    CHECK(name, !deserializeJson(doc, history.payload));
    CHECK(name, history.path.find("/telemetryHistory/") == 0);
    CHECK(name, !doc["sensorValid"].as<bool>() && doc["temperature"].isNull());
}

static void testT18MqttConfigDefersWhileBusyAndStockIsIdempotent() {
    const char* name = "T18 MQTT config validation, busy deferral, stock revision and durable idempotency";
    startOnlineCloud();
    const std::string envelope = std::string("{\"compartments\":") + validConfig(4) + "}";
    fsm_simulateReminderForCompartment("A", 1000);
    CHECK(name, !cloud_applyMqttConfig(envelope.c_str()));
    CHECK(name, schedule_getCompartmentById("A")->unitsPerDose == 2);
    fsm_resetToIdle();
    CHECK(name, cloud_applyMqttConfig(envelope.c_str()));
    CHECK(name, schedule_getCompartmentById("A")->unitsPerDose == 4);
    CHECK(name, !cloud_applyMqttConfig("{\"compartments\":{\"A\":{}}}"));
    char error[80] = {};
    CHECK(name, !cloud_applyMqttStock("mq-cmd", "A", 50, 1000, error, sizeof(error)));
    CHECK(name, std::strcmp(error, "INVENTORY_REVISION_CHANGED") == 0);
    char state[3000];
    CHECK(name, cloud_getMqttState(state, sizeof(state)));
    DynamicJsonDocument doc(4096);
    CHECK(name, !deserializeJson(doc, state));
    const uint32_t revision = doc["inventory"]["A"]["revision"].as<uint32_t>();
    CHECK(name, cloud_applyMqttStock("mq-cmd", "A", 50, revision, error, sizeof(error)));
    CHECK(name, schedule_getCompartmentById("A")->currentStock == 50);
    CHECK(name, cloud_applyMqttStock("mq-cmd", "A", 50, revision, error, sizeof(error)));
    CHECK(name, cloud_getMqttState(state, sizeof(state)));
    CHECK(name, !deserializeJson(doc, state));
    CHECK(name, doc["inventory"]["A"]["revision"].as<uint32_t>() == revision + 1);
    WiFi.setStatus(0);
    cloud_resetForTest(); fsm_init(); cloud_init();
    CHECK(name, cloud_applyMqttStock("mq-cmd", "A", 50, revision, error, sizeof(error)));
    CHECK(name, schedule_getCompartmentById("A")->currentStock == 50);
}

int main() {
    testT01RtcThenNtpUsesIctAndUpdatesRtc();
    testT02InvalidRtcAndNtpNeverTriggersDefaultSchedule();
    testT03CachedScheduleAndRtcWorkOfflineAfterRestart();
    testT04NoOfflineCacheDoesNotUseSampleSchedule();
    testT05CorrectDoseWritesCloudEventAndStockOnce();
    testT06NoRemovalAndPartialRemovalWriteExpectedFailures();
    testT07OverdoseWritesOneMismatchMoreAndKeepsStock();
    testT08SnoozeRealertsThenWritesSingleMissedEvent();
    testT09RemoteDoseUpdateAppliesAndFlowsThroughVerification();
    testT10InvalidRemoteConfigKeepsLastGoodConfig();
    testT11InventoryCommandAppliesAndRejectsSafely();
    testT12OfflineEventAndInventorySurviveResetAndReconnect();
    testT13TelemetryUsesUtcAndServerHeartbeat();
    testT14DeadbandHeartbeatAndPhysicalStateChange();
    testT15FailedPublishRetriesAndReconnectResyncs();
    testT16ReportedConfigAcknowledgesOnlyAppliedValues();
    testT17HistoryIsBoundedAndInvalidSensorsAreNotInvented();
    testT18MqttConfigDefersWhileBusyAndStockIsIdempotent();
    std::printf("%d integration checks passed; %d failed.\n", passed, failed);
    return failed == 0 ? 0 : 1;
}
