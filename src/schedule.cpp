#include "schedule.h"
#include <Arduino.h>
#include <Preferences.h>
#include <string.h>

// Danh sách 3 ngăn thuốc cố định
static MedicationCompartment compartments[NUM_COMPARTMENTS];

// Khóa kích hoạt và hàng đợi các ngăn đến giờ được lưu bền vững để tránh
// bỏ sót ngăn trùng lịch hoặc phát lại cữ đã nhắc sau khi ESP32 khởi động lại.
static const uint32_t SCHEDULE_NVS_MAGIC = 0x53434831UL;
struct ScheduleNvsState {
    uint32_t magic;
    uint32_t lastTriggerDateKey[NUM_COMPARTMENTS];
    uint32_t pendingDateKey[NUM_COMPARTMENTS];
    uint8_t pendingCompartmentIndex[NUM_COMPARTMENTS];
    uint8_t pendingHead;
    uint8_t pendingCount;
};
static ScheduleNvsState scheduleState = {};

static bool saveScheduleState() {
    Preferences prefs;
    if (!prefs.begin("pillSched", false)) return false;
    const size_t written = prefs.putBytes("state", &scheduleState, sizeof(scheduleState));
    prefs.end();
    return written == sizeof(scheduleState);
}

static bool isScheduleStateValid(const ScheduleNvsState &state) {
    if (state.magic != SCHEDULE_NVS_MAGIC || state.pendingHead >= NUM_COMPARTMENTS ||
        state.pendingCount > NUM_COMPARTMENTS) return false;
    for (uint8_t i = 0; i < state.pendingCount; i++) {
        const uint8_t slot = (uint8_t)((state.pendingHead + i) % NUM_COMPARTMENTS);
        if (state.pendingCompartmentIndex[slot] >= NUM_COMPARTMENTS || state.pendingDateKey[slot] == 0) return false;
    }
    return true;
}

static void restoreScheduleState() {
    ScheduleNvsState saved = {};
    Preferences prefs;
    if (prefs.begin("pillSched", true)) {
        if (prefs.getBytesLength("state") == sizeof(saved)) {
            prefs.getBytes("state", &saved, sizeof(saved));
        }
        prefs.end();
    }
    scheduleState = isScheduleStateValid(saved) ? saved : ScheduleNvsState{};
    scheduleState.magic = SCHEDULE_NVS_MAGIC;
    if (scheduleState.pendingHead >= NUM_COMPARTMENTS) scheduleState.pendingHead = 0;
    if (scheduleState.pendingCount > NUM_COMPARTMENTS) scheduleState.pendingCount = 0;
}

// Quản lý trạng thái Snooze
static MedicationCompartment* snoozedComp = NULL;
static unsigned long snoozeStartMillis = 0;
static bool isSnoozed = false;

void schedule_init() {
    // Ngăn A: 08:00 sáng - Thuốc tim mạch (2 viên)
    strncpy(compartments[0].compartmentId, "A", sizeof(compartments[0].compartmentId));
    strncpy(compartments[0].medicineCode, "MED-001", sizeof(compartments[0].medicineCode));
    strncpy(compartments[0].displayName, "Thuoc Tim Mach", sizeof(compartments[0].displayName));
    compartments[0].unitsPerDose = 2;
    compartments[0].scheduleHour = 8;
    compartments[0].scheduleMinute = 0;
    compartments[0].currentStock = 10;
    compartments[0].isLoaded = true;

    // Ngăn B: 12:00 trưa - Vitamin C (1 viên)
    strncpy(compartments[1].compartmentId, "B", sizeof(compartments[1].compartmentId));
    strncpy(compartments[1].medicineCode, "MED-002", sizeof(compartments[1].medicineCode));
    strncpy(compartments[1].displayName, "Vitamin C", sizeof(compartments[1].displayName));
    compartments[1].unitsPerDose = 1;
    compartments[1].scheduleHour = 12;
    compartments[1].scheduleMinute = 0;
    compartments[1].currentStock = 20;
    compartments[1].isLoaded = true;

    // Ngăn C: 20:00 tối - Canxi Nano (1 viên)
    strncpy(compartments[2].compartmentId, "C", sizeof(compartments[2].compartmentId));
    strncpy(compartments[2].medicineCode, "MED-003", sizeof(compartments[2].medicineCode));
    strncpy(compartments[2].displayName, "Canxi Nano", sizeof(compartments[2].displayName));
    compartments[2].unitsPerDose = 1;
    compartments[2].scheduleHour = 20;
    compartments[2].scheduleMinute = 0;
    compartments[2].currentStock = 15;
    compartments[2].isLoaded = true;

    restoreScheduleState();
    schedule_clearSnooze();
}

MedicationCompartment* schedule_getCompartments() {
    return compartments;
}

MedicationCompartment* schedule_getCompartmentById(const char* id) {
    if (!id) return NULL;
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        if (strcmp(compartments[i].compartmentId, id) == 0) {
            return &compartments[i];
        }
    }
    return NULL;
}

bool schedule_updateCompartment(const MedicationCompartment &comp) {
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        if (strcmp(compartments[i].compartmentId, comp.compartmentId) == 0) {
            compartments[i] = comp;
            return true;
        }
    }
    return false;
}

MedicationCompartment* schedule_checkDue(uint8_t currentHour, uint8_t currentMinute, uint32_t dateKey) {
    if (dateKey == 0) return NULL;

    // Deliver any additional compartment that shared a due minute, including
    // after a restart that interrupted the previous compartment's session.
    while (scheduleState.pendingCount > 0) {
        const uint8_t slot = scheduleState.pendingHead;
        const uint32_t pendingDate = scheduleState.pendingDateKey[slot];
        if (pendingDate > dateKey) return NULL;

        const uint8_t index = scheduleState.pendingCompartmentIndex[slot];
        scheduleState.pendingHead = (uint8_t)((scheduleState.pendingHead + 1) % NUM_COMPARTMENTS);
        scheduleState.pendingCount--;
        saveScheduleState();
        if (pendingDate == dateKey && index < NUM_COMPARTMENTS) return &compartments[index];
    }

    bool addedDueCompartments = false;
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        // Chỉ kích hoạt nếu ngăn đã nạp thuốc
        if (!compartments[i].isLoaded) continue;

        // Khớp giờ và phút
        if (compartments[i].scheduleHour == currentHour && 
            compartments[i].scheduleMinute == currentMinute) {

            // Chống lặp nếu ngăn này đã được kích hoạt trong cùng ngày.
            if (scheduleState.lastTriggerDateKey[i] == dateKey) continue;

            const uint8_t tail = (uint8_t)((scheduleState.pendingHead + scheduleState.pendingCount) % NUM_COMPARTMENTS);
            scheduleState.pendingDateKey[tail] = dateKey;
            scheduleState.pendingCompartmentIndex[tail] = (uint8_t)i;
            scheduleState.pendingCount++;
            scheduleState.lastTriggerDateKey[i] = dateKey;
            addedDueCompartments = true;
        }
    }

    if (addedDueCompartments) saveScheduleState();
    if (scheduleState.pendingCount == 0) return NULL;

    const uint8_t slot = scheduleState.pendingHead;
    const uint8_t index = scheduleState.pendingCompartmentIndex[slot];
    scheduleState.pendingHead = (uint8_t)((scheduleState.pendingHead + 1) % NUM_COMPARTMENTS);
    scheduleState.pendingCount--;
    saveScheduleState();
    return index < NUM_COMPARTMENTS ? &compartments[index] : NULL;
}

void schedule_triggerSnooze(MedicationCompartment* comp, unsigned long currentMillis) {
    snoozedComp = comp;
    snoozeStartMillis = currentMillis;
    isSnoozed = true;
}

bool schedule_isSnoozeExpired(unsigned long currentMillis) {
    // Unsigned elapsed-time arithmetic remains valid when millis() rolls over.
    return isSnoozed && (unsigned long)(currentMillis - snoozeStartMillis) >= SNOOZE_DURATION_MS;
}

MedicationCompartment* schedule_getSnoozedCompartment() {
    return snoozedComp;
}

void schedule_clearSnooze() {
    isSnoozed = false;
    snoozedComp = NULL;
    snoozeStartMillis = 0;
}

void schedule_resetTriggerLock() {
    scheduleState = {};
    scheduleState.magic = SCHEDULE_NVS_MAGIC;
    saveScheduleState();
    schedule_clearSnooze();
}
