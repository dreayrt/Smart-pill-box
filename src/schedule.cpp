#include "schedule.h"
#include <string.h>

// Danh sách 3 ngăn thuốc cố định
static MedicationCompartment compartments[NUM_COMPARTMENTS];

// Biến lưu trữ chống kích hoạt trùng lặp trong cùng 1 phút
static int8_t lastTriggerHour = -1;
static int8_t lastTriggerMinute = -1;
static char lastTriggerCompId[4] = "";

// Quản lý trạng thái Snooze
static MedicationCompartment* snoozedComp = NULL;
static unsigned long snoozeExpiryMillis = 0;
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

MedicationCompartment* schedule_checkDue(uint8_t currentHour, uint8_t currentMinute) {
    for (int i = 0; i < NUM_COMPARTMENTS; i++) {
        // Chỉ kích hoạt nếu ngăn đã nạp thuốc
        if (!compartments[i].isLoaded) continue;

        // Khớp giờ và phút
        if (compartments[i].scheduleHour == currentHour && 
            compartments[i].scheduleMinute == currentMinute) {

            // Chống lặp: Nếu đã kích hoạt ngăn này trong đúng phút này rồi thì bỏ qua
            if (lastTriggerHour == currentHour && 
                lastTriggerMinute == currentMinute && 
                strcmp(lastTriggerCompId, compartments[i].compartmentId) == 0) {
                return NULL;
            }

            // Ghi nhận mốc kích hoạt mới
            lastTriggerHour = currentHour;
            lastTriggerMinute = currentMinute;
            strncpy(lastTriggerCompId, compartments[i].compartmentId, sizeof(lastTriggerCompId));

            return &compartments[i];
        }
    }
    return NULL;
}

void schedule_triggerSnooze(MedicationCompartment* comp, unsigned long currentMillis) {
    snoozedComp = comp;
    snoozeExpiryMillis = currentMillis + SNOOZE_DURATION_MS;
    isSnoozed = true;
}

bool schedule_isSnoozeExpired(unsigned long currentMillis) {
    if (isSnoozed && (currentMillis >= snoozeExpiryMillis)) {
        return true;
    }
    return false;
}

MedicationCompartment* schedule_getSnoozedCompartment() {
    return snoozedComp;
}

void schedule_clearSnooze() {
    isSnoozed = false;
    snoozedComp = NULL;
    snoozeExpiryMillis = 0;
}

void schedule_resetTriggerLock() {
    lastTriggerHour = -1;
    lastTriggerMinute = -1;
    lastTriggerCompId[0] = '\0';
    schedule_clearSnooze();
}
