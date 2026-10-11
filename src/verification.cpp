#include "verification.h"
#include <string.h>
#include <stdio.h>

static char activeCompartmentId[4] = "";
static char activeMedicineCode[16] = "";
static uint8_t expectedUnits = 0;
static uint8_t detectedUnits = 0;
static unsigned long startMillis = 0;
static bool userConfirmed = false;

void verify_start(const MedicationCompartment* comp, unsigned long currentMillis) {
    if (!comp) return;

    strncpy(activeCompartmentId, comp->compartmentId, sizeof(activeCompartmentId));
    strncpy(activeMedicineCode, comp->medicineCode, sizeof(activeMedicineCode));
    expectedUnits = comp->unitsPerDose;
    detectedUnits = 0;
    startMillis = currentMillis;
    userConfirmed = true; // Người dùng đã ấn TAKE để mở nắp
}

void verify_onUnitRemoved() {
    detectedUnits++;
}

bool verify_isTimeout(unsigned long currentMillis) {
    return (currentMillis - startMillis >= VERIFY_TIMEOUT_MS);
}

VerifyResult verify_evaluate(unsigned long currentMillis) {
    // 1. Đúng số lượng mong đợi
    if (detectedUnits == expectedUnits) {
        return VERIFY_MATCH;
    }

    // 2. Lấy vượt quá liều (quá liều)
    if (detectedUnits > expectedUnits) {
        return VERIFY_MORE;
    }

    // 3. Nếu đã hết 60s mà chưa đủ
    if (verify_isTimeout(currentMillis)) {
        if (detectedUnits == 0) {
            return VERIFY_TIMEOUT; // Không lấy viên nào (bấm Take đối phó)
        } else {
            return VERIFY_LESS;    // Có lấy nhưng thiếu
        }
    }

    // Chưa xong và chưa hết giờ
    return VERIFY_NONE;
}

uint8_t verify_getDetectedUnits() {
    return detectedUnits;
}

uint8_t verify_getExpectedUnits() {
    return expectedUnits;
}

void verify_buildEvent(unsigned long currentTimestamp, VerificationEvent &outEvent) {
    snprintf(outEvent.eventId, sizeof(outEvent.eventId), "EVT-%lu-%s", currentTimestamp, activeCompartmentId);
    strncpy(outEvent.compartmentId, activeCompartmentId, sizeof(outEvent.compartmentId));
    strncpy(outEvent.medicineCode, activeMedicineCode, sizeof(outEvent.medicineCode));
    outEvent.expectedUnits = expectedUnits;
    outEvent.detectedUnits = detectedUnits;
    outEvent.compartmentMatch = true;
    outEvent.userConfirmed = userConfirmed;
    outEvent.timestamp = currentTimestamp;
    outEvent.synced = false;

    if (detectedUnits == expectedUnits) {
        outEvent.quantityMatch = true;
        strncpy(outEvent.status, "VERIFIED_BY_SIMULATION", sizeof(outEvent.status));
    } else if (detectedUnits > expectedUnits) {
        outEvent.quantityMatch = false;
        strncpy(outEvent.status, "MISMATCH_MORE", sizeof(outEvent.status));
    } else if (detectedUnits == 0) {
        outEvent.quantityMatch = false;
        strncpy(outEvent.status, "NO_DETECTION", sizeof(outEvent.status));
    } else {
        outEvent.quantityMatch = false;
        strncpy(outEvent.status, "MISMATCH_LESS", sizeof(outEvent.status));
    }
}
