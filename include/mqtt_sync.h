#pragma once
#include "config.h"
void mqtt_sync_init();
void mqtt_sync_loop();
bool mqtt_sync_publishTelemetry(float temperature, float humidity, SystemState state);
bool mqtt_sync_publishEvent(const VerificationEvent& event);
bool cloud_applyMqttConfig(const char* json);
bool cloud_applyMqttStock(const char* commandId, const char* compartmentId, int stock, uint32_t expectedRevision, char* error, size_t errorSize);
bool cloud_getMqttState(char* output, size_t capacity);
void cloud_ackMqttEvent(const char* eventId);
