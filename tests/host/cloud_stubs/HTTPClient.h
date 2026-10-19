#pragma once

#include "Arduino.h"
#include "WiFiClientSecure.h"
#include "FirebaseMock.h"

class HTTPClient {
public:
    bool begin(WiFiClientSecure&, const String& url) {
        std::string full = url;
        const size_t scheme = full.find("://");
        const size_t slash = scheme == std::string::npos ? 0 : full.find('/', scheme + 3);
        full = slash == std::string::npos ? "/" : full.substr(slash);
        const size_t extension = full.find(".json");
        path_ = extension == std::string::npos ? full : full.substr(0, extension);
        return true;
    }
    void addHeader(const char*, const char*) {}
    int GET() {
        response_ = FakeFirebase::get(path_);
        return 200;
    }
    int PUT(const String& payload) {
        FakeFirebase::record("PUT", path_, payload);
        return 200;
    }
    int PATCH(const String& payload) {
        FakeFirebase::record("PATCH", path_, payload);
        return 200;
    }
    int sendRequest(const char* method) {
        FakeFirebase::record(method ? method : "", path_);
        return 200;
    }
    String getString() const { return String(response_); }
    void end() {}
private:
    std::string path_;
    std::string response_ = "null";
};
