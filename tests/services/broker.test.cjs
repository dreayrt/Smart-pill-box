const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const mqtt = require('mqtt');
const { startBroker, allowed } = require('../../services/broker.cjs');
const { authenticate } = require('../../services/nodered/auth.cjs');
const { flows } = require('../../services/nodered/flows.cjs');
test('no-code controls display acknowledged device values and indicate pending config', () => {
  const map = flows('caregiver').find(node => node.id === 'split');
  const transform = new Function('msg','context',map.func);
  const output = transform({statusCode:200,payload:{reportedConfig:{compartments:{A:{unitsPerDose:3,isLoaded:true}}},
    'config/compartments':{A:{unitsPerDose:5,isLoaded:true}}}}, { get(){return null;},set(){} });
  assert.equal(output[5].payload,3); assert.equal(output[6].payload,true);
  assert.match(output[3].payload,/chờ ESP32 xác nhận/);
  assert.equal(flows('caregiver').find(node=>node.id==='dose').passthru,false);
});
test('broker ACL denies wildcard subscriptions, another device and forged commands', () => {
  assert.equal(allowed('pillbox-nhom13', 'pillbox/pillbox-nhom13/cmd', 'publish', 'pillbox-nhom13'), false);
  assert.equal(allowed('pillbox-nhom13', 'pillbox/other/telemetry', 'publish', 'pillbox-nhom13'), false);
  assert.equal(allowed('bridge', 'pillbox/+/telemetry', 'subscribe', 'pillbox-nhom13'), false);
  assert.equal(allowed('bridge', 'pillbox/pillbox-nhom13/cmd', 'publish', 'pillbox-nhom13'), true);
});
test('Node-RED viewer credentials cannot authenticate to caregiver HTTP or websocket gate', () => {
  const header = 'Basic ' + Buffer.from('viewer:viewer-secret').toString('base64');
  assert.equal(authenticate(header, 'viewer', 'viewer-secret'), true);
  assert.equal(authenticate(header, 'caregiver', 'caregiver-secret'), false);
  assert.equal(authenticate(undefined, 'viewer', 'viewer-secret'), false);
});
test('real MQTT broker routes telemetry and command ACK with authenticated clients', { timeout: 10000 }, async () => {
  const local = startBroker({ host: '127.0.0.1', port: 0, deviceId: 'pillbox-nhom13', devicePassword: 'device-secret', bridgePassword: 'bridge-secret' });
  await once(local.server, 'listening');
  const url = `mqtt://127.0.0.1:${local.server.address().port}`;
  let device, bridge;
  try {
    device = await mqtt.connectAsync(url, { username: 'pillbox-nhom13', password: 'device-secret', reconnectPeriod: 0 });
    bridge = await mqtt.connectAsync(url, { username: 'bridge', password: 'bridge-secret', reconnectPeriod: 0 });
    await bridge.subscribeAsync('pillbox/pillbox-nhom13/telemetry');
    const received = once(bridge, 'message');
    await device.publishAsync('pillbox/pillbox-nhom13/telemetry', '{"temperature":40}', { qos: 1 });
    assert.equal((await received)[1].toString(), '{"temperature":40}');
    await device.subscribeAsync('pillbox/pillbox-nhom13/cmd');
    const command = once(device, 'message');
    await bridge.publishAsync('pillbox/pillbox-nhom13/cmd', '{"commandId":"one"}', { qos: 1 });
    assert.equal(JSON.parse((await command)[1]).commandId, 'one');
  } finally { if (device) await device.endAsync(); if (bridge) await bridge.endAsync(); await local.close(); }
});
