#pragma once

#include <cstdint>
#include <cstddef>

#ifdef _MSC_VER
#define __attribute__(attributes)
#endif

using byte = uint8_t;

class TestSerialPort {
public:
    void printf(const char*, ...) const {}
    void print(const char*) const {}
    void println(const char* = nullptr) const {}
};

extern TestSerialPort Serial;
unsigned long millis();
