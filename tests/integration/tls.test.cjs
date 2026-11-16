const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const mqtt = require('mqtt');
const { startBroker } = require('../../services/broker.cjs');
test('local MQTT TLS accepts the pinned certificate and rejects an untrusted CA', { timeout: 10000 }, async () => {
  const cert = path.join(__dirname,'../../services/secrets/broker-cert.pem');
  const key = path.join(__dirname,'../../services/secrets/broker-key.pem');
  const broker = startBroker({ host:'127.0.0.1', port:0, deviceId:'pillbox-nhom13', devicePassword:'test-device', bridgePassword:'test-bridge', cert, key });
  await once(broker.server,'listening');
  const url = `mqtts://127.0.0.1:${broker.server.address().port}`;
  let device;
  try {
    device = await mqtt.connectAsync(url,{username:'pillbox-nhom13',password:'test-device',ca:fs.readFileSync(cert),rejectUnauthorized:true,reconnectPeriod:0});
    assert.equal(device.connected,true);
    await assert.rejects(mqtt.connectAsync(url,{username:'pillbox-nhom13',password:'test-device',rejectUnauthorized:true,reconnectPeriod:0,connectTimeout:2000}));
  } finally { if(device) await device.endAsync(); await broker.close(); }
});
