'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const root = path.join(__dirname, '..');
const firmwareCredentials = path.join(root, 'include/credentials.h');
if (!fs.existsSync(firmwareCredentials)) {
  fs.copyFileSync(path.join(root, 'include/credentials.example.h'), firmwareCredentials);
}
const envPath = path.join(__dirname, '.env');
fs.mkdirSync(path.join(__dirname, 'secrets'), { recursive: true });
if (!fs.existsSync(envPath)) {
  let content = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
  for (const key of ['MQTT_DEVICE_PASSWORD','MQTT_BRIDGE_PASSWORD','VIEWER_API_TOKEN','CAREGIVER_API_TOKEN','NODERED_VIEWER_PASSWORD','NODERED_CAREGIVER_PASSWORD','NODERED_ADMIN_PASSWORD']) {
    content = content.replace(new RegExp(`^${key}=$`, 'm'), `${key}=${randomBytes(24).toString('hex')}`);
  }
  fs.writeFileSync(envPath, content, { mode: 0o600 });
}
let values = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const cert = path.join(__dirname, 'secrets/broker-cert.pem'), key = path.join(__dirname, 'secrets/broker-key.pem');
if (!fs.existsSync(cert) || !fs.existsSync(key)) {
  const openssl = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `IP:${i.address}`);
  const result = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '365',
    '-keyout', key, '-out', cert, '-subj', '/CN=host.wokwi.internal', '-addext', `subjectAltName=DNS:host.wokwi.internal,DNS:localhost,IP:127.0.0.1${ips.length ? ',' + ips.join(',') : ''}`,
    '-addext', 'basicConstraints=critical,CA:TRUE'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Không tạo được chứng chỉ MQTT. Cài OpenSSL hoặc đặt chứng chỉ riêng trong services/secrets.');
}
// Enable TLS for the local broker; the device pins this local CA certificate.
let content = fs.readFileSync(envPath, 'utf8');
for (const [name, value] of Object.entries({ MQTT_PORT: '8883', MQTT_TLS_CERT: cert.replaceAll('\\','/'), MQTT_TLS_KEY: key.replaceAll('\\','/') })) {
  if (!values.MQTT_TLS_CERT || values.MQTT_TLS_CERT === cert.replaceAll('\\','/')) content = content.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${value}`);
}
fs.writeFileSync(envPath, content, { mode: 0o600 });
values = Object.fromEntries(content.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const header = path.join(root, 'include/mqtt_credentials.h');
if (!fs.existsSync(header)) fs.writeFileSync(header, `#pragma once\n#define MQTT_BROKER_HOST "host.wokwi.internal"\n#define MQTT_BROKER_PORT ${values.MQTT_PORT}\n#define MQTT_DEVICE_PASSWORD "${values.MQTT_DEVICE_PASSWORD}"\n#define MQTT_USE_TLS 1\nstatic const char PILLBOX_MQTT_CA_CERT[] = R"CERT(${fs.readFileSync(cert, 'utf8')})CERT";\n#define MQTT_CA_CERT PILLBOX_MQTT_CA_CERT\n`, { mode: 0o600 });
else {
  const existing = fs.readFileSync(header, 'utf8');
  if (existing.includes('#define MQTT_CA_CERT R"CERT(')) fs.writeFileSync(header,
    existing.replace('#define MQTT_CA_CERT R"CERT(', 'static const char PILLBOX_MQTT_CA_CERT[] = R"CERT(')
      .replace(')CERT"\n', ')CERT";\n#define MQTT_CA_CERT PILLBOX_MQTT_CA_CERT\n'));
}
require('./build-rules.cjs');
const { flows } = require('./nodered/flows.cjs');
for (const mode of ['viewer','caregiver']) fs.writeFileSync(path.join(__dirname, `nodered/flows.${mode}.json`), JSON.stringify(flows(mode), null, 2) + '\n');
console.log('Đã chuẩn bị services/.env, chứng chỉ TLS, cấu hình MQTT riêng và hai flow Node-RED. Không in mật khẩu/token ra terminal.');
