const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const mqtt = require('mqtt');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { start } = require('../../services/server.cjs');

async function eventually(predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('Timed out waiting for state');
}
test('real MQTT → Firebase Emulator → alarm, role-protected API, config and event ACK', { timeout: 25000 }, async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Run with Firebase Emulator, not production');
  const databaseURL = 'https://demo-pillbox.firebaseio.com';
  const seed = initializeApp({ projectId: 'demo-pillbox', databaseURL }, 'seed');
  const config = Object.fromEntries(['A','B','C'].map(id => [id, { compartmentId: id, medicineCode: `MED-${id}`, displayName: `Medicine ${id}`, unitsPerDose: 1, isLoaded: true, schedule: '08:00' }]));
  const inventory = Object.fromEntries(['A','B','C'].map(id => [id, { currentStock: 20, revision: 1 }]));
  await getDatabase(seed).ref().set({ config: { compartments: config }, inventory: { compartments: inventory } });
  await deleteApp(seed);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pillbox-system-'));
  let service, device;
  try {
    service = await start({ FIREBASE_PROJECT_ID: 'demo-pillbox', FIREBASE_DATABASE_URL: databaseURL,
      FIREBASE_DATABASE_EMULATOR_HOST: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
      MQTT_PORT: '0', API_PORT: '0', MQTT_DEVICE_PASSWORD: 'test-device', MQTT_BRIDGE_PASSWORD: 'test-bridge',
      VIEWER_API_TOKEN: 'test-view', CAREGIVER_API_TOKEN: 'test-care', PILLBOX_DATA_DIR: directory });
    device = await mqtt.connectAsync(`mqtt://127.0.0.1:${service.broker.server.address().port}`, {
      username: 'pillbox-nhom13', password: 'test-device', reconnectPeriod: 0
    });
    const received = [];
    device.on('message', (topic, payload) => received.push({ topic, data: JSON.parse(payload) }));
    await device.subscribeAsync(['config','cmd','eventAck'].map(name => `pillbox/pillbox-nhom13/${name}`));
    await eventually(() => received.some(message => message.topic.endsWith('/config')));
    assert.equal(received.find(message => message.topic.endsWith('/config')).data.initialInventory.A.currentStock, 20);
    const telemetry = temperature => JSON.stringify({ deviceId: 'pillbox-nhom13', temperature, humidity: 50, currentState: 'IDLE', timeValid: true, timestamp: Math.floor(Date.now()/1000) });
    await device.publishAsync('pillbox/pillbox-nhom13/telemetry', telemetry(40), { qos: 1 });
    await eventually(() => service.store.state.current.HIGH_TEMPERATURE?.severity === 'CRITICAL');
    const alarmId = service.store.state.current.HIGH_TEMPERATURE.alarmId;
    await eventually(async () => (await service.db.ref(`alarms/${alarmId}`).get()).val()?.severity === 'CRITICAL');
    const base = `http://127.0.0.1:${service.server.address().port}`;
    const api = (token, route, data) => fetch(base + route, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
    assert.equal((await api('test-view', '/api/snapshot')).status, 200);
    assert.equal((await api('test-view', '/api/config', { compartmentId: 'A', unitsPerDose: 3 })).status, 403);
    assert.equal((await api('test-view', `/api/alarms/${alarmId}/ack`, {})).status, 403);
    assert.equal((await api('test-care', '/api/config', { compartmentId: 'A', unitsPerDose: 3 })).status, 202);
    await eventually(() => received.some(message => message.data.compartments?.A.unitsPerDose === 3));
    assert.equal((await api('test-care', `/api/alarms/${alarmId}/ack`, {})).status, 200);
    assert.equal(service.store.state.alarms[alarmId].state, 'ACKNOWLEDGED');
    await device.publishAsync('pillbox/pillbox-nhom13/telemetry', telemetry(27), { qos: 1 });
    await eventually(() => service.store.state.alarms[alarmId].state === 'CLEARED');
    await eventually(async () => (await service.db.ref(`alarms/${alarmId}`).get()).val()?.state === 'CLEARED');
    const alarmEvents = (await service.db.ref('alarmEvents').get()).val();
    assert.equal(Object.values(alarmEvents).some(event => event.alarmId === alarmId && event.transition === 'ACKNOWLEDGED'), true);
    const event = { deviceId: 'pillbox-nhom13', eventId: 'EVT-INTEGRATION-1', compartmentId: 'A', medicineCode: 'MED-A',
      expectedUnits: 1, detectedUnits: 1, status: 'VERIFIED_BY_SIMULATION', timestamp: Math.floor(Date.now()/1000),
      quantityMatch: true, compartmentMatch: true, userConfirmed: true };
    await device.publishAsync('pillbox/pillbox-nhom13/events', JSON.stringify(event), { qos: 1 });
    await eventually(() => received.some(message => message.topic.endsWith('/eventAck') && message.data.eventId === event.eventId));
    assert.equal((await service.db.ref(`events/${event.eventId}`).get()).val().status, 'VERIFIED_BY_SIMULATION');
    await device.publishAsync('pillbox/pillbox-nhom13/state', JSON.stringify({ deviceId: 'pillbox-nhom13', compartments: config, inventory }), { qos: 1 });
    await eventually(async () => (await service.db.ref('reportedConfig/compartments/A').get()).val()?.unitsPerDose === 1);
    // Repeated state reports must not form an MQTT config/state feedback loop.
    const configCount = received.filter(message => message.topic.endsWith('/config')).length;
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(received.filter(message => message.topic.endsWith('/config')).length, configCount);
  } finally {
    if (device) await device.endAsync();
    if (service) await service.close();
    fs.rmSync(directory, { recursive: true });
  }
});
