const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { io } = require('socket.io-client');
const { flows } = require('../../services/nodered/flows.cjs');
test('actual Node-RED dashboard gates HTTP and WebSocket with role-specific credentials', { timeout: 30000 }, async () => {
  assert.equal(flows('viewer').some(n => ['ui-slider','ui-switch'].includes(n.type)), false);
  assert.equal(flows('caregiver').filter(n => ['ui-slider','ui-switch'].includes(n.type)).length, 2);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pillbox-nodered-'));
  const api = http.createServer((req, res) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ deviceStatus: { currentTemp: 29, currentHumid: 50, receivedAt: Date.now(), currentState: 'IDLE' } })); });
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  let child;
  try {
    child = spawn(process.execPath, ['services/nodered/start.cjs','viewer'], { cwd: path.join(__dirname,'../..'),
      env: { ...process.env, API_PORT: String(api.address().port), NODERED_VIEWER_PASSWORD:'test-viewer', NODERED_ADMIN_PASSWORD:'test-admin',
        VIEWER_API_TOKEN:'test-read', CAREGIVER_API_TOKEN:'not-for-viewers', PILLBOX_NODERED_USER_DIR: directory }, windowsHide: true });
    let output = '';
    const ready = new Promise((resolve, reject) => {
      child.stdout.on('data', data => { output += data; if (output.includes('Node-RED viewer:')) resolve(); });
      child.stderr.on('data', data => { output += data; });
      child.once('exit', code => reject(new Error('Node-RED exit ' + code + ': ' + output.slice(-1000))));
    });
    await ready;
    const base = 'http://127.0.0.1:1880';
    assert.equal((await fetch(base+'/dashboard/_setup')).status, 401);
    const auth = 'Basic '+Buffer.from('viewer:test-viewer').toString('base64');
    assert.equal((await fetch(base+'/dashboard/_setup', { headers:{Authorization:auth} })).status, 200);
    assert.equal((await fetch(base+'/dashboard/pillbox', { headers:{Authorization:auth} })).status, 200);
    assert.equal((await fetch(base+'/dashboard/_setup', { headers:{Authorization:'Basic '+Buffer.from('caregiver:wrong').toString('base64')} })).status, 401);
    const denied = io(base, { path:'/dashboard/socket.io', reconnection:false, timeout:3000 });
    try { const [error] = await once(denied,'connect_error'); assert.match(error.message,/Authentication|xhr|Unauthorized/i); } finally { denied.close(); }
    const accepted = io(base, { path:'/dashboard/socket.io', reconnection:false, timeout:3000, extraHeaders:{Authorization:auth} });
    try { await once(accepted,'connect'); assert.equal(accepted.connected,true); } finally { accepted.close(); }
  } finally {
    if(child) { const ended = once(child,'exit'); child.kill(); await ended; }
    await new Promise(resolve => api.close(resolve));
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
