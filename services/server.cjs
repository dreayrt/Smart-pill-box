'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getCredential } = require('./firebase-credential.cjs');
const { getDatabase } = require('firebase-admin/database');
const { getAuth } = require('firebase-admin/auth');
const { DEVICE, canRead, canWrite, validateConfig, evaluateTelemetry, applyCondition, acknowledge } = require('./domain.cjs');
const { Store } = require('./store.cjs');
const { equal, startBroker } = require('./broker.cjs');
const { startBridge } = require('./bridge.cjs');
const { dispatch } = require('./telegram.cjs');

async function start(env = process.env) {
  if (!env.FIREBASE_DATABASE_URL || (!env.GOOGLE_APPLICATION_CREDENTIALS && !env.FIREBASE_CLI_ACCOUNT && !env.FIREBASE_DATABASE_EMULATOR_HOST)) throw new Error('Cần service account hoặc FIREBASE_CLI_ACCOUNT đã đăng nhập; hoặc cấu hình Firebase Emulator.');
  if (!env.VIEWER_API_TOKEN || !env.CAREGIVER_API_TOKEN || env.VIEWER_API_TOKEN === env.CAREGIVER_API_TOKEN) throw new Error('Cần hai API token riêng cho Node-RED viewer/caregiver. Chạy npm run setup:local.');
  const app = initializeApp({ projectId: env.FIREBASE_PROJECT_ID,
    ...(env.FIREBASE_DATABASE_EMULATOR_HOST ? {} : { credential: getCredential(env) }), databaseURL: env.FIREBASE_DATABASE_URL });
  const db = getDatabase(app);
  await db.ref('config/compartments').get(); // Fail before exposing local services if Firebase auth is wrong.
  const store = new Store(path.join(env.PILLBOX_DATA_DIR || path.join(__dirname, 'data'), 'state.json'));
  const thresholds = { warning: Number(env.ALARM_WARNING_C || 30), critical: Number(env.ALARM_CRITICAL_C || 35), clear: Number(env.ALARM_CLEAR_C || 28) };
  if (!(thresholds.clear < thresholds.warning && thresholds.warning < thresholds.critical)) throw new Error('Ngưỡng cảnh báo phải clear < warning < critical');
  const mqttConfig = { host: env.MQTT_BIND || '127.0.0.1', port: Number(env.MQTT_PORT || 1883), deviceId: DEVICE,
    devicePassword: env.MQTT_DEVICE_PASSWORD, bridgePassword: env.MQTT_BRIDGE_PASSWORD, cert: env.MQTT_TLS_CERT, key: env.MQTT_TLS_KEY };
  const broker = startBroker(mqttConfig);
  if (!broker.server.listening) await once(broker.server, 'listening');
  mqttConfig.port = broker.server.address().port;
  const startedAt = Date.now();
  let dirty = true, busy = false, snapshot = {};
  const logError = error => console.error('[service]', /^[A-Z_]+$/.test(error.message) ? error.message : 'OPERATION_FAILED');
  const snapshotKeys = ['deviceStatus', 'config/compartments', 'inventory/compartments', 'reportedConfig'];
  snapshotKeys.forEach(key => db.ref(key).on('value', value => { snapshot[key] = value.val(); }, logError));
  const bridge = startBridge(db, { url: `${mqttConfig.cert ? 'mqtts' : 'mqtt'}://${env.MQTT_HOST || '127.0.0.1'}:${mqttConfig.port}`,
    password: env.MQTT_BRIDGE_PASSWORD, ca: mqttConfig.cert ? fs.readFileSync(mqttConfig.cert) : null }, telemetry => {
    const changed = store.commit(s => { s.lastSeen = telemetry.receivedAt; return evaluateTelemetry(s, telemetry, Date.now(), thresholds); });
    dirty = dirty || changed;
  }, logError);
  const telegram = { enabled: env.TELEGRAM_ENABLED === 'true', token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID };

  async function principal(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (equal(token, env.CAREGIVER_API_TOKEN)) return { role: 'caregiver', uid: 'nodered-caregiver', pillboxId: DEVICE };
    if (equal(token, env.VIEWER_API_TOKEN)) return { role: 'viewer', uid: 'nodered-viewer', pillboxId: DEVICE };
    try { return await getAuth(app).verifyIdToken(token, true); } catch { return null; }
  }
  const server = http.createServer(async (req, res) => {
    const respond = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/health') return respond(200, { status: 'ok', telegramConfigured: telegram.enabled && !!telegram.token && !!telegram.chatId });
      if (url.pathname.startsWith('/api/')) {
        const user = await principal(req);
        if (!canRead(user)) return respond(403, { error: 'Không có quyền truy cập' });
        if (req.method === 'GET' && url.pathname === '/api/snapshot') return respond(200, { ...snapshot, alarms: store.state.alarms });
        if (req.method === 'GET' && url.pathname === '/api/alarms') return respond(200, { alarms: store.state.alarms, events: store.state.events });
        if (!canWrite(user)) return respond(403, { error: 'Tài khoản chỉ xem không được điều khiển' });
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 8192) return respond(413, { error: 'Payload quá lớn' }); }
        const body = JSON.parse(raw || '{}');
        if (req.method === 'POST' && url.pathname === '/api/config') {
          if (!['A', 'B', 'C'].includes(body.compartmentId)) return respond(400, { error: 'Ngăn không hợp lệ' });
          const config = (await db.ref('config/compartments').get()).val();
          if (!config) return respond(409, { error: 'Hãy tạo cấu hình đủ A/B/C trên web trước' });
          const changes = {};
          if (Object.hasOwn(body, 'unitsPerDose')) changes.unitsPerDose = body.unitsPerDose;
          if (Object.hasOwn(body, 'isLoaded')) changes.isLoaded = body.isLoaded;
          if (Object.hasOwn(body, 'schedule')) changes.schedule = body.schedule;
          if (!Object.keys(changes).length) return respond(400, { error: 'Thiếu thay đổi cấu hình' });
          Object.assign(config[body.compartmentId], changes);
          validateConfig(config);
          await db.ref(`config/compartments/${body.compartmentId}`).update(changes);
          return respond(202, { state: 'pending', message: 'Đã lưu, chờ ESP32 báo cấu hình thực' });
        }
        const ack = url.pathname.match(/^\/api\/alarms\/([A-Za-z0-9-]+)\/ack$/);
        if (req.method === 'POST' && ack) {
          const changed = store.commit(s => acknowledge(s, ack[1], user, Date.now()));
          dirty = true;
          return respond(changed ? 200 : 409, { changed });
        }
        return respond(404, { error: 'Không có API này' });
      }
      if (req.method !== 'GET') return respond(405, { error: 'Method not allowed' });
      const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) return respond(404, { error: 'Not found' });
      const file = path.join(__dirname, '../dashboard', filename);
      if (!fs.existsSync(file)) return respond(404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' })[path.extname(file)] || 'text/plain', 'X-Content-Type-Options': 'nosniff' });
      fs.createReadStream(file).pipe(res);
    } catch (error) { logError(error); if (!res.headersSent) respond(400, { error: 'Yêu cầu không hợp lệ hoặc dịch vụ đang lỗi' }); }
  });
  server.listen(Number(env.API_PORT || 8787), '127.0.0.1');
  if (!server.listening) await once(server, 'listening');
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const now = Date.now();
      if (now - Math.max(startedAt, store.state.lastSeen) > 15000) {
        if (!store.state.current.DEVICE_OFFLINE || store.state.current.DEVICE_OFFLINE.state === 'CLEARED') {
          store.commit(s => applyCondition(s, 'DEVICE_OFFLINE', 'CRITICAL', now)); dirty = true;
        }
      }
      if (await dispatch(store, telegram, now)) dirty = true;
      // Delivery state is persisted locally, mirrored without bot token or chat ID.
      if (dirty) {
        await db.ref().update({ alarms: store.state.alarms, alarmEvents: store.state.events, notificationStatus: store.state.outbox });
        dirty = false;
      }
    } catch (error) { logError(error); } finally { busy = false; }
  }, 2000);
  console.log(`Dịch vụ: http://127.0.0.1:${env.API_PORT || 8787}; MQTT ${mqttConfig.port}; Telegram ${telegram.enabled ? 'bật' : 'chưa bật'}`);
  async function close() { clearInterval(timer); snapshotKeys.forEach(key => db.ref(key).off()); await bridge.close(); await broker.close(); await new Promise(resolve => server.close(resolve)); await deleteApp(app); }
  return { db, store, server, broker, close };
}
if (require.main === module) start().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { start };
