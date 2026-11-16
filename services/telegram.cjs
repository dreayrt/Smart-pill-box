'use strict';
function message(job) {
  const label = job.transition === 'CLEARED' ? 'ĐÃ PHỤC HỒI' : job.transition === 'ESCALATED' ? 'CẢNH BÁO TĂNG MỨC' : 'CẢNH BÁO';
  const detail = Number.isFinite(job.details?.temperature) ? `\nNhiệt độ: ${job.details.temperature} °C` : '';
  return `${label} HỘP THUỐC\nLoại: ${job.type}\nMức: ${job.severity}${detail}\nLúc: ${new Date(job.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\nMã: ${job.alarmId}`;
}
async function sendTelegram(job, config, fetcher = fetch) {
  if (!config.enabled) return { disabled: true };
  if (!config.token || !config.chatId) throw new Error('TELEGRAM_NOT_CONFIGURED');
  let response;
  try {
    response = await fetcher(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text: message(job) }), signal: AbortSignal.timeout(10000)
    });
  } catch { throw new Error('TELEGRAM_NETWORK_ERROR'); }
  let body;
  try { body = await response.json(); } catch { throw new Error('TELEGRAM_INVALID_RESPONSE'); }
  if (!response.ok || body.ok !== true) {
    const error = new Error(`TELEGRAM_HTTP_${response.status}`);
    error.retryAfter = Math.max(0, Math.min(3600, Number(body.parameters?.retry_after) || 0));
    error.permanent = response.status === 400 || response.status === 401 || response.status === 403;
    throw error;
  }
  return { messageId: body.result.message_id };
}
async function dispatch(store, config, now = Date.now(), sender = sendTelegram) {
  if (!config.enabled) return false;
  let changed = false;
  for (const job of Object.values(store.state.outbox)) {
    if (job.state !== 'PENDING' || job.nextAttemptAt > now) continue;
    if (now - job.createdAt > 3600000) {
      store.commit(s => { s.outbox[job.id].state = 'EXPIRED'; });
      changed = true;
      continue;
    }
    try {
      const sent = await sender(job, config);
      if (sent.disabled) continue;
      store.commit(s => Object.assign(s.outbox[job.id], { state: 'SENT', sentAt: now, messageId: sent.messageId }));
      changed = true;
    } catch (error) {
      store.commit(s => {
        const pending = s.outbox[job.id];
        pending.attempts++;
        pending.lastError = /^TELEGRAM_[A-Z_0-9]+$/.test(error.message) ? error.message : 'TELEGRAM_DELIVERY_FAILED';
        pending.state = error.permanent || pending.attempts >= 8 ? 'FAILED' : 'PENDING';
        pending.nextAttemptAt = now + Math.max(error.retryAfter || 0, Math.min(300, 2 ** pending.attempts)) * 1000;
      });
      changed = true;
    }
  }
  return changed;
}
module.exports = { message, sendTelegram, dispatch };
