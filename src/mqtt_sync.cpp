#include "mqtt_settings.h"
#if PILLBOX_MQTT_ENABLED
#include "mqtt_sync.h"
#include "sync_interface.h"
#include "state_machine.h"
#include "time_service.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <math.h>
#include <string.h>

#if MQTT_USE_TLS
static WiFiClientSecure mqttTransport;
#else
static WiFiClient mqttTransport;
#endif
static PubSubClient mqttClient(mqttTransport);
static unsigned long lastConnectAttempt = 0;
static bool attemptedConnection = false;
static unsigned long lastStateSent = 0;
static bool stateDirty = true;
static char pendingConfig[2304] = {};
static char pendingCommand[512] = {};
static char appliedVersion[32] = {};
static char topicBuffer[96];

static const char* topic(const char* suffix) {
    snprintf(topicBuffer, sizeof(topicBuffer), "pillbox/%s/%s", DEVICE_ID, suffix);
    return topicBuffer;
}
static bool publishJson(const char* suffix, JsonDocument& doc) {
    if (!mqttClient.connected() || doc.overflowed()) return false;
    char payload[2304];
    if (measureJson(doc) + 1 > sizeof(payload)) return false;
    serializeJson(doc, payload, sizeof(payload));
    return mqttClient.publish(topic(suffix), payload, false);
}
static void onMessage(char* receivedTopic, byte* payload, unsigned int length) {
    // Copy before any publish: PubSubClient shares its receive/transmit buffer.
    char incoming[2304];
    if (length == 0 || length >= sizeof(incoming)) return;
    memcpy(incoming, payload, length); incoming[length] = '\0';
    if (strcmp(receivedTopic, topic("eventAck")) == 0) {
        StaticJsonDocument<192> doc;
        if (!deserializeJson(doc, incoming)) cloud_ackMqttEvent(doc["eventId"] | "");
        return;
    }
    StaticJsonDocument<2304> doc;
    if (deserializeJson(doc, incoming) || strcmp(doc["deviceId"] | "", DEVICE_ID) != 0) return;
    if (strcmp(receivedTopic, topic("config")) == 0) {
        const char* version = doc["version"] | "";
        if (strlen(version) == 0 || strlen(version) >= sizeof(appliedVersion)) return;
        if (strcmp(version, appliedVersion) == 0) return;
        memcpy(pendingConfig, incoming, length + 1);
    } else if (strcmp(receivedTopic, topic("cmd")) == 0 && length < sizeof(pendingCommand)) {
        memcpy(pendingCommand, incoming, length + 1);
    }
}
void mqtt_sync_init() {
#if MQTT_USE_TLS
    mqttTransport.setCACert(MQTT_CA_CERT);
#endif
    mqttClient.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
    mqttClient.setCallback(onMessage);
    mqttClient.setBufferSize(3072);
    mqttClient.setKeepAlive(20);
    mqttClient.setSocketTimeout(1);
}
void mqtt_sync_loop() {
    if (WiFi.status() != WL_CONNECTED || strlen(MQTT_DEVICE_PASSWORD) == 0) return;
#if MQTT_USE_TLS
    TimeSnapshot clock = {};
    if (!time_service_getSnapshot(clock) || strlen(MQTT_CA_CERT) == 0) return;
#endif
    const unsigned long now = millis();
    if (!mqttClient.connected()) {
        if (attemptedConnection && now - lastConnectAttempt < 5000UL) return;
        lastConnectAttempt = now; attemptedConnection = true;
        const char* willTopic = topic("presence");
        if (!mqttClient.connect(DEVICE_ID, DEVICE_ID, MQTT_DEVICE_PASSWORD, willTopic, 1, true, "offline")) return;
        mqttClient.subscribe(topic("config"), 1);
        mqttClient.subscribe(topic("cmd"), 1);
        mqttClient.subscribe(topic("eventAck"), 1);
        mqttClient.publish(topic("presence"), "online", true);
        stateDirty = true;
    }
    mqttClient.loop();
    if (fsm_getState() == STATE_IDLE && pendingConfig[0]) {
        StaticJsonDocument<2304> desired;
        if (!deserializeJson(desired, pendingConfig)) {
            const bool applied = cloud_applyMqttConfig(pendingConfig);
            StaticJsonDocument<256> ack;
            ack["deviceId"] = DEVICE_ID; ack["type"] = "config";
            ack["version"] = desired["version"] | "";
            ack["state"] = applied ? "applied" : "rejected";
            ack["message"] = applied ? "CONFIG_APPLIED" : "INVALID_CONFIG_OR_NVS";
            if (applied) snprintf(appliedVersion, sizeof(appliedVersion), "%s", desired["version"] | "");
            if (publishJson("ack", ack)) pendingConfig[0] = '\0';
            stateDirty = true;
        } else pendingConfig[0] = '\0';
    }
    if (fsm_getState() == STATE_IDLE && pendingCommand[0]) {
        StaticJsonDocument<512> command;
        if (!deserializeJson(command, pendingCommand)) {
            char error[64] = "INVALID_COMMAND";
            const char* id = command["commandId"] | "";
            const char* compartment = command["compartmentId"] | "";
            const bool valid = strcmp(command["type"] | "", "set_stock") == 0 &&
                command["targetStock"].is<int>() && command["expectedRevision"].is<uint32_t>();
            const bool applied = valid && cloud_applyMqttStock(id, compartment, command["targetStock"].as<int>(),
                command["expectedRevision"].as<uint32_t>(), error, sizeof(error));
            StaticJsonDocument<384> ack;
            ack["deviceId"] = DEVICE_ID; ack["commandId"] = id; ack["compartmentId"] = compartment;
            ack["state"] = applied ? "applied" : "rejected"; ack["message"] = applied ? "STOCK_APPLIED" : error;
            if (applied) ack["appliedStock"] = command["targetStock"].as<int>();
            if (publishJson("ack", ack)) pendingCommand[0] = '\0';
            stateDirty = true;
        } else pendingCommand[0] = '\0';
    }
    if (stateDirty || now - lastStateSent >= 5000UL) {
        char payload[2304];
        if (cloud_getMqttState(payload, sizeof(payload)) && mqttClient.publish(topic("state"), payload, false)) {
            stateDirty = false; lastStateSent = now;
        }
    }
}
bool mqtt_sync_publishTelemetry(float t, float h, SystemState state) {
    StaticJsonDocument<512> doc;
    TimeSnapshot clock = {};
    doc["timeValid"] = time_service_getSnapshot(clock);
    doc["timestamp"] = clock.unixTime; doc["deviceId"] = DEVICE_ID;
    if (isfinite(t)) doc["temperature"] = t;
    if (isfinite(h)) doc["humidity"] = h;
    doc["currentState"] = fsm_getStateName(state);
    doc["uptimeSeconds"] = millis() / 1000; doc["rssi"] = WiFi.RSSI();
    return publishJson("telemetry", doc);
}
bool mqtt_sync_publishEvent(const VerificationEvent& event) {
    StaticJsonDocument<768> doc;
    doc["deviceId"] = DEVICE_ID; doc["eventId"] = event.eventId; doc["compartmentId"] = event.compartmentId;
    doc["medicineCode"] = event.medicineCode; doc["expectedUnits"] = event.expectedUnits; doc["detectedUnits"] = event.detectedUnits;
    doc["userConfirmed"] = event.userConfirmed; doc["quantityMatch"] = event.quantityMatch; doc["compartmentMatch"] = event.compartmentMatch;
    doc["status"] = event.status; doc["timestamp"] = event.timestamp;
    return publishJson("events", doc);
}
#endif
