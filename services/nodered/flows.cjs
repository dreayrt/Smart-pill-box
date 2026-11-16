'use strict';
function flows(mode) {
  const care = mode === 'caregiver';
  const tab = 'pillbox-flow';
  const splitFunction = `if(msg.statusCode!==200)return null;
const d=msg.payload.deviceStatus||{};
const reported=msg.payload.reportedConfig?.compartments?.A;
const desired=msg.payload['config/compartments']?.A;
const matches=reported&&desired&&['unitsPerDose','isLoaded','schedule','medicineCode','displayName'].every(k=>reported[k]===desired[k]);
const fresh=Number.isFinite(d.receivedAt)&&Date.now()-d.receivedAt<15000;
const last=context.get('last');
const point=Number.isFinite(d.currentTemp)&&d.receivedAt!==last?{payload:d.currentTemp,topic:'Nhiệt độ',timestamp:d.receivedAt}:null;
context.set('last',d.receivedAt);
const output=[{payload:Number.isFinite(d.currentTemp)?d.currentTemp:null},{payload:Number.isFinite(d.currentHumid)?d.currentHumid:null},point,
{payload:(fresh?'ESP32 trực tuyến':'ESP32 mất tín hiệu')+' • '+(d.currentState||'chưa rõ')+' • Cấu hình A: '+(matches?'khớp bản ESP32 báo gần nhất':'chờ ESP32 xác nhận')},
{payload:Object.values(msg.payload.alarms||{}).map(a=>({type:a.type,severity:a.severity,state:a.state,time:new Date(a.updatedAt).toLocaleString('vi-VN')}))}];
${care ? "output.push(Number.isInteger(reported?.unitsPerDose)?{payload:reported.unitsPerDose}:null,typeof reported?.isLoaded==='boolean'?{payload:reported.isLoaded}:null);" : ''}
return output;`;
  const nodes = [
    { id: tab, type: 'tab', label: `Pillbox ${mode}`, disabled: false },
    { id: 'base', type: 'ui-base', name: 'Hộp thuốc', path: '/dashboard', includeClientData: true, acceptsClientConfig: [], showPathInSidebar: false, showPageTitle: true, navigationStyle: 'default', titleBarStyle: 'default' },
    { id: 'theme', type: 'ui-theme', name: 'Pillbox', colors: { surface: '#ffffff', primary: '#0891b2', bgPage: '#f1f5f9', groupBg: '#ffffff', groupOutline: '#cbd5e1' }, sizes: { density: 'default', pagePadding: '16px', groupGap: '16px', groupBorderRadius: '8px', widgetGap: '12px' } },
    { id: 'page', type: 'ui-page', name: care ? 'Người chăm sóc' : 'Chỉ xem', ui: 'base', path: '/pillbox', icon: 'medication', layout: 'grid', theme: 'theme', order: 1, visible: true, disabled: false, breakpoints: [{ name: 'Default', px: '0', cols: '3' }, { name: 'Tablet', px: '576', cols: '6' }, { name: 'Desktop', px: '1024', cols: '12' }] },
    { id: 'group', type: 'ui-group', name: 'Môi trường và trạng thái', page: 'page', width: '12', order: 1, showTitle: true, visible: true, disabled: false, groupType: 'default' },
    { id: 'poll', type: 'inject', z: tab, name: 'Mỗi 5 giây', props: [{ p: 'payload' }], repeat: '5', once: true, onceDelay: '1', payloadType: 'date', x: 120, y: 80, wires: [['request']] },
    { id: 'request', type: 'function', z: tab, name: 'Token riêng theo vai trò', func: `msg.headers={Authorization:'Bearer '+env.get('${care ? 'CAREGIVER' : 'VIEWER'}_API_TOKEN')}; msg.url='http://127.0.0.1:'+(env.get('API_PORT')||8787)+'/api/snapshot'; return msg;`, outputs: 1, x: 350, y: 80, wires: [['snapshot']] },
    { id: 'snapshot', type: 'http request', z: tab, name: 'Đọc trạng thái', method: 'GET', ret: 'obj', paytoqs: 'ignore', url: '', persist: false, x: 570, y: 80, wires: [['split']] },
    { id: 'split', type: 'function', z: tab, name: 'Ánh xạ dữ liệu', outputs: care ? 7 : 5, x: 780, y: 80,
      func: splitFunction,
      wires: [['temp'],['humid'],['chart'],['connection'],['alarms'],...(care ? [['dose'],['loaded']] : [])] },
    { id: 'temp', type: 'ui-gauge', z: tab, group: 'group', name: 'Nhiệt độ', label: 'Nhiệt độ', gtype: 'gauge-half', gstyle: 'needle', min: -10, max: 60, segments: [{ from: '-10', color: '#22c55e' }, { from: '30', color: '#f59e0b' }, { from: '35', color: '#ef4444' }], units: '°C', width: '6', height: '3', order: 1, x: 1030, y: 40, wires: [] },
    { id: 'humid', type: 'ui-gauge', z: tab, group: 'group', name: 'Độ ẩm', label: 'Độ ẩm', gtype: 'gauge-half', gstyle: 'needle', min: 0, max: 100, segments: [{ from: '0', color: '#22d3ee' }, { from: '75', color: '#ef4444' }], units: '%', width: '6', height: '3', order: 2, x: 1030, y: 100, wires: [] },
    { id: 'chart', type: 'ui-chart', z: tab, group: 'group', name: 'Lịch sử nhiệt độ', label: 'Nhiệt độ theo thời gian', chartType: 'line', category: 'topic', categoryType: 'msg', xAxisLabel: 'Thời gian', xAxisProperty: 'timestamp', xAxisPropertyType: 'msg', xAxisType: 'time', xAxisFormat: 'HH:mm:ss', yAxisLabel: '°C', yAxisProperty: 'payload', yAxisPropertyType: 'msg', action: 'append', removeOlder: '1', removeOlderUnit: '3600', removeOlderPoints: '720', width: '12', height: '5', order: 3, x: 1030, y: 160, wires: [[]] },
    { id: 'connection', type: 'ui-text', z: tab, group: 'group', name: 'Kết nối', label: 'Trạng thái', order: 4, width: '12', height: '1', layout: 'row-spread', style: false, x: 1030, y: 220, wires: [] },
    { id: 'alarms', type: 'ui-table', z: tab, group: 'group', name: 'Vòng đời cảnh báo', label: 'Cảnh báo', order: 5, width: '12', height: '4', maxrows: '100', autocols: true, showSearch: true, selectionType: 'none', x: 1030, y: 280, wires: [[]] }
  ];
  if (care) nodes.push(
    { id: 'controls', type: 'ui-group', name: 'Cấu hình ngăn A', page: 'page', width: '12', order: 2, showTitle: true, visible: true, disabled: false, groupType: 'default' },
    { id: 'dose', type: 'ui-slider', z: tab, group: 'controls', name: 'Liều ngăn A', label: 'Số viên mỗi lần ngăn A', min: '1', max: '10', step: '1', order: 1, width: '8', height: '1', passthru: false, outs: 'end', x: 180, y: 380, wires: [['dose-command']] },
    { id: 'dose-command', type: 'function', z: tab, name: 'Đặt liều', outputs: 1, func: "msg.payload={compartmentId:'A',unitsPerDose:Number(msg.payload)}; return msg;", x: 420, y: 380, wires: [['authorize-command']] },
    { id: 'loaded', type: 'ui-switch', z: tab, group: 'controls', name: 'Trạng thái nạp A', label: 'Ngăn A đã nạp', order: 2, width: '4', height: '1', passthru: false, onvalue: 'true', onvalueType: 'bool', offvalue: 'false', offvalueType: 'bool', x: 180, y: 440, wires: [['loaded-command']] },
    { id: 'loaded-command', type: 'function', z: tab, name: 'Đặt trạng thái nạp', outputs: 1, func: "msg.payload={compartmentId:'A',isLoaded:msg.payload===true}; return msg;", x: 420, y: 440, wires: [['authorize-command']] },
    { id: 'authorize-command', type: 'function', z: tab, name: 'Quyền người chăm sóc', outputs: 1, func: "msg.headers={Authorization:'Bearer '+env.get('CAREGIVER_API_TOKEN'),'Content-Type':'application/json'}; msg.url='http://127.0.0.1:'+(env.get('API_PORT')||8787)+'/api/config'; return msg;", x: 680, y: 400, wires: [['save-command']] },
    { id: 'save-command', type: 'http request', z: tab, name: 'Lưu và chờ ESP32 ACK', method: 'POST', ret: 'obj', paytoqs: 'ignore', url: '', persist: false, x: 940, y: 400, wires: [['command-result']] },
    { id: 'command-result', type: 'ui-text', z: tab, group: 'controls', name: 'Kết quả gửi', label: 'Phản hồi', order: 3, width: '12', height: '2', format: '{{msg.payload.message || msg.payload.error}}', layout: 'row-spread', style: false, x: 1190, y: 400, wires: [] }
  );
  return nodes;
}
module.exports = { flows };
