'use strict';
const mqtt = require('mqtt');
const { createHash } = require('node:crypto');
const { DEVICE, validateConfig } = require('./domain.cjs');
function safeId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id); }
async function acceptMessage(db, topic, buffer, now = Date.now()) {
  if (buffer.length > 8192) throw new Error('MQTT_PAYLOAD_TOO_LARGE');
  const data = JSON.parse(buffer.toString());
  if (!data || data.deviceId !== DEVICE) throw new Error('MQTT_DEVICE_MISMATCH');
  const kind = topic.split('/').at(-1);
  if (kind === 'telemetry') {
    if (typeof data.currentState !== 'string' || !['IDLE', 'REMINDER', 'SNOOZED', 'OPEN', 'VERIFYING', 'VERIFIED', 'ERROR', 'CLOSED'].includes(data.currentState)) throw new Error('INVALID_STATE');
    const t = Number.isFinite(data.temperature) && data.temperature >= -40 && data.temperature <= 80 ? data.temperature : null;
    const h = Number.isFinite(data.humidity) && data.humidity >= 0 && data.humidity <= 100 ? data.humidity : null;
    const status = { deviceId: DEVICE, online: true, receivedAt: now, lastSeen: data.timeValid === true && Number.isFinite(data.timestamp) ? data.timestamp : 0,
      currentTemp: t, currentHumid: h, sensorValid: t !== null && h !== null, currentState: data.currentState,
      activeAlarm: ['REMINDER', 'ERROR'].includes(data.currentState), timeValid: data.timeValid === true,
      uptimeSeconds: Number.isFinite(data.uptimeSeconds) ? data.uptimeSeconds : 0, rssi: Number.isFinite(data.rssi) ? data.rssi : null };
    const slot = String(Math.floor(now / 60000) % 1440).padStart(4, '0');
    await db.ref().update({ deviceStatus: status, [`telemetryHistory/${slot}`]: {
      timestamp: Math.floor(now / 1000), receivedAt: now, temperature: t, humidity: h, sensorValid: status.sensorValid } });
    return status;
  }
  if (kind === 'events') {
    if (!safeId(data.eventId) || !['A', 'B', 'C'].includes(data.compartmentId) ||
      !['VERIFIED_BY_SIMULATION', 'MISMATCH_LESS', 'MISMATCH_MORE', 'NO_DETECTION', 'MISSED_DOSE', 'USER_ONLY'].includes(data.status) ||
      !Number.isInteger(data.expectedUnits) || data.expectedUnits < 1 || data.expectedUnits > 10 ||
      !Number.isInteger(data.detectedUnits) || data.detectedUnits < 0 || data.detectedUnits > 255) throw new Error('INVALID_EVENT');
    const clean = { eventId: data.eventId, compartmentId: data.compartmentId, medicineCode: String(data.medicineCode || '').slice(0, 15),
      expectedUnits: data.expectedUnits, detectedUnits: data.detectedUnits, status: data.status,
      userConfirmed: data.userConfirmed === true, compartmentMatch: data.compartmentMatch === true, quantityMatch: data.quantityMatch === true,
      timestamp: Number.isFinite(data.timestamp) && data.timestamp >= 1704067200 ? data.timestamp : 0, receivedAt: now };
    await db.ref(`events/${data.eventId}`).set(clean);
    return { eventId: data.eventId };
  }
  if (kind === 'state') {
    const updates = {};
    if (data.compartments) {
      validateConfig(data.compartments);
      updates.reportedConfig = { deviceId: DEVICE, reportedAt: now, compartments: data.compartments };
    }
    if (data.inventory) {
      for (const id of ['A', 'B', 'C']) {
        const value = data.inventory[id];
        if (!value || !Number.isInteger(value.currentStock) || value.currentStock < 0 || value.currentStock > 100 ||
          !Number.isInteger(value.revision) || value.revision < 0) throw new Error('INVALID_INVENTORY');
        updates[`inventory/compartments/${id}`] = { currentStock: value.currentStock, revision: value.revision, updatedAt: now };
      }
    }
    if (!Object.keys(updates).length) throw new Error('EMPTY_STATE');
    await db.ref().update(updates);
  }
  if (kind === 'ack') {
    if (data.type === 'config') {
      if (!safeId(data.version) || !['applied', 'rejected'].includes(data.state)) throw new Error('INVALID_CONFIG_ACK');
      await db.ref('configStatus').set({ version: data.version, state: data.state, message: String(data.message || '').slice(0, 160), updatedAt: now });
      return;
    }
    if (!safeId(data.commandId) || !['A', 'B', 'C'].includes(data.compartmentId) || !['applied', 'rejected'].includes(data.state)) throw new Error('INVALID_ACK');
    const command = (await db.ref(`inventoryCommands/pending/${data.commandId}`).get()).val();
    if (!command || command.compartmentId !== data.compartmentId) return;
    const status = { commandId: data.commandId, compartmentId: data.compartmentId, state: data.state, updatedAt: now,
      message: String(data.message || '').slice(0, 160) };
    if (data.state === 'applied') {
      if (!Number.isInteger(data.appliedStock) || data.appliedStock !== command.targetStock) throw new Error('INVALID_STOCK_ACK');
      status.appliedStock = data.appliedStock;
    }
    await db.ref().update({ [`inventoryCommands/status/${data.compartmentId}`]: status,
      [`inventoryCommands/pending/${data.commandId}`]: null });
  }
}
function startBridge(db, config, onTelemetry, onError) {
  const client = mqtt.connect(config.url, { username: 'bridge', password: config.password, clientId: 'pillbox-bridge',
    reconnectPeriod: 2000, rejectUnauthorized: true, ...(config.ca ? { ca: config.ca } : {}) });
  const prefix = `pillbox/${DEVICE}`;
  let desired = null, pending = {}, inventory = {}, inventoryLoaded = false;
  function sendDesired() {
    if (!desired || !client.connected || !inventoryLoaded) return;
    try { validateConfig(desired); } catch (e) { onError(e); return; }
    const version = createHash('sha256').update(JSON.stringify(desired)).digest('hex').slice(0, 24);
    const initialInventory = ['A','B','C'].every(id => Number.isInteger(inventory[id]?.currentStock)) ? inventory : undefined;
    client.publish(`${prefix}/config`, JSON.stringify({ deviceId: DEVICE, version, compartments: desired, initialInventory }), { qos: 1, retain: true });
  }
  function sendCommands() {
    if (!client.connected) return;
    const first = Object.keys(pending).sort()[0];
    if (!first) return;
    const c = pending[first];
    if (!safeId(first) || !['A', 'B', 'C'].includes(c.compartmentId) || !Number.isInteger(c.targetStock) || c.targetStock < 0 || c.targetStock > 100) return;
    client.publish(`${prefix}/cmd`, JSON.stringify({ deviceId: DEVICE, commandId: first, type: 'set_stock',
      compartmentId: c.compartmentId, targetStock: c.targetStock,
      expectedRevision: inventory[c.compartmentId]?.revision ?? 0 }), { qos: 1 });
  }
  client.on('connect', () => {
    client.subscribe(['telemetry', 'events', 'state', 'ack', 'presence'].map(t => `${prefix}/${t}`), { qos: 1 });
    sendDesired(); sendCommands();
  });
  let processing = Promise.resolve();
  client.on('message', (topic, buffer, packet) => {
    if (packet.retain || topic.endsWith('/presence')) return;
    processing = processing.then(async () => {
      const result = await acceptMessage(db, topic, buffer);
      if (topic.endsWith('/events') && result) client.publish(`${prefix}/eventAck`, JSON.stringify(result), { qos: 1 });
      if (topic.endsWith('/telemetry') && result) onTelemetry(result);
    }).catch(onError);
  });
  client.on('error', () => onError(new Error('MQTT_CONNECTION_ERROR')));
  const subscriptions = [
    ['config/compartments', value => { desired = value; sendDesired(); }],
    ['inventoryCommands/pending', value => { pending = value || {}; sendCommands(); }],
    ['inventory/compartments', value => { const first = !inventoryLoaded; inventory = value || {}; inventoryLoaded = true; if (first) sendDesired(); }]
  ];
  subscriptions.forEach(([key, fn]) => db.ref(key).on('value', snapshot => fn(snapshot.val()), onError));
  const timer = setInterval(sendCommands, 3000);
  return { client, close() { clearInterval(timer); subscriptions.forEach(([key]) => db.ref(key).off()); return client.endAsync(); } };
}
module.exports = { safeId, acceptMessage, startBridge };
