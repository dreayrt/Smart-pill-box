#include "time_service.h"

#include "hardware_interface.h"
#include "sync_interface.h"

#include <Arduino.h>
#include <esp_sntp.h>
#include <sys/time.h>
#include <time.h>

static const time_t MIN_VALID_UNIX_TIME = 1704067200; // 2024-01-01 00:00:00 UTC
static const unsigned long NTP_RETRY_INTERVAL_MS = 10000UL;

static volatile bool ntpSyncReceived = false;
static bool clockIsValid = false;
static bool ntpConfigured = false;
static bool wifiWasOnline = false;
static TimeSource currentTimeSource = TIME_SOURCE_INVALID;
static unsigned long lastNtpAttemptMillis = 0;

static void onNtpTimeSync(struct timeval *tv) {
    (void)tv;
    ntpSyncReceived = true;
}

static bool setSystemTimeFromUnix(uint32_t unixTime) {
    if ((time_t)unixTime < MIN_VALID_UNIX_TIME) return false;
    timeval now = {};
    now.tv_sec = (time_t)unixTime;
    now.tv_usec = 0;
    if (settimeofday(&now, nullptr) != 0) return false;
    clockIsValid = true;
    return true;
}

static void requestNtpSync() {
    sntp_set_time_sync_notification_cb(onNtpTimeSync);
    configTzTime("ICT-7", "pool.ntp.org", "time.google.com", "time.cloudflare.com");
    ntpConfigured = true;
    lastNtpAttemptMillis = millis();
    Serial.println("[TIME] Da yeu cau dong bo NTP (mui gio Viet Nam UTC+7).");
}

void time_service_init() {
    setenv("TZ", "ICT-7", 1);
    tzset();

    uint32_t rtcUnixTime = 0;
    if (hw_readRTCUnixTime(rtcUnixTime) && setSystemTimeFromUnix(rtcUnixTime)) {
        currentTimeSource = TIME_SOURCE_RTC;
        Serial.println("[TIME] Dong ho he thong da khoi phuc tu DS3231.");
    } else {
        clockIsValid = false;
        currentTimeSource = TIME_SOURCE_INVALID;
        Serial.println("[TIME] Chua co gio hop le tu RTC; dang cho NTP, tam khong kich hoat lich.");
    }

    wifiWasOnline = cloud_isOnline();
    if (wifiWasOnline) requestNtpSync();
}

void time_service_loop() {
    const bool wifiOnline = cloud_isOnline();
    if (!wifiOnline) {
        wifiWasOnline = false;
        return;
    }

    if (!wifiWasOnline || (!ntpConfigured && millis() - lastNtpAttemptMillis >= NTP_RETRY_INTERVAL_MS)) {
        wifiWasOnline = true;
        requestNtpSync();
    }

    if (ntpSyncReceived) {
        ntpSyncReceived = false;
        time_t utcNow = time(nullptr);
        if (utcNow >= MIN_VALID_UNIX_TIME && utcNow <= 4102444799LL) { // before 2100
            hw_setRTCUnixTime((uint32_t)utcNow);
            clockIsValid = true;
            currentTimeSource = TIME_SOURCE_NTP;
            Serial.println("[TIME] NTP da dong bo ESP32 va cap nhat DS3231.");
        }
    }
}

bool time_service_getSnapshot(TimeSnapshot &out) {
    out = {};
    if (!clockIsValid) return false;

    time_t utcNow = time(nullptr);
    if (utcNow < MIN_VALID_UNIX_TIME || utcNow > 4102444799LL) return false;

    tm local = {};
    if (localtime_r(&utcNow, &local) == nullptr) return false;

    out.valid = true;
    out.year = (uint16_t)(local.tm_year + 1900);
    out.month = (uint8_t)(local.tm_mon + 1);
    out.day = (uint8_t)local.tm_mday;
    out.hour = (uint8_t)local.tm_hour;
    out.minute = (uint8_t)local.tm_min;
    out.second = (uint8_t)local.tm_sec;
    out.dateKey = (uint32_t)out.year * 10000UL + (uint32_t)out.month * 100UL + out.day;
    out.unixTime = (uint32_t)utcNow;
    out.source = currentTimeSource;
    return true;
}

const char* time_service_sourceName(TimeSource source) {
    switch (source) {
        case TIME_SOURCE_RTC: return "RTC";
        case TIME_SOURCE_NTP: return "NTP";
        default: return "NO TIME";
    }
}
