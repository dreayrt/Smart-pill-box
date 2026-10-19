#pragma once

#include <time.h>

struct timeval {
    long tv_sec;
    long tv_usec;
};

int settimeofday(const timeval* value, const void* timezone);
