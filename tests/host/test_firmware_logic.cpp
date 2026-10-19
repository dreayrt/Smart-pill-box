#include "state_machine.h"
#include "hardware_interface.h"
#include "sync_interface.h"
#include "Preferences.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

TestSerialPort Serial;
unsigned long fakeMillis = 0;
unsigned long millis() { return fakeMillis; }

static bool servoOpen = false;
static bool reminderAlarm = false;
static bool errorAlarm = false;
static int reminderDisplayCount = 0;
static std::vector<VerificationEvent> pushedEvents;
static std::vector<std::pair<std::string, uint8_t>> stockUpdates;
static int passed = 0;
static int failed = 0;

void hw_initAll() {}
ButtonEvent hw_getButtonEvent() { return BTN_NONE; }
void hw_setServoLock(bool open) { servoOpen = open; }
void hw_setAlarmReminder(bool active) { reminderAlarm = active; }
void hw_setAlarmError(bool active) { errorAlarm = active; }
void hw_displayIdle(int, int, int, bool, const char*, float, float) {}
void hw_displayReminder(const char*, const char*, int) { reminderDisplayCount++; }
void hw_displayVerifying(int, int) {}
void hw_displayResult(bool, const char*) {}
void hw_displayCompartmentInfo(const char*, const char*, int, int, int) {}
void hw_displayLoadResult(const char*, int, int) {}
void hw_getEnvData(float& temperature, float& humidity) { temperature = 22; humidity = 50; }
bool hw_readRTCUnixTime(uint32_t&) { return false; }
bool hw_setRTCUnixTime(uint32_t) { return false; }
void hw_update() {}
void hw_runSelfTest() {}

void cloud_init() {}
void cloud_loop() {}
bool cloud_isOnline() { return true; }
void cloud_pushEvent(const VerificationEvent& event) { pushedEvents.push_back(event); }
void cloud_updateTelemetry(float, float, SystemState) {}
bool cloud_fetchCompartmentConfig(MedicationCompartment*, int) { return false; }
bool cloud_hasScheduleConfig() { return true; }
void cloud_stockChanged(const char* id, uint8_t stock) { stockUpdates.emplace_back(id, stock); }

static void check(bool condition, const char* expression, const char* test, int line) {
    if (condition) {
        passed++;
        return;
    }
    failed++;
    std::printf("FAIL [%s:%d] %s\n", test, line, expression);
}

#define CHECK(test_name, condition) check((condition), #condition, (test_name), __LINE__)

static void resetHarness() {
    Preferences::clearAll();
    fakeMillis = 0;
    servoOpen = false;
    reminderAlarm = false;
    errorAlarm = false;
    reminderDisplayCount = 0;
    pushedEvents.clear();
    stockUpdates.clear();
    fsm_init();
}

static void makeDue(const char* id, uint8_t hour, uint8_t minute, uint8_t dose) {
    MedicationCompartment* compartment = schedule_getCompartmentById(id);
    compartment->scheduleHour = hour;
    compartment->scheduleMinute = minute;
    compartment->unitsPerDose = dose;
}

static void testT02InvalidTimeDisablesReminder() {
    const char* name = "T02 invalid time disables reminder";
    resetHarness();
    makeDue("A", 8, 0, 1);

    fsm_update(BTN_NONE, 8, 0, 0, 0, false, 1000);

    CHECK(name, fsm_getState() == STATE_IDLE);
    CHECK(name, reminderDisplayCount == 0);
    CHECK(name, !reminderAlarm);
}

static void testT05CorrectDoseClosesAndUpdatesStock() {
    const char* name = "T05 correct dose closes and updates stock";
    resetHarness();
    makeDue("A", 8, 0, 2);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 1000);
    fsm_update(BTN_TAKE_PRESSED, 8, 0, 20261019, 1792435200UL, true, 1100);
    fsm_update(BTN_REMOVE_PRESSED, 8, 0, 20261019, 1792435200UL, true, 1200);
    fsm_update(BTN_REMOVE_PRESSED, 8, 0, 20261019, 1792435200UL, true, 1300);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 9299);

    CHECK(name, fsm_getState() == STATE_VERIFIED);
    CHECK(name, servoOpen);
    CHECK(name, pushedEvents.empty());

    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 9300);
    MedicationCompartment* compartment = schedule_getCompartmentById("A");
    CHECK(name, fsm_getState() == STATE_CLOSED);
    CHECK(name, !servoOpen);
    CHECK(name, compartment->currentStock == 8);
    CHECK(name, pushedEvents.size() == 1);
    CHECK(name, std::strcmp(pushedEvents[0].status, "VERIFIED_BY_SIMULATION") == 0);
    CHECK(name, pushedEvents[0].expectedUnits == 2 && pushedEvents[0].detectedUnits == 2);
}

static void testT06NoRemovalTimesOutWithoutStockChange() {
    const char* name = "T06 no removal times out without stock change";
    resetHarness();
    makeDue("A", 8, 0, 1);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 1000);
    fsm_update(BTN_TAKE_PRESSED, 8, 0, 20261019, 1792435200UL, true, 2000);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 62000);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 62010);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 62020);

    MedicationCompartment* compartment = schedule_getCompartmentById("A");
    CHECK(name, fsm_getState() == STATE_ERROR);
    CHECK(name, !servoOpen);
    CHECK(name, errorAlarm);
    CHECK(name, compartment->currentStock == 10);
    CHECK(name, pushedEvents.size() == 1);
    CHECK(name, std::strcmp(pushedEvents[0].status, "NO_DETECTION") == 0);
    CHECK(name, pushedEvents[0].expectedUnits == 1 && pushedEvents[0].detectedUnits == 0);
}

static void testT06PartialRemovalTimesOutAsMismatchLess() {
    const char* name = "T06 partial removal times out as mismatch less";
    resetHarness();
    makeDue("A", 8, 0, 2);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 1000);
    fsm_update(BTN_TAKE_PRESSED, 8, 0, 20261019, 1792435200UL, true, 1100);
    fsm_update(BTN_REMOVE_PRESSED, 8, 0, 20261019, 1792435200UL, true, 1200);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 61100);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 61110);

    MedicationCompartment* compartment = schedule_getCompartmentById("A");
    CHECK(name, fsm_getState() == STATE_ERROR);
    CHECK(name, !servoOpen);
    CHECK(name, errorAlarm);
    CHECK(name, compartment->currentStock == 10);
    CHECK(name, pushedEvents.size() == 1);
    CHECK(name, std::strcmp(pushedEvents[0].status, "MISMATCH_LESS") == 0);
    CHECK(name, pushedEvents[0].expectedUnits == 2 && pushedEvents[0].detectedUnits == 1);
}

static void testT07OverdoseDoesNotDeductStock() {
    const char* name = "T07 overdose does not deduct stock";
    resetHarness();
    makeDue("B", 12, 0, 1);
    fsm_update(BTN_NONE, 12, 0, 20261019, 1792449600UL, true, 1000);
    fsm_update(BTN_TAKE_PRESSED, 12, 0, 20261019, 1792449600UL, true, 1100);
    fsm_update(BTN_REMOVE_PRESSED, 12, 0, 20261019, 1792449600UL, true, 1200);
    fsm_update(BTN_REMOVE_PRESSED, 12, 0, 20261019, 1792449600UL, true, 1300);
    fsm_update(BTN_NONE, 12, 0, 20261019, 1792449600UL, true, 1310);

    MedicationCompartment* compartment = schedule_getCompartmentById("B");
    CHECK(name, fsm_getState() == STATE_ERROR);
    CHECK(name, !servoOpen);
    CHECK(name, errorAlarm);
    CHECK(name, compartment->currentStock == 20);
    CHECK(name, pushedEvents.size() == 1);
    CHECK(name, std::strcmp(pushedEvents[0].status, "MISMATCH_MORE") == 0);
    CHECK(name, pushedEvents[0].expectedUnits == 1 && pushedEvents[0].detectedUnits == 2);
}

static void testT08SnoozeResumesAndMissedEventIsNotUserConfirmed() {
    const char* name = "T08 snooze resumes and missed event is not user confirmed";
    resetHarness();
    makeDue("A", 8, 0, 1);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 1000);
    fsm_update(BTN_SNOOZE_PRESSED, 8, 0, 20261019, 1792435200UL, true, 2000);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 301999);

    CHECK(name, fsm_getState() == STATE_SNOOZED);
    CHECK(name, !reminderAlarm);
    CHECK(name, pushedEvents.empty());

    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 302000);
    CHECK(name, fsm_getState() == STATE_REMINDER);
    CHECK(name, reminderAlarm);
    CHECK(name, fsm_getActiveCompartment() != nullptr);
    CHECK(name, std::strcmp(fsm_getActiveCompartment()->compartmentId, "A") == 0);

    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 601999);
    CHECK(name, fsm_getState() == STATE_REMINDER);
    CHECK(name, pushedEvents.empty());
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 901999);
    CHECK(name, fsm_getState() == STATE_REMINDER);

    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 902000);
    CHECK(name, fsm_getState() == STATE_ERROR);
    CHECK(name, pushedEvents.size() == 1);
    CHECK(name, std::strcmp(pushedEvents[0].status, "MISSED_DOSE") == 0);
    CHECK(name, !pushedEvents[0].userConfirmed);
    fsm_update(BTN_NONE, 8, 0, 20261019, 1792435200UL, true, 902010);
    CHECK(name, pushedEvents.size() == 1);
}

static void testSnoozeTimerWorksAcrossMillisRollover() {
    const char* name = "SNOOZE timer survives millis rollover";
    resetHarness();
    MedicationCompartment* compartment = schedule_getCompartmentById("A");
    const uint32_t started = 0xFFFFFF00UL;
    const uint32_t beforeExpiry = started + SNOOZE_DURATION_MS - 1;
    const uint32_t atExpiry = started + SNOOZE_DURATION_MS;

    schedule_triggerSnooze(compartment, started);
    CHECK(name, !schedule_isSnoozeExpired(beforeExpiry));
    CHECK(name, schedule_isSnoozeExpired(atExpiry));
    CHECK(name, schedule_getSnoozedCompartment() == compartment);
}

static void testT13SameMinuteQueuePersistsAcrossRestart() {
    const char* name = "T13 same-minute reminders queue and persist";
    resetHarness();
    makeDue("A", 8, 0, 1);
    makeDue("B", 8, 0, 1);
    schedule_resetTriggerLock();

    MedicationCompartment* first = schedule_checkDue(8, 0, 20261019);
    CHECK(name, first != nullptr && std::strcmp(first->compartmentId, "A") == 0);

    schedule_init(); // Simulate a reboot after the first due compartment was delivered.
    MedicationCompartment* queued = schedule_checkDue(8, 0, 20261019);
    CHECK(name, queued != nullptr && std::strcmp(queued->compartmentId, "B") == 0);
    CHECK(name, schedule_checkDue(8, 0, 20261019) == nullptr);
    CHECK(name, schedule_checkDue(8, 0, 20261019) == nullptr);
}

int main() {
    testT02InvalidTimeDisablesReminder();
    testT05CorrectDoseClosesAndUpdatesStock();
    testT06NoRemovalTimesOutWithoutStockChange();
    testT06PartialRemovalTimesOutAsMismatchLess();
    testT07OverdoseDoesNotDeductStock();
    testT08SnoozeResumesAndMissedEventIsNotUserConfirmed();
    testSnoozeTimerWorksAcrossMillisRollover();
    testT13SameMinuteQueuePersistsAcrossRestart();

    std::printf("%d checks passed; %d failed.\n", passed, failed);
    return failed == 0 ? 0 : 1;
}
