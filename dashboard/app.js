/**
 * HỆ THỐNG HỘP THUỐC THÔNG MINH - BẢNG ĐIỀU KHIỂN & GIÁM SÁT
 * Đồng bộ dữ liệu thời gian thực qua Firebase Realtime Database
 */

// 1. Cấu hình kết nối Firebase
const FIREBASE_CONFIG = window.PILLBOX_FIREBASE_CONFIG;

// Khởi tạo Firebase App
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.database();
const subscriptions = [];
let attachedSubscriptions = [];
function watchDatabase(key, callback, onError, limit) {
  subscriptions.push({ key, callback, onError, limit });
}
function updateAccess(access) {
  attachedSubscriptions.forEach(({ ref, callback }) => ref.off('value', callback));
  attachedSubscriptions = [];
  document.getElementById('mainDashboard').hidden = !access.canRead;
  document.getElementById('btnOpenConfig').disabled = !access.canWrite;
  document.getElementById('btnSaveConfig').disabled = !access.canWrite;
  document.getElementById('configModal').classList.remove('open');
  if (!access.canRead) {
    currentDeviceStatus = {}; currentCompartments = {}; currentInventory = {};
    pendingInventoryCommands = {}; inventoryCommandStatus = {}; reportedConfig = {}; historyNodes = {}; allEventsList = [];
    compartmentsContainer.innerHTML = ''; eventsTableBody.innerHTML = '';
    document.getElementById('alarmsList').innerHTML = '';
    document.getElementById('alarmTimeline').innerHTML = '';
    document.getElementById('notificationSummary').textContent = '';
    document.getElementById('temperatureChart').innerHTML = '';
    document.getElementById('humidityChart').innerHTML = '';
    configFormContent.innerHTML = '';
    teleTemp.textContent = teleHumid.textContent = '--';
    renderConnection(); return;
  }
  subscriptions.forEach(item => {
    let ref = db.ref(item.key);
    if (item.limit) ref = ref.limitToFirst(item.limit);
    const error = item.onError || (() => { document.getElementById('authMessage').textContent = 'Không đọc được dữ liệu. Kiểm tra quyền tài khoản và Firebase rules.'; });
    ref.on('value', item.callback, error);
    attachedSubscriptions.push({ ref, callback: item.callback });
  });
}

// State cục bộ của Dashboard
let currentCompartments = {};
let currentInventory = {};
let pendingInventoryCommands = {};
let inventoryCommandStatus = {};
let modalInitialStock = {};
let currentDeviceStatus = {};
let allEventsList = [];
let browserConnected = false;
let serverTimeOffset = 0;
let reportedConfig = {};
let historyNodes = {};

// DOM Elements - Trạng thái & Kết nối
const connStatusPill = document.getElementById('connStatusPill');
const connPulse = document.getElementById('connPulse');
const connStatusText = document.getElementById('connStatusText');

// DOM Elements - Thông số vận hành
const teleTemp = document.getElementById('teleTemp');
const teleHumid = document.getElementById('teleHumid');
const teleState = document.getElementById('teleState');
const teleAlarm = document.getElementById('teleAlarm');
const alarmIcon = document.getElementById('alarmIcon');
const tempCard = document.getElementById('tempCard');
const tempAlertHint = document.getElementById('tempAlertHint');
const humidAlertHint = document.getElementById('humidAlertHint');
const fsmDescription = document.getElementById('fsmDescription');
const alarmHint = document.getElementById('alarmHint');
const lastSeenDisplay = document.getElementById('lastSeenDisplay');

// DOM Elements - Ngăn thuốc & Nhật ký
const compartmentsContainer = document.getElementById('compartmentsContainer');
const compCountLabel = document.getElementById('compCountLabel');
const eventsTableBody = document.getElementById('eventsTableBody');
const logCountLabel = document.getElementById('logCountLabel');

// DOM Elements - Modal Cấu hình
const configModal = document.getElementById('configModal');
const btnOpenConfig = document.getElementById('btnOpenConfig');
const btnCloseConfig = document.getElementById('btnCloseConfig');
const btnCancelConfig = document.getElementById('btnCancelConfig');
const btnSaveConfig = document.getElementById('btnSaveConfig');
const configFormContent = document.getElementById('configFormContent');

// =========================================================================
// 2. GIÁM SÁT TRẠNG THÁI KẾT NỐI (CONNECTION STATUS)
// =========================================================================
db.ref('.info/connected').on('value', (snap) => {
  browserConnected = snap.val() === true;
  renderConnection();
});

db.ref('.info/serverTimeOffset').on('value', snap => {
  serverTimeOffset = Number.isFinite(snap.val()) ? snap.val() : 0;
  renderConnection();
});

function serverNow() { return Date.now() + serverTimeOffset; }

function renderConnection() {
  const status = PillboxModel.connection(currentDeviceStatus, browserConnected, serverNow());
  connPulse.className = `pulse-dot ${status.online ? 'online' : 'offline'}`;
  connStatusText.textContent = status.label;
  connStatusPill.style.borderColor = status.online ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)';
  lastSeenDisplay.classList.toggle('data-stale', !status.online);
}

// Tự phát hiện ESP32 ngừng gửi ngay cả khi không có callback Firebase mới.
setInterval(renderConnection, 1000);

// =========================================================================
// 3. LẮNG NGHE THÔNG SỐ VẬN HÀNH (/deviceStatus)
// =========================================================================
watchDatabase('deviceStatus', (snap) => {
  const data = snap.val() || {};
  currentDeviceStatus = data;
  renderConnection();

  // Nhiệt độ & Độ ẩm
  const temp = Number.isFinite(data.currentTemp) ? data.currentTemp.toFixed(1) : '--';
  const humid = Number.isFinite(data.currentHumid) ? data.currentHumid.toFixed(1) : '--';
  teleTemp.textContent = temp;
  teleHumid.textContent = humid;

  // Cảnh báo ngưỡng nhiệt độ (> 35°C)
  if (data.currentTemp && data.currentTemp > 35.0) {
    tempCard.style.borderColor = 'var(--accent-rose)';
    tempAlertHint.textContent = 'Vượt ngưỡng demo (> 35°C)';
    tempAlertHint.style.color = 'var(--accent-rose)';
  } else {
    tempCard.style.borderColor = 'var(--border-color)';
    tempAlertHint.textContent = Number.isFinite(data.currentTemp) ? 'Ngưỡng demo: 35°C; xem nhãn thuốc' : 'Chưa có mẫu nhiệt độ hợp lệ';
    tempAlertHint.style.color = 'var(--text-muted)';
  }

  // Cảnh báo ngưỡng độ ẩm (> 75%)
  if (data.currentHumid && data.currentHumid > 75.0) {
    humidAlertHint.textContent = 'Vượt ngưỡng demo (> 75%)';
    humidAlertHint.style.color = 'var(--accent-rose)';
  } else {
    humidAlertHint.textContent = Number.isFinite(data.currentHumid) ? 'Ngưỡng demo độ ẩm: 75%' : 'Chưa có mẫu độ ẩm hợp lệ';
    humidAlertHint.style.color = 'var(--text-muted)';
  }

  // Trạng thái vận hành thiết bị
  const stateStr = data.currentState;
  teleState.textContent = getFsmStateTitle(stateStr);
  fsmDescription.textContent = getFsmDescription(stateStr);

  // Cảnh báo còi / đèn
  if (data.activeAlarm) {
    teleAlarm.textContent = 'Đang phát cảnh báo';
    teleAlarm.style.color = 'var(--accent-rose)';
    alarmHint.textContent = 'Phát hiện sự cố hoặc đến cữ thuốc';
    alarmHint.style.color = 'var(--accent-rose)';
    alarmIcon.classList.add('active');
  } else {
    teleAlarm.textContent = 'Bình thường';
    teleAlarm.style.color = 'var(--text-secondary)';
    alarmHint.textContent = 'Không có cảnh báo phát sinh';
    alarmHint.style.color = 'var(--text-muted)';
    alarmIcon.classList.remove('active');
  }

  // Thời gian cập nhật gần nhất
  const receivedAt = PillboxModel.receivedTime(data);
  if (receivedAt !== null) {
    const date = new Date(receivedAt);
    lastSeenDisplay.textContent = `Cập nhật: ${date.toLocaleTimeString('vi-VN')} - ${date.toLocaleDateString('vi-VN')}`;
  } else {
    lastSeenDisplay.textContent = 'Cập nhật: Chưa nhận tín hiệu';
  }
});

function getFsmStateTitle(state) {
  return PillboxModel.stateInfo(state)[0];
}

function getFsmDescription(state) {
  return PillboxModel.stateInfo(state)[1];
}

// =========================================================================
// 4. LẮNG NGHE CẤU HÌNH CÁC NGĂN THUỐC (/config/compartments)
// =========================================================================
watchDatabase('config/compartments', (snap) => {
  const comps = snap.val() || {};
  currentCompartments = comps;
  renderCompartments(comps);
});

watchDatabase('inventory/compartments', (snap) => {
  currentInventory = snap.val() || {};
  renderCompartments(currentCompartments);
});

watchDatabase('inventoryCommands/pending', (snap) => {
  pendingInventoryCommands = snap.val() || {};
  renderCompartments(currentCompartments);
});

watchDatabase('inventoryCommands/status', (snap) => {
  inventoryCommandStatus = snap.val() || {};
  renderCompartments(currentCompartments);
});

watchDatabase('reportedConfig', snap => {
  reportedConfig = snap.val() || {};
  renderCompartments(currentCompartments);
}, error => {
  document.getElementById('configSyncSummary').textContent = 'Không đọc được xác nhận cấu hình: ' + error.message;
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function getInventorySyncLabel(compartmentId, inventoryNode) {
  const pendingForCompartment = Object.values(pendingInventoryCommands)
    .filter(command => command?.compartmentId === compartmentId);
  const status = inventoryCommandStatus[compartmentId];
  if (pendingForCompartment.length) {
    return `${pendingForCompartment.length} yêu cầu tồn kho đang chờ ESP32 xử lý`;
  }
  if (status?.state === 'pending') return 'Đang chờ ESP32 xác nhận yêu cầu chỉnh tồn kho';
  if (status?.state === 'applying') return 'ESP32 đang áp dụng yêu cầu chỉnh tồn kho';
  if (status?.state === 'rejected') return `ESP32 từ chối: ${escapeHtml(status.message || 'Dữ liệu không hợp lệ')}`;
  if (status?.state === 'applied') return `ESP32 đã xác nhận yêu cầu gần nhất (${status.appliedStock} viên)`;
  if (Number.isInteger(inventoryNode?.currentStock)) return 'Tồn kho đã được ESP32 đồng bộ';
  return 'Chưa có tồn kho được ESP32 xác nhận';
}

function renderCompartments(comps) {
  compartmentsContainer.innerHTML = '';
  const compKeys = Object.keys(comps).sort();

  compCountLabel.textContent = `${compKeys.length} ngăn chứa`;
  const confirmedCount = ['A', 'B', 'C'].filter(id =>
    PillboxModel.configMatches(comps[id], reportedConfig.compartments?.[id])).length;
  document.getElementById('configSyncSummary').textContent =
    `Cấu hình trùng với bản ESP32 báo gần nhất: ${confirmedCount}/3 ngăn. Kết nối thiết bị được theo dõi riêng ở trên.`;

  if (compKeys.length === 0) {
    compartmentsContainer.innerHTML = `
      <div class="card comp-card text-center text-muted" style="grid-column: 1/-1; padding: 32px;">
        Chưa có cấu hình ngăn thuốc. Nhấn nút "Cấu hình Lịch uống" để thiết lập.
      </div>
    `;
    return;
  }

  compKeys.forEach(key => {
    const c = comps[key];
    const card = document.createElement('div');
    const classId = `comp-${['A', 'B', 'C'].includes(key) ? key.toLowerCase() : 'a'}`;
    card.className = `card comp-card ${classId}`;

    const maxStock = 100;
    const inventoryNode = currentInventory[key] || {};
    const stock = Number.isInteger(inventoryNode.currentStock)
      ? inventoryNode.currentStock
      : (Number.isInteger(c.currentStock) ? c.currentStock : 0);
    const stockPercent = Math.min(100, Math.round((stock / maxStock) * 100));

    card.innerHTML = `
      <div class="comp-header">
        <div>
          <span class="comp-id-badge">NGĂN ${escapeHtml(c.compartmentId)}</span>
          <h3 class="comp-title">${escapeHtml(c.displayName || 'Chưa đặt tên')}</h3>
          <span class="comp-code">Mã dược phẩm: ${escapeHtml(c.medicineCode || '--')}</span>
        </div>
        <span class="badge ${c.isLoaded ? 'badge-success' : 'badge-warning'}">
          ${c.isLoaded ? 'Sẵn sàng' : 'Chưa nạp thuốc'}
        </span>
      </div>

      <div class="comp-meta-row">
        <div class="meta-item">
          <span class="meta-item-label">Thời gian uống</span>
          <span class="meta-item-val" style="color: var(--accent-cyan); font-family: var(--font-mono); font-size: 1.1rem;">
            ${escapeHtml(c.schedule || '--:--')}
          </span>
        </div>
        <div class="meta-item">
          <span class="meta-item-label">Liều chỉ định</span>
          <span class="meta-item-val">${escapeHtml(c.unitsPerDose ?? '--')} viên / lần</span>
        </div>
      </div>

      <div class="stock-meter">
        <div class="stock-meter-header">
          <span>Lượng thuốc tồn trong ngăn</span>
          <strong>${stock} viên</strong>
        </div>
        <div class="stock-progress-bar">
          <div class="stock-progress-fill" style="width: ${stockPercent}%;"></div>
        </div>
        <div class="stock-sync-state">${getInventorySyncLabel(key, inventoryNode)}</div>
        <div class="stock-sync-state">${PillboxModel.configMatches(c, reportedConfig.compartments?.[key])
          ? 'Lịch và liều khớp bản ESP32 báo gần nhất'
          : 'Lịch và liều đang chờ ESP32 áp dụng / xác nhận'}</div>
      </div>
    `;

    compartmentsContainer.appendChild(card);
  });
}

// =========================================================================
// 5. LẮNG NGHE NHẬT KÝ TUÂN THỦ DÙNG THUỐC (/events)
// =========================================================================
watchDatabase('events', (snap) => {
  const eventsData = snap.val() || {};
  allEventsList = [];

  Object.keys(eventsData).forEach(key => {
    allEventsList.push({
      _key: key,
      ...eventsData[key]
    });
  });

  // Sắp xếp phiên mới nhất lên đầu
  allEventsList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  logCountLabel.textContent = `${allEventsList.length} bản ghi`;
  renderEventsTable(allEventsList);
});

// Lịch sử lưu bằng vòng 1440 ô; luôn sắp xếp theo timestamp, không theo mã ô.
watchDatabase('telemetryHistory', snap => {
  historyNodes = snap.val() || {};
  renderHistory();
}, error => {
  document.getElementById('historySummary').textContent = 'Không đọc được lịch sử: ' + error.message;
}, 1440);
document.getElementById('historyRange').addEventListener('change', renderHistory);
setInterval(renderHistory, 60000);

function renderHistory() {
  const minutes = Number(document.getElementById('historyRange').value);
  const now = serverNow();
  const samples = PillboxModel.historySamples(historyNodes, minutes, now);
  const validCount = samples.filter(s => Number.isFinite(s.temperature) && Number.isFinite(s.humidity)).length;
  document.getElementById('historySummary').textContent =
    `${samples.length} mẫu trong khoảng xem, ${validCount} mẫu đủ nhiệt độ và độ ẩm. Lưu tối đa 1440 mẫu, một mẫu/phút khi có mạng và giờ hợp lệ.`;
  renderSensorChart('temperatureChart', 'Nhiệt độ', '°C', 'temperature', samples, minutes, now, '#22d3ee');
  renderSensorChart('humidityChart', 'Độ ẩm', '%', 'humidity', samples, minutes, now, '#a78bfa');
}

function renderSensorChart(elementId, title, unit, field, samples, minutes, now, color) {
  const element = document.getElementById(elementId);
  const valid = samples.filter(sample => Number.isFinite(sample[field]));
  if (!valid.length) {
    element.innerHTML = `<h3>${title} (${unit})</h3><p class="text-muted">Chưa có mẫu hợp lệ trong khoảng xem.</p>`;
    return;
  }
  const values = valid.map(sample => sample[field]);
  const low = Math.floor(Math.min(...values) - 1);
  const high = Math.ceil(Math.max(...values) + 1);
  const start = now - minutes * 60000;
  const x = sample => 52 + Math.min(1, Math.max(0, (sample.timestamp * 1000 - start) / (minutes * 60000))) * 630;
  const y = sample => 170 - ((sample[field] - low) / (high - low)) * 140;
  let path = '';
  let previous = null;
  samples.forEach(sample => {
    if (!Number.isFinite(sample[field])) { previous = null; return; }
    const connected = previous && sample.timestamp - previous.timestamp <= 120;
    path += `${connected ? 'L' : 'M'}${x(sample).toFixed(1)},${y(sample).toFixed(1)} `;
    previous = sample;
  });
  const clock = value => new Date(value).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
  element.innerHTML = `<h3>${title} (${unit})</h3>
    <svg viewBox="0 0 720 210" role="img" aria-label="Biểu đồ ${title.toLowerCase()} trong ${minutes} phút">
      <path d="M52 30V170H682" fill="none" stroke="#64748b"/>
      <text x="44" y="35" text-anchor="end">${high}</text><text x="44" y="174" text-anchor="end">${low}</text>
      <text x="52" y="198">${clock(start)}</text><text x="682" y="198" text-anchor="end">${clock(now)} UTC+7</text>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>
      ${valid.map(sample => `<circle cx="${x(sample).toFixed(1)}" cy="${y(sample).toFixed(1)}" r="2" fill="${color}"><title>${clock(sample.timestamp * 1000)}: ${sample[field].toFixed(1)} ${unit}</title></circle>`).join('')}
    </svg>`;
}

function renderEventsTable(events) {
  if (events.length === 0) {
    eventsTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted" style="padding: 32px;">
          Chưa có dữ liệu phiên uống thuốc nào được ghi nhận.
        </td>
      </tr>
    `;
    return;
  }

  eventsTableBody.innerHTML = '';
  events.forEach(ev => {
    const tr = document.createElement('tr');
    
    // Định dạng thời gian
    let timeFormatted = '--';
    if (ev.timestamp) {
      const d = new Date(ev.timestamp * 1000);
      timeFormatted = `${d.toLocaleTimeString('vi-VN')} ${d.toLocaleDateString('vi-VN')}`;
    }

    // Badge kết quả đánh giá
    const statusBadge = getEvaluationBadge(ev.status, ev.quantityMatch);

    // Xác nhận thao tác người bệnh
    const userActionBadge = ev.userConfirmed 
      ? `<span class="badge badge-success">Đã bấm xác nhận</span>`
      : `<span class="badge badge-warning">Chưa bấm xác nhận</span>`;

    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-size: 0.8rem;">${timeFormatted}</td>
      <td style="font-family: var(--font-mono); font-size: 0.76rem; color: var(--text-muted);">${escapeHtml(ev.eventId || ev._key)}</td>
      <td><strong>Ngăn ${escapeHtml(ev.compartmentId || '--')}</strong></td>
      <td style="font-family: var(--font-mono);">${escapeHtml(ev.medicineCode || '--')}</td>
      <td>${ev.expectedUnits !== undefined ? escapeHtml(ev.expectedUnits) + ' viên' : '--'}</td>
      <td style="font-weight: 700; color: ${ev.quantityMatch ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
        ${ev.detectedUnits !== undefined ? escapeHtml(ev.detectedUnits) + ' viên' : '--'}
      </td>
      <td>${userActionBadge}</td>
      <td>${statusBadge}</td>
    `;
    eventsTableBody.appendChild(tr);
  });
}

function getEvaluationBadge(status, match) {
  if (status === 'VERIFIED_BY_SIMULATION' || match === true) {
    return `<span class="badge badge-success">Đúng liều lượng</span>`;
  }
  if (status === 'MISMATCH_LESS') {
    return `<span class="badge badge-danger">Lấy thiếu liều</span>`;
  }
  if (status === 'MISMATCH_MORE') {
    return `<span class="badge badge-danger">Lấy quá liều</span>`;
  }
  if (status === 'NO_DETECTION' || status === 'USER_ONLY') {
    return `<span class="badge badge-warning">Không phát hiện lấy thuốc</span>`;
  }
  if (status === 'MISSED_DOSE') {
    return `<span class="badge badge-danger">Bỏ lỡ cữ thuốc</span>`;
  }
  return `<span class="badge badge-info">${escapeHtml(status || 'Đã ghi nhận')}</span>`;
}

// =========================================================================
// 6. CẤU HÌNH LỊCH TRÌNH TỪ XA (REMOTE CONFIGURATION MODAL)
// =========================================================================
btnOpenConfig.addEventListener('click', () => {
  if (!PillboxAccess.canWrite()) return;
  renderConfigModalForm();
  configModal.classList.add('open');
});

btnCloseConfig.addEventListener('click', () => configModal.classList.remove('open'));
btnCancelConfig.addEventListener('click', () => configModal.classList.remove('open'));

function renderConfigModalForm() {
  const comps = currentCompartments;
  const keys = ['A', 'B', 'C'];
  let html = '';
  modalInitialStock = {};

  keys.forEach(k => {
    const c = comps[k] || {
      compartmentId: k,
      displayName: `Thuốc Ngăn ${k}`,
      medicineCode: `MED-00${k === 'A' ? 1 : k === 'B' ? 2 : 3}`,
      unitsPerDose: 1,
      schedule: k === 'A' ? '08:00' : k === 'B' ? '12:00' : '20:00',
      currentStock: k === 'A' ? 10 : k === 'B' ? 20 : 15,
      isLoaded: true
    };
    const stock = Number.isInteger(currentInventory[k]?.currentStock)
      ? currentInventory[k].currentStock
      : (Number.isInteger(c.currentStock) ? c.currentStock : 0);
    modalInitialStock[k] = stock;

    html += `
      <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <h4 style="color: var(--accent-cyan); margin-bottom: 12px;">Cấu hình Ngăn ${k}</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label>Tên Thuốc Chỉ Định</label>
            <input type="text" class="form-control" id="cfg_name_${k}" value="${escapeHtml(c.displayName || '')}">
          </div>
          <div class="form-group">
            <label>Mã Dược Phẩm</label>
            <input type="text" class="form-control" id="cfg_code_${k}" value="${escapeHtml(c.medicineCode || '')}">
          </div>
          <div class="form-group">
            <label>Giờ Uống Thuốc (HH:MM)</label>
            <input type="time" class="form-control" id="cfg_time_${k}" value="${escapeHtml(c.schedule || '08:00')}">
          </div>
          <div class="form-group">
            <label>Liều Lượng (viên / lần)</label>
            <input type="number" min="1" max="10" class="form-control" id="cfg_dose_${k}" value="${c.unitsPerDose || 1}">
          </div>
          <div class="form-group">
            <label>Số Lượng Tồn Kho (viên)</label>
            <input type="number" min="0" max="100" class="form-control" id="cfg_stock_${k}" value="${stock}">
          </div>
          <div class="form-group">
            <label>Trạng Thái Nạp Thuốc</label>
            <select class="form-control" id="cfg_loaded_${k}">
              <option value="true" ${c.isLoaded ? 'selected' : ''}>Đã nạp (Sẵn sàng)</option>
              <option value="false" ${!c.isLoaded ? 'selected' : ''}>Chưa nạp thuốc</option>
            </select>
          </div>
        </div>
      </div>
    `;
  });

  configFormContent.innerHTML = html;
}

btnSaveConfig.addEventListener('click', async () => {
  if (!PillboxAccess.canWrite()) { alert('Tài khoản không có quyền thay đổi cấu hình.'); return; }
  btnSaveConfig.disabled = true;
  btnSaveConfig.textContent = 'Đang lưu dữ liệu...';

  const updates = {};
  let stockCommandCount = 0;
  let validationError = '';
  ['A', 'B', 'C'].forEach(k => {
    const displayName = document.getElementById(`cfg_name_${k}`).value.trim();
    const medicineCode = document.getElementById(`cfg_code_${k}`).value.trim();
    const schedule = document.getElementById(`cfg_time_${k}`).value;
    const unitsPerDose = Number(document.getElementById(`cfg_dose_${k}`).value);
    const stockText = document.getElementById(`cfg_stock_${k}`).value.trim();
    const currentStock = stockText === '' ? NaN : Number(stockText);
    const isLoaded = document.getElementById(`cfg_loaded_${k}`).value === 'true';

    if (!displayName || PillboxModel.utf8Length(displayName) > 31) validationError = `Tên thuốc ngăn ${k} phải có 1–31 byte UTF-8 (chữ có dấu dùng nhiều byte).`;
    else if (!medicineCode || PillboxModel.utf8Length(medicineCode) > 15) validationError = `Mã thuốc ngăn ${k} phải có 1–15 byte UTF-8.`;
    else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule)) validationError = `Giờ uống ngăn ${k} không hợp lệ.`;
    else if (!Number.isInteger(unitsPerDose) || unitsPerDose < 1 || unitsPerDose > 10) validationError = `Liều ngăn ${k} phải từ 1 đến 10 viên.`;
    else if (!Number.isInteger(currentStock) || currentStock < 0 || currentStock > 100) validationError = `Tồn kho ngăn ${k} phải từ 0 đến 100 viên.`;

    const updatedConfig = {
      compartmentId: k,
      displayName,
      medicineCode,
      schedule,
      unitsPerDose,
      isLoaded
    };

    Object.entries(updatedConfig).forEach(([field, value]) => {
      updates[`config/compartments/${k}/${field}`] = value;
    });

    // Chỉ gửi lệnh tồn kho khi người dùng thật sự đổi số trong form.
    // Giá trị ban đầu được chụp lúc mở modal để tránh gửi nhầm dữ liệu cũ.
    if (Number.isInteger(currentStock) && currentStock !== modalInitialStock[k]) {
      const commandRef = db.ref('inventoryCommands/pending').push();
      const commandId = commandRef.key;
      updates[`inventoryCommands/pending/${commandId}`] = {
        commandId,
        compartmentId: k,
        targetStock: currentStock,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };
      updates[`inventoryCommands/status/${k}`] = {
        commandId,
        compartmentId: k,
        state: 'pending',
        targetStock: currentStock,
        message: 'Đang chờ ESP32 xác nhận.',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      };
      stockCommandCount++;
    }
  });

  if (validationError) {
    alert(validationError);
    btnSaveConfig.disabled = false;
    btnSaveConfig.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Lưu thay đổi
    `;
    return;
  }

  try {
    await db.ref().update(updates);
    const stockMessage = stockCommandCount
      ? ` Đã gửi ${stockCommandCount} yêu cầu chỉnh tồn kho; Dashboard sẽ cập nhật khi ESP32 xác nhận.`
      : '';
    alert(`Cấu hình đã được lưu lên Firebase.${stockMessage} Việc lưu thành công chưa có nghĩa là ESP32 đã áp dụng cấu hình lịch.`);
    configModal.classList.remove('open');
  } catch (err) {
    alert('Lỗi cập nhật cấu hình: ' + err.message);
  } finally {
    btnSaveConfig.disabled = false;
    btnSaveConfig.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Lưu thay đổi
    `;
  }
});

watchDatabase('alarms', snap => {
  const list = document.getElementById('alarmsList');
  list.innerHTML = '';
  const alarms = Object.values(snap.val() || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 100);
  if (!alarms.length) { list.textContent = 'Chưa có cảnh báo.'; return; }
  alarms.forEach(alarm => {
    const row = document.createElement('div');
    row.className = 'alarm-row';
    const severity = alarm.severity === 'CRITICAL' ? 'Khẩn cấp' : 'Cảnh báo';
    const state = { ACTIVE: 'Đang mở', ACKNOWLEDGED: 'Đã xác nhận', CLEARED: 'Đã phục hồi' }[alarm.state] || 'Không rõ';
    row.innerHTML = `<div><strong>${escapeHtml(alarm.type)}</strong> • ${severity} • ${state}<br><small>${escapeHtml(new Date(alarm.updatedAt).toLocaleString('vi-VN'))}</small></div>`;
    if (alarm.state === 'ACTIVE' && PillboxAccess.canWrite()) {
      const button = document.createElement('button');
      button.className = 'btn btn-outline'; button.textContent = 'Xác nhận đã xem';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const response = await fetch(`/api/alarms/${encodeURIComponent(alarm.alarmId)}/ack`, { method: 'POST',
            headers: { Authorization: `Bearer ${await PillboxAccess.token()}`, 'Content-Type': 'application/json' }, body: '{}' });
          if (!response.ok) throw new Error('ACK_FAILED');
        } catch { alert('Chưa xác nhận được cảnh báo. Kiểm tra dịch vụ nền và quyền truy cập.'); button.disabled = false; }
      });
      row.appendChild(button);
    }
    list.appendChild(row);
  });
});
watchDatabase('alarmEvents', snap => {
  const timeline = document.getElementById('alarmTimeline');
  timeline.innerHTML = '';
  const entries = Object.values(snap.val() || {}).sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0,50);
  if (!entries.length) { timeline.textContent = 'Chưa có chuyển trạng thái.'; return; }
  const transitions = { OPENED:'Mở cảnh báo', ESCALATED:'Tăng mức', ACKNOWLEDGED:'Đã xác nhận xem', CLEARED:'Đã phục hồi' };
  entries.forEach(entry => {
    const row = document.createElement('div'); row.className = 'alarm-row';
    row.textContent = `${new Date(entry.updatedAt).toLocaleString('vi-VN')} • ${entry.type} • ${transitions[entry.transition] || entry.transition}`;
    timeline.appendChild(row);
  });
});
watchDatabase('notificationStatus', snap => {
  const jobs = Object.values(snap.val() || {});
  const count = state => jobs.filter(job => job.state === state).length;
  document.getElementById('notificationSummary').textContent = jobs.length
    ? `Telegram: ${count('SENT')} đã gửi • ${count('PENDING')} chờ gửi/cấu hình • ${count('FAILED')} lỗi • ${count('EXPIRED')} hết hạn.`
    : 'Chưa có bản ghi gửi thông báo Telegram.';
});
PillboxAccess.start(updateAccess);
