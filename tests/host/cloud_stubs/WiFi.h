#pragma once

#include "Arduino.h"

#define WIFI_STA 1
#define WL_CONNECTED 3

class IPAddress {
public:
    String toString() const { return String("127.0.0.1"); }
};

class TestWiFiClass {
public:
    int status() const { return status_; }
    void setStatus(int value) { status_ = value; }
    void mode(int) {}
    void begin(const char*, const char*) {}
    void reconnect() {}
    IPAddress localIP() const { return {}; }
private:
    int status_ = WL_CONNECTED;
};

inline TestWiFiClass WiFi;
