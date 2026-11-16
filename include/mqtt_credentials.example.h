#pragma once
// Copy to mqtt_credentials.h or run npm run setup:local to generate a local password.
#define MQTT_BROKER_HOST "host.wokwi.internal"
#define MQTT_BROKER_PORT 1883
#define MQTT_DEVICE_PASSWORD "replace-with-local-device-password"
// Non-TLS is for the loopback broker through a local Wokwi gateway only.
// For a physical ESP32 over LAN, configure the broker certificate and matching CA here.
#define MQTT_USE_TLS 0
#define MQTT_CA_CERT ""
