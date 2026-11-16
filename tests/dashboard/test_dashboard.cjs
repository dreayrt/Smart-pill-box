const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../../dashboard/model.js');
const accessModel = require('../../dashboard/access.js');

const now = 1794800000000;
let checks = 0;
function check(callback) { callback(); checks++; }

check(() => assert.equal(model.connection({ receivedAt: now }, true, now).online, true));
check(() => assert.equal(model.connection({ receivedAt: now - 15001, online: true }, true, now).online, false));
check(() => assert.equal(model.connection({ receivedAt: now }, false, now).online, false));
check(() => assert.equal(model.connection({ lastSeen: 42 }, true, now).online, false));
check(() => assert.equal(model.connection({ receivedAt: now + 31000 }, true, now).online, false));
check(() => assert.equal(model.connection({ lastSeen: now / 1000 }, true, now).online, true));
check(() => assert.equal(model.stateInfo('OPEN')[0], model.stateInfo('STATE_COMPARTMENT_OPEN')[0]));
check(() => assert.equal(model.stateInfo('ERROR')[0], 'Cảnh báo sự cố'));
check(() => assert.equal(model.stateInfo(undefined)[0], 'Chưa rõ trạng thái'));
const config = { compartmentId: 'A', medicineCode: 'MED-A', displayName: 'Thuốc A', schedule: '08:00', unitsPerDose: 2, isLoaded: true };
check(() => assert.equal(model.configMatches(config, { ...config, currentStock: 99 }), true));
check(() => assert.equal(model.configMatches(config, { ...config, unitsPerDose: 3 }), false));
check(() => assert.equal(model.configMatches(config, null), false));
check(() => assert.equal(model.utf8Length('Thuốc'), Buffer.byteLength('Thuốc', 'utf8')));
check(() => assert.deepEqual(model.historySamples({
  '0000': { timestamp: now / 1000 - 10 },
  '1439': { timestamp: now / 1000 - 100 },
  stale: { timestamp: now / 1000 - 90000 },
  future: { timestamp: now / 1000 + 100 }
}, 60, now).map(sample => sample.timestamp), [now / 1000 - 100, now / 1000 - 10]));

// Execute the actual app against an offline DOM/Firebase adapter.
// No live database is accessed or changed by these checks.
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    innerHTML: '', textContent: '', className: '', style: {}, children: [], value: id === 'historyRange' ? '60' : '',
    listeners: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(event, callback) { this.listeners[event] = callback; },
    appendChild(child) { this.children.push(child); }
  });
  return elements.get(id);
}
const callbacks = new Map();
const intervals = [];
let accessChanged;
let mayWrite = false;
const context = vm.createContext({
  window: { PILLBOX_FIREBASE_CONFIG: { databaseURL: 'https://unit.test' } },
  PillboxModel: model, TextEncoder, console, Date,
  PillboxAccess: { start(callback) { accessChanged = callback; }, canWrite() { return mayWrite; } },
  setInterval(callback) { intervals.push(callback); },
  alert() { throw new Error('Unexpected alert during read-only dashboard test'); },
  document: { getElementById: element, createElement() { return element(Symbol()); } },
  firebase: {
    initializeApp() {},
    database() { return { ref(key) { return {
      on(event, callback) { callbacks.set(key, callback); },
      off() { callbacks.delete(key); },
      limitToFirst() { return this; }
    }; } }; }
  }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../dashboard/app.js'), 'utf8'), context);
check(() => assert.equal(callbacks.has('deviceStatus'), false));
accessChanged({ role: 'viewer', canRead: true, canWrite: false });
check(() => assert.equal(element('btnOpenConfig').disabled, true));
check(() => assert.equal(accessModel.claimsAccess({ role: 'caregiver', pillboxId: 'another-box' }).canWrite, false));
check(() => assert.equal(accessModel.claimsAccess({ role: 'viewer', pillboxId: 'pillbox-nhom13' }).canWrite, false));
function emit(key, value) { callbacks.get(key)({ val: () => value }); }
emit('.info/connected', true);
check(() => assert.match(element('connStatusText').textContent, /Chưa có heartbeat/));
emit('deviceStatus', { receivedAt: Date.now(), currentState: 'ERROR', currentTemp: 40, currentHumid: null, activeAlarm: true });
check(() => assert.equal(element('teleState').textContent, 'Cảnh báo sự cố'));
check(() => assert.equal(element('teleHumid').textContent, '--'));
check(() => assert.equal(element('connStatusText').textContent, 'ESP32: Trực tuyến'));
emit('deviceStatus', { receivedAt: Date.now() - 20000, currentState: 'IDLE' });
intervals[0]();
check(() => assert.match(element('connStatusText').textContent, /Mất tín hiệu/));
emit('config/compartments', { A: config });
emit('reportedConfig', { compartments: { A: config } });
check(() => assert.match(element('configSyncSummary').textContent, /1\/3/));
emit('reportedConfig', { compartments: { A: { ...config, unitsPerDose: 5 } } });
check(() => assert.match(element('configSyncSummary').textContent, /0\/3/));
const timestamp = Math.floor(Date.now() / 1000);
emit('telemetryHistory', { '0010': { timestamp: timestamp - 60, temperature: 29, humidity: 50 },
  '0011': { timestamp, temperature: 30, humidity: 51 } });
check(() => assert.match(element('temperatureChart').innerHTML, /role="img"/));
check(() => assert.match(element('historySummary').textContent, /2 mẫu/));
emit('telemetryHistory', { invalid: { timestamp, temperature: null, humidity: null } });
check(() => assert.match(element('temperatureChart').innerHTML, /Chưa có mẫu hợp lệ/));
emit('events', { '<img>': { eventId: '<img src=x onerror=alert(1)>', compartmentId: '<svg>', medicineCode: '<b>', status: '<script>' } });
const row = element('eventsTableBody').children.at(-1).innerHTML;
check(() => assert.equal(row.includes('<img src=x'), false));
check(() => assert.equal(row.includes('&lt;script&gt;'), true));
emit('alarmEvents', { one:{type:'HIGH_TEMPERATURE',transition:'CLEARED',updatedAt:Date.now()} });
check(() => assert.match(element('alarmTimeline').children.at(-1).textContent,/Đã phục hồi/));
emit('notificationStatus', { one:{state:'SENT'},two:{state:'FAILED'},three:{state:'PENDING'} });
check(() => assert.match(element('notificationSummary').textContent,/1 đã gửi.*1 chờ.*1 lỗi/));
accessChanged({ canRead: false, canWrite: false });
check(() => assert.equal(callbacks.has('deviceStatus'), false));
check(() => assert.equal(element('mainDashboard').hidden, true));
console.log(`${checks} dashboard checks passed; 0 failed.`);
