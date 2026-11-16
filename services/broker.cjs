'use strict';
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const { timingSafeEqual } = require('node:crypto');
const Aedes = require('aedes');
function equal(a, b) {
  const left = Buffer.from(a || ''), right = Buffer.from(b || '');
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}
function allowed(user, topic, operation, deviceId) {
  const base = `pillbox/${deviceId}/`;
  if (!topic.startsWith(base)) return false;
  const name = topic.slice(base.length);
  if (user === 'bridge') return operation === 'publish' ? ['config', 'cmd', 'eventAck'].includes(name) : ['telemetry', 'events', 'state', 'ack', 'presence'].includes(name);
  if (user === deviceId) return operation === 'publish' ? ['telemetry', 'events', 'state', 'ack', 'presence'].includes(name) : ['config', 'cmd', 'eventAck'].includes(name);
  return false;
}
function startBroker(config) {
  if (!config.devicePassword || !config.bridgePassword || config.devicePassword === config.bridgePassword) throw new Error('MQTT requires distinct device/bridge passwords');
  if (config.host !== '127.0.0.1' && (!config.cert || !config.key)) throw new Error('LAN MQTT requires TLS certificate and key');
  const broker = Aedes({ id: 'pillbox-local', heartbeatInterval: 5000, connectTimeout: 10000 });
  broker.authenticate = (client, username, password, callback) => {
    const user = username?.toString();
    const expected = user === 'bridge' ? config.bridgePassword : user === config.deviceId ? config.devicePassword : '';
    const okay = equal(password?.toString(), expected);
    if (okay) client.pillboxUser = user;
    callback(null, okay);
  };
  broker.authorizePublish = (client, packet, callback) => {
    const okay = packet.payload.length <= 8192 && !packet.retain && allowed(client.pillboxUser, packet.topic, 'publish', config.deviceId);
    // Only the trusted bridge may retain the desired config; device presence may be retained.
    const retainedOkay = packet.payload.length <= 8192 && packet.retain &&
      ((client.pillboxUser === 'bridge' && packet.topic === `pillbox/${config.deviceId}/config`) ||
       (client.pillboxUser === config.deviceId && packet.topic === `pillbox/${config.deviceId}/presence`));
    callback(okay || retainedOkay ? null : new Error('MQTT_FORBIDDEN'));
  };
  broker.authorizeSubscribe = (client, sub, callback) => callback(null,
    allowed(client.pillboxUser, sub.topic, 'subscribe', config.deviceId) ? sub : null);
  const server = config.cert && config.key ? tls.createServer({ cert: fs.readFileSync(config.cert), key: fs.readFileSync(config.key) }, broker.handle) : net.createServer(broker.handle);
  server.listen(config.port, config.host);
  return { broker, server, close: () => new Promise(resolve => { server.close(() => broker.close(resolve)); }) };
}
module.exports = { equal, allowed, startBroker };
