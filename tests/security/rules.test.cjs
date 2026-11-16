const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { ref, get, set, update } = require('firebase/database');
let env;
const projectId = 'demo-pillbox';
const claims = role => ({ role, pillboxId: 'pillbox-nhom13' });
const config = Object.fromEntries(['A','B','C'].map(id => [id, { compartmentId: id, medicineCode: 'MED-' + id, displayName: 'Medicine ' + id, unitsPerDose: 1, schedule: '08:00', isLoaded: true }]));
before(async () => {
  env = await initializeTestEnvironment({ projectId, database: { host: '127.0.0.1', port: 9000, rules: fs.readFileSync('database.rules.json', 'utf8') } });
  await env.withSecurityRulesDisabled(async ctx => { await set(ref(ctx.database()), { config: { compartments: config }, deviceStatus: { currentTemp: 22 } }); });
});
after(async () => { if (env) await env.cleanup(); });
test('anonymous and a user without claims cannot read the pillbox', async () => {
  await assertFails(get(ref(env.unauthenticatedContext().database(), 'deviceStatus')));
  await assertFails(get(ref(env.authenticatedContext('unassigned').database(), 'deviceStatus')));
  await assertFails(get(ref(env.authenticatedContext('other', { role: 'admin', pillboxId: 'another' }).database(), 'deviceStatus')));
});
test('viewer can read but direct SDK writes are denied at database', async () => {
  const db = env.authenticatedContext('viewer', claims('viewer')).database();
  await assertSucceeds(get(ref(db, 'deviceStatus')));
  await assertFails(set(ref(db, 'config/compartments/A/unitsPerDose'), 5));
  await assertFails(set(ref(db, 'inventoryCommands/pending/forged'), { commandId: 'forged', compartmentId: 'A', targetStock: 30, createdAt: Date.now() }));
  await assertFails(set(ref(db, 'roles/viewer'), 'admin'));
  await assertFails(set(ref(db, 'alarms/forged/state'), 'CLEARED'));
});
test('caregiver config validates range, schema and required compartments', async () => {
  const db = env.authenticatedContext('care', claims('caregiver')).database();
  await assertSucceeds(set(ref(db, 'config/compartments/A/unitsPerDose'), 3));
  await assertFails(set(ref(db, 'config/compartments/A/unitsPerDose'), 0));
  await assertFails(set(ref(db, 'config/compartments/A/schedule'), '25:99'));
  await assertFails(set(ref(db, 'config/compartments/A/injected'), true));
  await assertFails(set(ref(db, 'config/compartments/A'), null));
  await assertFails(set(ref(db, 'config/compartments'), null));
});
test('caregiver may create stock requests but cannot alter or forge device ACK', async () => {
  const db = env.authenticatedContext('care', claims('caregiver')).database();
  const request = { commandId: 'cmd-test', compartmentId: 'A', targetStock: 30, createdAt: Date.now() };
  await assertSucceeds(set(ref(db, 'inventoryCommands/pending/cmd-test'), request));
  await assertFails(update(ref(db, 'inventoryCommands/pending/cmd-test'), { targetStock: 40 }));
  await assertFails(set(ref(db, 'inventory/compartments/A/currentStock'), 99));
  await assertFails(set(ref(db, 'reportedConfig/compartments/A/unitsPerDose'), 9));
  await assertFails(set(ref(db, 'inventoryCommands/status/A'), { state: 'applied' }));
  assert.equal((await get(ref(db, 'config/compartments/A/unitsPerDose'))).val(), 3);
});
