#pragma once

#include "sys/time.h"

using sntp_sync_callback_t = void (*)(struct timeval* value);
void sntp_set_time_sync_notification_cb(sntp_sync_callback_t callback);
void configTzTime(const char* timezone, const char* server1, const char* server2, const char* server3);
