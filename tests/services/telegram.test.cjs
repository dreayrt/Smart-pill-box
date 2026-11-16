const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sendTelegram, dispatch } = require('../../services/telegram.cjs');
const { emptyState, applyCondition } = { ...require('../../services/store.cjs'), ...require('../../services/domain.cjs') };
function fakeStore() { return { state: emptyState(), commit(fn) { return fn(this.state); } }; }
test('Telegram request contains destination and safe plain text', async () => {
  let request;
  const result = await sendTelegram({ type: 'HIGH_TEMPERATURE', severity: 'CRITICAL', alarmId: 'a', transition: 'OPENED', createdAt: 1794800000000 },
    { enabled: true, token: 'not-a-real-token', chatId: '-123' }, async (url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 7 } }) };
    });
  assert.equal(request.chat_id, '-123'); assert.match(request.text, /CẢNH BÁO/); assert.equal(result.messageId, 7);
});
test('429 retry_after is honored and no duplicate job is generated', async () => {
  const store = fakeStore(); applyCondition(store.state, 'DEVICE_OFFLINE', 'CRITICAL', 1000);
  await dispatch(store, { enabled: true }, 1000, async () => { const e = new Error('TELEGRAM_HTTP_429'); e.retryAfter = 30; throw e; });
  const job = Object.values(store.state.outbox)[0];
  assert.equal(job.nextAttemptAt, 31000); assert.equal(job.attempts, 1);
  let calls = 0;
  await dispatch(store, { enabled: true }, 2000, async () => { calls++; });
  assert.equal(calls, 0);
  await dispatch(store, { enabled: true }, 31000, async () => ({ messageId: 9 }));
  assert.equal(job.state, 'SENT');
});
test('disabled delivery does not pretend success; permanent failures and expiry are explicit', async () => {
  const store = fakeStore(); applyCondition(store.state, 'DEVICE_OFFLINE', 'CRITICAL', 1);
  const job = Object.values(store.state.outbox)[0];
  await dispatch(store, { enabled: false }, 2); assert.equal(job.state, 'PENDING');
  await dispatch(store, { enabled: true }, 3, async () => { const e = new Error('TELEGRAM_HTTP_403'); e.permanent = true; throw e; });
  assert.equal(job.state, 'FAILED');
  applyCondition(store.state, 'DEVICE_OFFLINE', 'NORMAL', 4);
  await dispatch(store, { enabled: true }, 3600005, async () => { throw new Error('must not send'); });
  assert.equal(Object.values(store.state.outbox)[1].state, 'EXPIRED');
});
