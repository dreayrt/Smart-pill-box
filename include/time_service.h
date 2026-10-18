#pragma once

#include <stdint.h>

enum TimeSource : uint8_t {
    TIME_SOURCE_INVALID = 0,
    TIME_SOURCE_RTC,
    TIME_SOURCE_NTP
};

struct TimeSnapshot {
    bool valid;
    uint16_t year;
    uint8_t month;
    uint8_t day;
    uint8_t hour;
    uint8_t minute;
    uint8_t second;
    uint32_t dateKey;   // YYYYMMDD in Vietnam local time
    uint32_t unixTime;  // UTC seconds since 1970
    TimeSource source;
};

void time_service_init();
void time_service_loop();
bool time_service_getSnapshot(TimeSnapshot &out);
const char* time_service_sourceName(TimeSource source);
