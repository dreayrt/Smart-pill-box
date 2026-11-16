/* Shared data contract, also exercised by the offline dashboard tests. */
(function (root) {
  'use strict';
  const states = {
    IDLE: ['Chờ cữ thuốc', 'Hộp thuốc ở chế độ chờ cữ tiếp theo'],
    REMINDER: ['Đang báo giờ uống', 'Hệ thống đang phát chuông và đèn nhắc nhở'],
    SNOOZED: ['Đang tạm hoãn', 'Người bệnh tạm hoãn, sẽ nhắc lại sau 5 phút'],
    OPEN: ['Đang mở ngăn', 'Nắp ngăn đang mở, chờ lấy thuốc'],
    VERIFYING: ['Đang kiểm tra', 'Đang đối chiếu số lượng thuốc lấy ra'],
    VERIFIED: ['Đã lấy đủ liều', 'Đã ghi nhận lấy đủ số viên theo cấu hình'],
    ERROR: ['Cảnh báo sự cố', 'Phát hiện lấy sai số lượng hoặc quá thời gian chờ'],
    CLOSED: ['Đã đóng nắp', 'Đã phát lệnh khóa nắp ngăn']
  };
  const configFields = ['compartmentId', 'medicineCode', 'displayName', 'schedule', 'unitsPerDose', 'isLoaded'];

  function stateInfo(value) {
    const state = String(value || '').replace(/^STATE_/, '').replace(/^COMPARTMENT_OPEN$/, 'OPEN');
    return states[state] || ['Chưa rõ trạng thái', 'Chưa nhận được trạng thái hợp lệ từ ESP32'];
  }

  function receivedTime(data) {
    // receivedAt is server milliseconds; lastSeen is device Unix seconds.
    if (Number.isFinite(data?.receivedAt) && data.receivedAt >= 1704067200000) return data.receivedAt;
    if (Number.isFinite(data?.lastSeen) && data.lastSeen >= 1704067200) return data.lastSeen * 1000;
    return null;
  }

  function connection(data, browserConnected, nowMs) {
    if (!browserConnected) return { online: false, label: 'Web: Mất kết nối Firebase' };
    const timestamp = receivedTime(data);
    if (timestamp === null) return { online: false, label: 'ESP32: Chưa có heartbeat hợp lệ' };
    const age = nowMs - timestamp;
    const online = data.online !== false && age >= -30000 && age <= 15000;
    return { online, label: online ? 'ESP32: Trực tuyến' : 'ESP32: Mất tín hiệu / dữ liệu cũ' };
  }

  function configMatches(desired, reported) {
    return !!desired && !!reported && configFields.every(field => desired[field] === reported[field]);
  }

  function historySamples(nodes, minutes, nowMs) {
    return Object.values(nodes || {}).filter(sample =>
      sample && Number.isFinite(sample.timestamp) &&
      sample.timestamp * 1000 >= nowMs - minutes * 60000 &&
      sample.timestamp * 1000 <= nowMs + 30000
    ).sort((a, b) => a.timestamp - b.timestamp);
  }

  function utf8Length(value) { return new TextEncoder().encode(value).length; }

  const model = { stateInfo, receivedTime, connection, configMatches, historySamples, utf8Length };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.PillboxModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this);
