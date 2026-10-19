#pragma once

#include <cstdint>
#include <cstdio>
#include <string>

#ifdef _MSC_VER
#define __attribute__(attributes)
#endif

class String : public std::string {
public:
    using std::string::string;
    String() = default;
    String(const std::string& value) : std::string(value) {}
    bool endsWith(const char* suffix) const {
        const std::string value = suffix ? suffix : "";
        return size() >= value.size() && compare(size() - value.size(), value.size(), value) == 0;
    }
    bool startsWith(const char* prefix) const {
        const std::string value = prefix ? prefix : "";
        return size() >= value.size() && compare(0, value.size(), value) == 0;
    }
    void remove(size_t index) { if (index < size()) erase(index); }
    size_t write(uint8_t value) { push_back((char)value); return 1; }
    size_t write(const uint8_t* data, size_t length) {
        append(reinterpret_cast<const char*>(data), length);
        return length;
    }
};

class TestSerialPort {
public:
    void printf(const char*, ...) const {}
    void print(const char*) const {}
    void println(const char* = nullptr) const {}
};

extern TestSerialPort Serial;
unsigned long millis();
void delay(unsigned long milliseconds);
