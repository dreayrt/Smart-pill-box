/**
 * HỆ THỐNG HỘP THUỐC THÔNG MINH - BẢNG ĐIỀU KHIỂN & GIÁM SÁT
 * Đồng bộ dữ liệu thời gian thực qua Firebase Realtime Database
 */

// 1. Cấu hình kết nối Firebase
const FIREBASE_CONFIG = {
  databaseURL: "https://smart-pillbox-iot-c2775-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Khởi tạo Firebase App
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.database();

// State cục bộ của Dashboard
let currentCompartments = {};
let currentInventory = {};
let pendingInventoryCommands = {};
let inventoryCommandStatus = {};
let modalInitialStock = {};
let currentDeviceStatus = {};
let allEventsList = [];

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
  const isOnline = snap.val() === true;
  if (isOnline) {
    connPulse.className = 'pulse-dot online';
    connStatusText.textContent = 'Hệ thống: Trực tuyến';
    connStatusPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  } else {
    connPulse.className = 'pulse-dot offline';
    connStatusText.textContent = 'Hệ thống: Mất kết nối';
    connStatusPill.style.borderColor = 'rgba(244, 63, 94, 0.4)';
  }
});

// =========================================================================
// 3. LẮNG NGHE THÔNG SỐ VẬN HÀNH (/deviceStatus)
// =========================================================================
db.ref('deviceStatus').on('value', (snap) => {
  const data = snap.val() || {};
  currentDeviceStatus = data;

  // Nhiệt độ & Độ ẩm
  const temp = (typeof data.currentTemp === 'number') ? data.currentTemp.toFixed(1) : '--';
  const humid = (typeof data.currentHumid === 'number') ? data.currentHumid.toFixed(1) : '--';
  teleTemp.textContent = temp;
  teleHumid.textContent = humid;

  // Cảnh báo ngưỡng nhiệt độ (> 35°C)
  if (data.currentTemp && data.currentTemp > 35.0) {
    tempCard.style.borderColor = 'var(--accent-rose)';
    tempAlertHint.textContent = 'Cảnh báo: Vượt ngưỡng an toàn (> 35°C)';
    tempAlertHint.style.color = 'var(--accent-rose)';
  } else {
    tempCard.style.borderColor = 'var(--border-color)';
    tempAlertHint.textContent = 'Tiêu chuẩn bảo quản: < 35°C';
    tempAlertHint.style.color = 'var(--text-muted)';
  }

  // Cảnh báo ngưỡng độ ẩm (> 75%)
  if (data.currentHumid && data.currentHumid > 75.0) {
    humidAlertHint.textContent = 'Cảnh báo: Vượt ngưỡng độ ẩm (> 75%)';
    humidAlertHint.style.color = 'var(--accent-rose)';
  } else {
    humidAlertHint.textContent = 'Tiêu chuẩn bảo quản: < 75%';
    humidAlertHint.style.color = 'var(--text-muted)';
  }

  // Trạng thái vận hành thiết bị
  const stateStr = data.currentState || 'STATE_IDLE';
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
  if (data.lastSeen) {
    const date = new Date(data.lastSeen * 1000);
    lastSeenDisplay.textContent = `Cập nhật: ${date.toLocaleTimeString('vi-VN')} - ${date.toLocaleDateString('vi-VN')}`;
  } else {
    lastSeenDisplay.textContent = 'Cập nhật: Chưa nhận tín hiệu';
  }
});

function getFsmStateTitle(state) {
  switch (state) {
    case 'STATE_IDLE': return 'Chờ cữ thuốc';
    case 'STATE_REMINDER': return 'Đang báo giờ uống';
    case 'STATE_SNOOZED': return 'Đang tạm hoãn';
    case 'STATE_COMPARTMENT_OPEN': return 'Đang mở ngăn';
    case 'STATE_VERIFYING': return 'Đang kiểm tra';
    case 'STATE_VERIFIED': return 'Đã lấy đủ liều';
    case 'STATE_ERROR': return 'Cảnh báo sự cố';
    case 'STATE_CLOSED': return 'Đã đóng nắp';
    default: return state;
  }
}

function getFsmDescription(state) {
  switch (state) {
    case 'STATE_IDLE': return 'Hộp thuốc ở chế độ chờ cữ tiếp theo';
    case 'STATE_REMINDER': return 'Hệ thống đang phát chuông và đèn nhắc nhở';
    case 'STATE_SNOOZED': return 'Người bệnh tạm hoãn, sẽ nhắc lại sau 5 phút';
    case 'STATE_COMPARTMENT_OPEN': return 'Nắp ngăn đang mở, chờ lấy thuốc';
    case 'STATE_VERIFYING': return 'Đang đối chiếu số lượng thuốc lấy ra';
    case 'STATE_VERIFIED': return 'Đã xác nhận lấy đúng và đủ liều chỉ định';
    case 'STATE_ERROR': return 'Phát hiện lấy sai liều hoặc quá thời gian chờ';
    case 'STATE_CLOSED': return 'Đã khóa nắp ngăn để bảo quản thuốc';
    default: return 'Thiết bị hoạt động bình thường';
  }
}

// =========================================================================
// 4. LẮNG NGHE CẤU HÌNH CÁC NGĂN THUỐC (/config/compartments)
// =========================================================================
db.ref('config/compartments').on('value', (snap) => {
  const comps = snap.val() || {};
  currentCompartments = comps;
  renderCompartments(comps);
});

db.ref('inventory/compartments').on('value', (snap) => {
  currentInventory = snap.val() || {};
  renderCompartments(currentCompartments);
});

db.ref('inventoryCommands/pending').on('value', (snap) => {
  pendingInventoryCommands = snap.val() || {};
  renderCompartments(currentCompartments);
});

db.ref('inventoryCommands/status').on('value', (snap) => {
  inventoryCommandStatus = snap.val() || {};
  renderCompartments(currentCompartments);
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
    const classId = `comp-${c.compartmentId ? c.compartmentId.toLowerCase() : 'a'}`;
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
          <span class="comp-id-badge">NGĂN ${c.compartmentId}</span>
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
          <span class="meta-item-val">${c.unitsPerDose || 1} viên / lần</span>
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
      </div>
    `;

    compartmentsContainer.appendChild(card);
  });
}

// =========================================================================
// 5. LẮNG NGHE NHẬT KÝ TUÂN THỦ DÙNG THUỐC (/events)
// =========================================================================
db.ref('events').on('value', (snap) => {
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
      <td style="font-family: var(--font-mono); font-size: 0.76rem; color: var(--text-muted);">${ev.eventId || ev._key}</td>
      <td><strong>Ngăn ${ev.compartmentId || '--'}</strong></td>
      <td style="font-family: var(--font-mono);">${ev.medicineCode || '--'}</td>
      <td>${ev.expectedUnits !== undefined ? ev.expectedUnits + ' viên' : '--'}</td>
      <td style="font-weight: 700; color: ${ev.quantityMatch ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
        ${ev.detectedUnits !== undefined ? ev.detectedUnits + ' viên' : '--'}
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
  return `<span class="badge badge-info">${status || 'Đã ghi nhận'}</span>`;
}

// =========================================================================
// 6. CẤU HÌNH LỊCH TRÌNH TỪ XA (REMOTE CONFIGURATION MODAL)
// =========================================================================
btnOpenConfig.addEventListener('click', () => {
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

    if (!displayName || displayName.length > 31) validationError = `Tên thuốc ngăn ${k} phải có 1–31 ký tự.`;
    else if (!medicineCode || medicineCode.length > 15) validationError = `Mã thuốc ngăn ${k} phải có 1–15 ký tự.`;
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
