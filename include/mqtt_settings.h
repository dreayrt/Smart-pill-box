#pragma once
#if __has_include("mqtt_credentials.h")
#include "mqtt_credentials.h"
#endif
#ifndef PILLBOX_MQTT_ENABLED
#define PILLBOX_MQTT_ENABLED 0
#endif
#ifndef MQTT_BROKER_HOST
#define MQTT_BROKER_HOST "host.wokwi.internal"
#endif
#ifndef MQTT_BROKER_PORT
#define MQTT_BROKER_PORT 1883
#endif
#ifndef MQTT_DEVICE_PASSWORD
#define MQTT_DEVICE_PASSWORD ""
#endif
#ifndef MQTT_USE_TLS
#define MQTT_USE_TLS 0
#endif
#ifndef MQTT_CA_CERT
#define MQTT_CA_CERT ""
#endif
