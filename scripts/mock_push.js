/**
 * SMART PILL BOX - MOCK PUSH SCRIPT (THÀNH VIÊN 3 - TASK 3.5)
 * Script Node.js đẩy dữ liệu mẫu vào Firebase Realtime Database
 * Chạy bằng lệnh: node scripts/mock_push.js
 */

const https = require('https');

const FIREBASE_HOST = "smart-pillbox-iot-c2775-default-rtdb.asia-southeast1.firebasedatabase.app";
const FIREBASE_AUTH = "apZoYeyyPAMeJQi7F2qzD6vx8X2XyWrQIX3eGNLN";

function sendFirebaseRequest(path, method, data) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : '';
    const options = {
      hostname: FIREBASE_HOST,
      port: 443,
      path: `${path}.json?auth=${FIREBASE_AUTH}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`[FIREBASE] ${method} ${path} -> HTTP ${res.statusCode}: ${body}`);
        resolve({ status: res.statusCode, body });
      });
    });

    req.on('error', (e) => {
      console.error(`[ERROR] Request failed: ${e.message}`);
      reject(e);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function runMockDemo() {
  console.log("=== BẮT ĐẦU CHẠY GIẢ LẬP SỰ KIỆN LÊN FIREBASE ===");
  const now = Math.floor(Date.now() / 1000);

  // 1. Cập nhật Telemetry
  console.log("\n1. Cập nhật Telemetry (/deviceStatus)...");
  await sendFirebaseRequest('/deviceStatus', 'PATCH', {
    online: true,
    lastSeen: now,
    currentTemp: 28.5,
    currentHumid: 64.0,
    currentState: "STATE_IDLE",
    activeAlarm: false
  });

  // 2. Đẩy sự kiện mẫu TC-04 (Uống đủ liều)
  const eventId = `EVT-NODE-${now}-A`;
  console.log(`\n2. Đẩy sự kiện kiểm thử TC-04 (/events/${eventId})...`);
  await sendFirebaseRequest(`/events/${eventId}`, 'PUT', {
    eventId: eventId,
    compartmentId: "A",
    medicineCode: "MED-001",
    expectedUnits: 2,
    detectedUnits: 2,
    compartmentMatch: true,
    quantityMatch: true,
    userConfirmed: true,
    status: "VERIFIED_BY_SIMULATION",
    timestamp: now
  });

  console.log("\n=== HOÀN TẤT GIẢ LẬP! KIỂM TRA WEB DASHBOARD ĐỂ XEM KẾT QUẢ ===");
}

runMockDemo();
