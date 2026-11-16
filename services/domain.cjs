'use strict';
const { randomUUID } = require('node:crypto');
const DEVICE = 'pillbox-nhom13';
const canRead = p => !!p && ['viewer', 'caregiver', 'admin'].includes(p.role) && p.pillboxId === DEVICE;
const canWrite = p => canRead(p) && ['caregiver', 'admin'].includes(p.role);

function validateConfig(compartments) {
  if (!compartments || Object.keys(compartments).sort().join('') !== 'ABC') throw new Error('Cần đủ ba ngăn A/B/C');
  for (const id of ['A', 'B', 'C']) {
    const c = compartments[id];
    if (!c || c.compartmentId !== id || typeof c.isLoaded !== 'boolean' ||
      !Number.isInteger(c.unitsPerDose) || c.unitsPerDose < 1 || c.unitsPerDose > 10 ||
      typeof c.schedule !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.schedule)) throw new Error(`Cấu hình ngăn ${id} không hợp lệ`);
    for (const [key, max] of [['medicineCode', 15], ['displayName', 31]]) {
      if (typeof c[key] !== 'string' || !c[key].trim() || Buffer.byteLength(c[key]) > max) throw new Error(`Trường ${key} ngăn ${id} vượt giới hạn`);
    }
  }
  return compartments;
}

function nextAlarm(previous, condition, now, id = randomUUID()) {
  if (condition === 'HOLD') return null;
  const open = previous && previous.state !== 'CLEARED';
  if (condition === 'NORMAL') {
    return open ? { ...previous, state: 'CLEARED', clearedAt: now, updatedAt: now, transition: 'CLEARED' } : null;
  }
  if (!open) return { alarmId: id, type: '', severity: condition, state: 'ACTIVE', openedAt: now, updatedAt: now, transition: 'OPENED' };
  if (condition === 'CRITICAL' && previous.severity !== 'CRITICAL') {
    return { ...previous, severity: 'CRITICAL', state: 'ACTIVE', acknowledgedAt: null, acknowledgedBy: null, updatedAt: now, transition: 'ESCALATED' };
  }
  return null;
}

function temperatureCondition(value, thresholds = { warning: 30, critical: 35, clear: 28 }) {
  if (!Number.isFinite(value)) return 'HOLD';
  if (value < thresholds.clear) return 'NORMAL';
  if (value > thresholds.critical) return 'CRITICAL';
  if (value >= thresholds.warning) return 'WARNING';
  return 'HOLD';
}

function applyCondition(state, type, condition, now, details = {}) {
  const previous = state.current[type];
  const alarm = nextAlarm(previous, condition, now);
  if (!alarm) return false;
  Object.assign(alarm, { type, deviceId: DEVICE, details });
  state.current[type] = alarm;
  state.alarms[alarm.alarmId] = alarm;
  const eventId = `${alarm.alarmId}-${alarm.transition}-${now}`;
  state.events[eventId] = { ...alarm, eventId };
  if (alarm.severity === 'CRITICAL') {
    state.outbox[eventId] = { id: eventId, alarmId: alarm.alarmId, type, transition: alarm.transition,
      severity: alarm.severity, details, createdAt: now, nextAttemptAt: now, attempts: 0, state: 'PENDING' };
  }
  return true;
}

function evaluateTelemetry(state, telemetry, now, thresholds) {
  if (!telemetry || !Number.isFinite(telemetry.receivedAt) || now - telemetry.receivedAt > 15000 || telemetry.receivedAt > now + 30000) return false;
  let changed = applyCondition(state, 'DEVICE_OFFLINE', 'NORMAL', now);
  if (telemetry.sensorValid === true) {
    changed = applyCondition(state, 'HIGH_TEMPERATURE', temperatureCondition(telemetry.currentTemp, thresholds), now,
      { temperature: telemetry.currentTemp }) || changed;
  }
  changed = applyCondition(state, 'SENSOR_INVALID', telemetry.sensorValid === false ? 'WARNING' : telemetry.sensorValid === true ? 'NORMAL' : 'HOLD', now) || changed;
  return changed;
}

function acknowledge(state, alarmId, principal, now) {
  if (!canWrite(principal)) throw new Error('FORBIDDEN');
  const alarm = state.alarms[alarmId];
  if (!alarm || alarm.state !== 'ACTIVE') return false;
  alarm.state = 'ACKNOWLEDGED';
  alarm.acknowledgedAt = alarm.updatedAt = now;
  alarm.acknowledgedBy = principal.uid;
  if (state.current[alarm.type]?.alarmId === alarmId) state.current[alarm.type] = alarm;
  const key = `${alarmId}-ACK-${now}`;
  state.events[key] = { ...alarm, transition: 'ACKNOWLEDGED', eventId: key };
  return true;
}

module.exports = { DEVICE, canRead, canWrite, validateConfig, nextAlarm, temperatureCondition, applyCondition, evaluateTelemetry, acknowledge };
