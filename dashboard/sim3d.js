/**
 * SMART PILL BOX - 3D DIGITAL TWIN (THREE.JS + FIREBASE RTDB)
 * Thiet ke kieu dang Hop Thuoc Gia Dinh Than Thien (Bento / Pill Organizer):
 * - Than hop nguyen khoi bo tron mem mai mau Trang Kem Am & vien Xanh Bac Ha.
 * - Mat tren phang chia 2 vung: 3 Ngan thuoc (Sang - Trua - Toi) & Dai nut bam dang vien thuoc.
 * - Mach dien (ESP32, DS3231, DHT22, Buzzer, Servo SG90) an hoan toan ben duoi,
 *   chi hien thi khi bam nut "Xem Mach Dien Ben Trong".
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. CAU HINH FIREBASE & THONG SO TRANG THAI
  // =========================================================================
  const FIREBASE_CONFIG = (typeof window !== 'undefined' && window.PILLBOX_FIREBASE_CONFIG)
    ? window.PILLBOX_FIREBASE_CONFIG
    : { databaseURL: 'https://smart-pillbox-iot-c2775-default-rtdb.asia-southeast1.firebasedatabase.app/' };

  let db = null;
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.database();
  }

  const DEFAULT_COMPARTMENTS = {
    A: {
      compartmentId: 'A',
      medicineCode: 'MED-001',
      displayName: 'Thuoc Tim Mach',
      unitsPerDose: 2,
      schedule: '08:00',
      currentStock: 10,
      isLoaded: true
    },
    B: {
      compartmentId: 'B',
      medicineCode: 'MED-002',
      displayName: 'Vitamin C',
      unitsPerDose: 1,
      schedule: '12:00',
      currentStock: 20,
      isLoaded: true
    },
    C: {
      compartmentId: 'C',
      medicineCode: 'MED-003',
      displayName: 'Canxi Nano',
      unitsPerDose: 1,
      schedule: '20:00',
      currentStock: 15,
      isLoaded: true
    }
  };

  const simState = {
    fsmState: 'IDLE',
    activeComp: '',
    medicineName: '',
    lidOpen: false,
    servoTargetAngle: 0,
    servoCurrentAngle: 0,
    detectedUnits: 0,
    expectedUnits: 0,
    temp: 28.0,
    humid: 65.0,
    compartments: JSON.parse(JSON.stringify(DEFAULT_COMPARTMENTS)),
    viewCompIndex: 0,
    viewingUntilMs: 0,
    customBannerText: null,
    customBannerUntilMs: 0,
    autoCloseTimer: null,
    verifyTimeoutTimer: null,
    lastLocalInteractionMs: 0,
    xrayMode: false,
    explodedMode: false,
    audioEnabled: false,
    activeFocusKey: null
  };

  // =========================================================================
  // 2. THAM CHIEU DOM
  // =========================================================================
  const dom = {
    connStatusPill: document.getElementById('connStatusPill'),
    connPulse: document.getElementById('connPulse'),
    connStatusText: document.getElementById('connStatusText'),
    btnToggleXray: document.getElementById('btnToggleXray'),
    btnToggleAudio: document.getElementById('btnToggleAudio'),
    presetButtons: document.getElementById('presetButtons'),
    canvasContainer: document.getElementById('canvasContainer'),
    canvas: document.getElementById('pillboxCanvas'),
    lcdLine1: document.getElementById('lcdLine1'),
    lcdLine2: document.getElementById('lcdLine2'),
    lcdStatusTag: document.getElementById('lcdStatusTag'),
    focusBanner: document.getElementById('focusComponentBanner'),
    focusTitle: document.getElementById('focusComponentTitle'),
    focusDesc: document.getElementById('focusComponentDesc'),
    btnClearFocus: document.getElementById('btnClearFocus'),
    hardwareLegend: document.getElementById('hardwareLegend'),
    lastSeenDisplay: document.getElementById('lastSeenDisplay'),
    teleState: document.getElementById('teleState'),
    fsmDescription: document.getElementById('fsmDescription'),
    teleServoAngle: document.getElementById('teleServoAngle'),
    teleLidStatus: document.getElementById('teleLidStatus'),
    teleActiveComp: document.getElementById('teleActiveComp'),
    teleDetectedUnits: document.getElementById('teleDetectedUnits'),
    teleTemp: document.getElementById('teleTemp'),
    teleHumid: document.getElementById('teleHumid'),
    teleEnvHint: document.getElementById('teleEnvHint'),
    indLedGreen: document.getElementById('indLedGreen'),
    indLedRed: document.getElementById('indLedRed'),
    indBuzzer: document.getElementById('indBuzzer'),
    demoLogBar: document.getElementById('demoLogBar'),
    compStockList: document.getElementById('compStockList'),
    btn3dTooltip: document.getElementById('btn3dTooltip')
  };

  // =========================================================================
  // 3. WEB AUDIO API (MO PHONG COI BUZZER)
  // =========================================================================
  let audioCtx = null;
  let lastBuzzerBeepPhase = false;

  function playBeep(freq, durationSec) {
    if (!simState.audioEnabled) return;
    try {
      if (!audioCtx) {
        const AudioContextCls = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCls) return;
        audioCtx = new AudioContextCls();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationSec);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + durationSec);
    } catch (_err) {
      // Bo qua neu trinh duyet chan autoplay
    }
  }

  // =========================================================================
  // 4. HELPER TRANG THAI & MAPPING MAN HINH HOP THUOC
  // =========================================================================
  function normalizeState(raw) {
    if (!raw) return 'IDLE';
    const s = String(raw).toUpperCase().replace('STATE_', '');
    if (s === 'COMPARTMENT_OPEN') return 'OPEN';
    return s;
  }

  function getStateMeta(st) {
    switch (st) {
      case 'IDLE':
        return { title: 'IDLE (Chờ cữ)', desc: 'Hiển thị giờ + nhiệt ẩm khoang thuốc', color: '#14b8a6' };
      case 'REMINDER':
        return { title: 'REMINDER (Báo giờ)', desc: 'Còi 3 bíp + Đèn xanh nhấp nháy nhắc uống', color: '#10b981' };
      case 'SNOOZED':
        return { title: 'SNOOZED (Hoãn 5p)', desc: 'Đã tạm hoãn chuông nhắc nhở 5 phút', color: '#f59e0b' };
      case 'OPEN':
        return { title: 'OPEN (Mở nắp 90°)', desc: 'Nắp ngăn thuốc đã mở, mời lấy thuốc', color: '#3b82f6' };
      case 'VERIFYING':
        return { title: 'VERIFYING (Đang đếm)', desc: 'Đang đếm số viên thuốc lấy ra', color: '#38bdf8' };
      case 'VERIFIED':
        return { title: 'VERIFIED (Đủ liều)', desc: 'Đã lấy đủ liều, chờ tự động đóng nắp', color: '#10b981' };
      case 'ERROR':
        return { title: 'ERROR (Cảnh báo)', desc: 'Sai liều / quá nhiệt / timeout - Nhấn ĐẶT LẠI', color: '#f43f5e' };
      case 'CLOSED':
        return { title: 'CLOSED (Đã khóa)', desc: 'Đã đóng nắp bảo quản thuốc an toàn', color: '#94a3b8' };
      default:
        return { title: st, desc: 'Thiết bị đang hoạt động', color: '#14b8a6' };
    }
  }

  function formatLcd16(str) {
    return String(str || '').slice(0, 16).padEnd(16, ' ');
  }

  function computeLcdLines() {
    const nowMs = Date.now();
    if (simState.customBannerText && nowMs < simState.customBannerUntilMs) {
      return simState.customBannerText;
    }

    const st = simState.fsmState;
    const compId = simState.activeComp || 'A';
    const comp = simState.compartments[compId] || DEFAULT_COMPARTMENTS.A;

    if (st === 'IDLE' || st === 'CLOSED') {
      if (nowMs < simState.viewingUntilMs) {
        const idxKeys = ['A', 'B', 'C'];
        const viewId = idxKeys[simState.viewCompIndex % 3];
        const vc = simState.compartments[viewId] || DEFAULT_COMPARTMENTS[viewId];
        return [
          formatLcd16(`[${viewId}] ${vc.displayName}`),
          formatLcd16(`${vc.schedule || '08:00'} SL:${vc.currentStock}v`)
        ];
      }
      if (simState.temp > 35.0 && Math.floor(nowMs / 2000) % 2 === 1) {
        return [
          formatLcd16('! CANH BAO NHIET'),
          formatLcd16(`T:${simState.temp.toFixed(1)}C > 35C!`)
        ];
      }
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return [
        formatLcd16(`GIO: ${hh}:${mm}  [OK]`),
        formatLcd16(`T:${simState.temp.toFixed(1)}C H:${simState.humid.toFixed(0)}%`)
      ];
    }

    if (st === 'REMINDER') {
      return [
        formatLcd16(`[NGAN ${compId}] ${comp.displayName}`),
        formatLcd16(`LIEU: ${comp.unitsPerDose} VIEN`)
      ];
    }
    if (st === 'SNOOZED') {
      return [
        formatLcd16('TRANG THAI: HOAN'),
        formatLcd16('DA HOAN LICH 5P ')
      ];
    }
    if (st === 'OPEN' || st === 'VERIFYING') {
      const exp = simState.expectedUnits || comp.unitsPerDose || 1;
      return [
        formatLcd16('DANG LAY THUOC..'),
        formatLcd16(`DA LAY: ${simState.detectedUnits}/${exp} VIEN`)
      ];
    }
    if (st === 'VERIFIED') {
      return [
        formatLcd16('[DA UONG XONG]  '),
        formatLcd16('DA LAY DU LIEU  ')
      ];
    }
    if (st === 'ERROR') {
      const exp = simState.expectedUnits || comp.unitsPerDose || 1;
      let errLine = 'LOI HE THONG!   ';
      if (simState.detectedUnits > exp) errLine = 'CANH BAO: THUA! ';
      else if (simState.detectedUnits === 0) errLine = 'CHUA LAY THUOC! ';
      else if (simState.detectedUnits < exp) errLine = 'LAY THIEU LIEU! ';
      return [
        formatLcd16('! CANH BAO LOI !'),
        formatLcd16(errLine)
      ];
    }

    return [formatLcd16(' SMART PILL BOX '), formatLcd16('  V1.0 - NHOM 13')];
  }

  // =========================================================================
  // 5. KHOI TAO THREE.JS & MO HINH HOP THUOC GIA DINH NGUYEN KHOI
  // =========================================================================
  let scene, camera, renderer, controls, labGridHelper;
  let pillboxRoot, outerShellGroup, compartmentsGroup, electronicsGroup, frontPanelGroup;
  let servoHornGroup, linkageRodMesh, lockBarMesh, focusRingMesh;
  let ledGreenMat, ledRedMat, ledGreenLight, ledRedLight;
  let lcdCanvas, lcdCtx, lcdTexture;
  let raycaster, pointer;

  const lidPivots = {};
  const pillContainers = {};
  const droppingPills = [];
  const buttonMeshes = [];
  const buttonAnimState = {};
  let hoveredBtnId = null;
  const focusGroups = {};
  const shellMaterials = [];

  const camAnim = {
    active: false,
    pos: new THREE.Vector3(0.0, 7.6, 8.6),
    target: new THREE.Vector3(0, 0.9, 0.1)
  };

  const COMPONENT_INFO = {
    esp32: {
      title: 'ESP32-WROOM-32 (Đặt ẩn dưới đáy hộp)',
      desc: 'Vi điều khiển trung tâm tích hợp Wi-Fi, chạy máy trạng thái 8 bước và đồng bộ dữ liệu lên Firebase Realtime Database.',
      camPos: new THREE.Vector3(-4.6, 5.2, 3.8),
      camTarget: new THREE.Vector3(-2.3, 0.45, -0.35)
    },
    servo: {
      title: 'Động cơ Servo SG90 (Cơ cấu khóa ngăn - GPIO 13)',
      desc: 'Đặt gọn dưới bản lề sau, tự động mở chốt khóa nắp ngăn 90° khi người dùng bấm UỐNG THUỐC.',
      camPos: new THREE.Vector3(2.8, 4.8, 2.2),
      camTarget: new THREE.Vector3(0.0, 0.65, -1.85)
    },
    lcd: {
      title: 'Màn hình Thông minh (LCD 1602 - 0x27)',
      desc: 'Nằm phẳng trên viền mặt trước, hiển thị đồng hồ, nhiệt ẩm và hướng dẫn số viên cần uống bằng chữ rõ nét.',
      camPos: new THREE.Vector3(0.0, 5.6, 4.4),
      camTarget: new THREE.Vector3(0.0, 1.54, 1.32)
    },
    rtc: {
      title: 'Đồng hồ Thời gian thực RTC DS3231 (0x68)',
      desc: 'Giữ đúng giờ hẹn uống thuốc ngay cả khi mất điện hay mất kết nối Wi-Fi nhờ pin dự phòng CR2032.',
      camPos: new THREE.Vector3(2.0, 5.0, 2.8),
      camTarget: new THREE.Vector3(0.5, 0.45, -0.55)
    },
    dht22: {
      title: 'Cảm biến Nhiệt độ & Độ ẩm DHT22 (GPIO 4)',
      desc: 'Theo dõi điều kiện bảo quản thuốc bên trong hộp, tự động cảnh báo khi nhiệt độ vượt 35°C.',
      camPos: new THREE.Vector3(5.2, 4.6, 2.6),
      camTarget: new THREE.Vector3(2.8, 0.6, -0.05)
    },
    buzzer: {
      title: 'Loa Nhắc giờ & Cảnh báo (Active Buzzer - GPIO 25)',
      desc: 'Phát tiếng bíp êm dịu nhắc giờ uống thuốc và âm báo cảnh giác nếu lấy sai số lượng viên.',
      camPos: new THREE.Vector3(5.0, 4.8, -3.4),
      camTarget: new THREE.Vector3(2.8, 0.48, -1.25)
    },
    leds: {
      title: 'Đèn Báo Nhắc Uống & Cảnh Báo (D2 / D15)',
      desc: 'Hai đèn chỉ thị dịu mắt hai bên màn hình: Xanh khi đến giờ/đủ liều, Đỏ khi phát hiện lấy sai liều.',
      camPos: new THREE.Vector3(0.0, 5.6, 4.6),
      camTarget: new THREE.Vector3(0.0, 1.54, 1.32)
    },
    buttons: {
      title: 'Cụm 7 Phím Bấm Thân thiện Dạng Viên Thuốc',
      desc: 'Click trực tiếp lên từng phím trên hộp để dùng: ✓ UỐNG THUỐC, ⏰ HOÃN 5P, 💊 LẤY 1 VIÊN, ＋ NẠP THUỐC, ↺ ĐẶT LẠI, ◀ TRƯỚC, SAU ▶.',
      camPos: new THREE.Vector3(0.0, 5.0, 5.6),
      camTarget: new THREE.Vector3(0.0, 1.5, 2.15)
    }
  };

  function initThreeScene() {
    if (typeof THREE === 'undefined') {
      dom.demoLogBar.textContent = 'Lỗi: Không tải được thư viện Three.js từ CDN. Vui lòng kiểm tra kết nối mạng.';
      return false;
    }

    const width = dom.canvasContainer.clientWidth || 800;
    const height = dom.canvasContainer.clientHeight || 560;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x161c28, 0.012);

    camera = new THREE.PerspectiveCamera(39, width / height, 0.1, 120);
    camera.position.set(0.0, 7.6, 8.6);

    renderer = new THREE.WebGLRenderer({
      canvas: dom.canvas,
      antialias: true,
      alpha: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 4.2;
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.target.set(0, 0.9, 0.1);
    controls.addEventListener('start', () => {
      camAnim.active = false;
    });

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    setupLightsAndTabletop();
    buildPillboxAssembly();
    applyXrayState();
    setupInteractions();
    setupResizeObserver();

    return true;
  }

  function setupLightsAndTabletop() {
    const ambient = new THREE.AmbientLight(0xfff7ed, 0.48);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xfffbeb, 0x1e293b, 0.42);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfffdf7, 0.72);
    keyLight.position.set(7, 15, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 36;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x5eead4, 0.25);
    rimLight.position.set(-9, 7, -8);
    scene.add(rimLight);

    // Mat ban tron am ap phong cach noi that gia dinh
    const tableDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(8.2, 8.4, 0.24, 64),
      new THREE.MeshStandardMaterial({ color: 0x3b332b, roughness: 0.78, metalness: 0.05 })
    );
    tableDisc.position.y = -0.14;
    tableDisc.receiveShadow = true;
    scene.add(tableDisc);

    // Vong trang tri nhe tren mat ban
    const coasterRing = new THREE.Mesh(
      new THREE.RingGeometry(6.5, 6.62, 64),
      new THREE.MeshBasicMaterial({ color: 0x574c41, side: THREE.DoubleSide })
    );
    coasterRing.rotation.x = -Math.PI / 2;
    coasterRing.position.y = -0.015;
    scene.add(coasterRing);

    // Luoi toa do chi hien thi khi bat che do Soi mach dien ben trong
    labGridHelper = new THREE.GridHelper(28, 28, 0x14b8a6, 0x1e293b);
    labGridHelper.position.y = -0.005;
    labGridHelper.visible = false;
    scene.add(labGridHelper);
  }

  function makeRoundedRectPath(w, h, r, clockwise) {
    const path = new THREE.Path();
    const x = -w / 2;
    const y = -h / 2;
    const rad = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);

    if (!clockwise) {
      path.moveTo(x + rad, y);
      path.lineTo(x + w - rad, y);
      path.quadraticCurveTo(x + w, y, x + w, y + rad);
      path.lineTo(x + w, y + h - rad);
      path.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
      path.lineTo(x + rad, y + h);
      path.quadraticCurveTo(x, y + h, x, y + h - rad);
      path.lineTo(x, y + rad);
      path.quadraticCurveTo(x, y, x + rad, y);
    } else {
      path.moveTo(x + rad, y);
      path.quadraticCurveTo(x, y, x, y + rad);
      path.lineTo(x, y + h - rad);
      path.quadraticCurveTo(x, y + h, x + rad, y + h);
      path.lineTo(x + w - rad, y + h);
      path.quadraticCurveTo(x + w, y + h, x + w, y + h - rad);
      path.lineTo(x + w, y + rad);
      path.quadraticCurveTo(x + w, y, x + w - rad, y);
      path.lineTo(x + rad, y);
    }
    return path;
  }

  function createRoundedBoxShape(w, d, r) {
    const shape = new THREE.Shape();
    const x = -w / 2;
    const y = -d / 2;
    const rad = Math.min(r, w / 2 - 0.01, d / 2 - 0.01);
    shape.moveTo(x + rad, y);
    shape.lineTo(x + w - rad, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + rad);
    shape.lineTo(x + w, y + d - rad);
    shape.quadraticCurveTo(x + w, y + d, x + w - rad, y + d);
    shape.lineTo(x + rad, y + d);
    shape.quadraticCurveTo(x, y + d, x, y + d - rad);
    shape.lineTo(x, y + rad);
    shape.quadraticCurveTo(x, y, x + rad, y);
    return shape;
  }

  function createExtrudedRoundedMesh(w, d, height, radius, mat, bevelSize, holeInset) {
    const shape = createRoundedBoxShape(w, d, radius);
    if (holeInset && holeInset > 0) {
      const hole = makeRoundedRectPath(
        w - holeInset * 2,
        d - holeInset * 2,
        Math.max(0.15, radius - holeInset * 0.6),
        true
      );
      shape.holes.push(hole);
    }
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: bevelSize > 0,
      bevelSegments: 3,
      steps: 1,
      bevelSize: bevelSize || 0,
      bevelThickness: bevelSize || 0
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  function createTextTexture(text, opts) {
    const o = Object.assign({
      width: 256,
      height: 64,
      bg: '#faf8f5',
      fg: '#0f172a',
      font: 'bold 26px "Plus Jakarta Sans", sans-serif',
      border: null,
      radius: 0
    }, opts || {});
    const c = document.createElement('canvas');
    c.width = o.width;
    c.height = o.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, o.width, o.height);
    if (o.border) {
      ctx.strokeStyle = o.border;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, o.width - 4, o.height - 4);
    }
    ctx.fillStyle = o.fg;
    ctx.font = o.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, o.width / 2, o.height / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function createWire(pointsArr, hexColor, radius) {
    const vectors = pointsArr.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(vectors);
    const geo = new THREE.TubeGeometry(curve, 18, radius || 0.025, 8, false);
    const mat = new THREE.MeshStandardMaterial({
      color: hexColor,
      roughness: 0.45,
      metalness: 0.1
    });
    return new THREE.Mesh(geo, mat);
  }

  function makeShellMaterial(hexColor, roughnessVal) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: hexColor,
      roughness: roughnessVal !== undefined ? roughnessVal : 0.32,
      metalness: 0.04,
      clearcoat: 0.25,
      clearcoatRoughness: 0.25,
      transparent: false,
      opacity: 1.0,
      depthWrite: true
    });
    shellMaterials.push(mat);
    return mat;
  }

  function applyXrayState() {
    const showInternal = simState.xrayMode || simState.explodedMode;

    if (electronicsGroup) {
      electronicsGroup.visible = showInternal;
    }
    if (labGridHelper) {
      labGridHelper.visible = showInternal;
    }

    shellMaterials.forEach((m) => {
      if (showInternal) {
        m.transparent = true;
        m.opacity = 0.16;
        m.depthWrite = false;
      } else {
        m.transparent = false;
        m.opacity = 1.0;
        m.depthWrite = true;
      }
      m.needsUpdate = true;
    });

    dom.btnToggleXray.classList.toggle('active', simState.xrayMode);
    dom.btnToggleXray.textContent = simState.xrayMode
      ? '📦 Đóng Vỏ Hộp (Chế độ Sản phẩm)'
      : '🔍 Xem Mạch Điện Bên Trong';
  }

  function buildPillboxAssembly() {
    pillboxRoot = new THREE.Group();
    scene.add(pillboxRoot);

    outerShellGroup = new THREE.Group();
    compartmentsGroup = new THREE.Group();
    electronicsGroup = new THREE.Group();
    frontPanelGroup = new THREE.Group();

    pillboxRoot.add(outerShellGroup);
    pillboxRoot.add(compartmentsGroup);
    pillboxRoot.add(electronicsGroup);
    pillboxRoot.add(frontPanelGroup);

    // Bang mau Hop thuoc gia dinh: Trang Kem Am + Xanh Bac Ha Diu + Long Nga
    const warmCreamMat = makeShellMaterial(0xfaf8f5, 0.34);
    const softIvoryTrayMat = makeShellMaterial(0xe8e4dc, 0.45);
    const mintAccentMat = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      roughness: 0.32,
      metalness: 0.08
    });
    const rubberFootMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });

    // =========================================================================
    // 1. MOT KHOI HOP BENTO BO TRON DUY NHAT (10.0 x 5.8 x 1.55, r = 1.05)
    // =========================================================================
    // De day bo tron
    const bottomPlate = createExtrudedRoundedMesh(10.0, 5.8, 0.14, 1.05, warmCreamMat, 0.04, 0);
    bottomPlate.position.set(0, 0.08, 0);
    bottomPlate.castShadow = true;
    bottomPlate.receiveShadow = true;
    outerShellGroup.add(bottomPlate);

    // 4 chan silicone chong truot duoi day
    [[-3.9, -1.9], [3.9, -1.9], [-3.9, 1.9], [3.9, 1.9]].forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.06, 18), rubberFootMat);
      foot.position.set(fx, 0.03, fz);
      outerShellGroup.add(foot);
    });

    // Vach bao nguyen khoi (khoang rong ben duoi chua mach dien an)
    const unibodyWall = createExtrudedRoundedMesh(10.0, 5.8, 1.30, 1.05, warmCreamMat, 0.05, 0.28);
    unibodyWall.position.set(0, 0.22, 0);
    unibodyWall.castShadow = true;
    outerShellGroup.add(unibodyWall);

    // Dai vien Xanh Bac Ha mem mai om quanh mep tren hop
    const mintTrimRing = createExtrudedRoundedMesh(10.06, 5.86, 0.06, 1.07, mintAccentMat, 0.02, 0.22);
    mintTrimRing.position.set(0, 1.48, 0);
    outerShellGroup.add(mintTrimRing);

    // Bieu tuong Chu thap Y te tinh te o 2 ben hong
    [-5.05, 5.05].forEach((sideX) => {
      const crossGroup = new THREE.Group();
      crossGroup.position.set(sideX, 0.85, 0);
      crossGroup.rotation.y = sideX < 0 ? -Math.PI / 2 : Math.PI / 2;
      const barH = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.14, 0.04), mintAccentMat);
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.50, 0.04), mintAccentMat);
      crossGroup.add(barH, barV);
      outerShellGroup.add(crossGroup);
    });

    // =========================================================================
    // 2. VUNG MAT TREN (70% PHIA SAU): 3 NGAN THUOC A, B, C (KHONG CHU PHAT SANG)
    // =========================================================================
    const compXCenters = { A: -3.05, B: 0.0, C: 3.05 };
    const compAccentColors = { A: 0xfb7185, B: 0xfbbf24, C: 0x38bdf8 };

    // San khay 3 ngan thuoc dat o Y = 1.00 (ben duoi la khoang mach dien an Y = 0.22 .. 0.96)
    const trayFloor = createExtrudedRoundedMesh(9.32, 3.25, 0.10, 0.65, softIvoryTrayMat, 0.02, 0);
    trayFloor.position.set(0, 1.00, -0.90);
    trayFloor.receiveShadow = true;
    compartmentsGroup.add(trayFloor);

    // Thanh ngan giua vung thuoc va dai dieu khien phia truoc
    const centerDividerBar = new THREE.Mesh(new THREE.BoxGeometry(9.35, 0.48, 0.16), softIvoryTrayMat);
    centerDividerBar.position.set(0, 1.32, 0.78);
    compartmentsGroup.add(centerDividerBar);

    // 2 vach chia 3 ngan thuoc
    [-1.52, 1.52].forEach((dx) => {
      const div = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.46, 3.15), softIvoryTrayMat);
      div.position.set(dx, 1.30, -0.90);
      div.castShadow = true;
      compartmentsGroup.add(div);
    });

    // Nap nhua trong mo bo tron nam phang khit tren mat hop (Y = 1.55)
    const frostedLidMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0fdfa,
      roughness: 0.18,
      metalness: 0.02,
      transparent: true,
      opacity: 0.36,
      clearcoat: 0.6,
      depthWrite: false
    });

    ['A', 'B', 'C'].forEach((id) => {
      const cx = compXCenters[id];

      // Ky hieu tinh A, B, C in lua nho gon tren go nhua phia sau moi ngan
      const compLetterTex = createTextTexture(id, {
        width: 96,
        height: 64,
        bg: '#faf8f5',
        fg: '#475569',
        font: 'bold 42px "Plus Jakarta Sans", sans-serif'
      });
      const compLetter = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.26),
        new THREE.MeshBasicMaterial({ map: compLetterTex })
      );
      compLetter.rotation.x = -Math.PI / 2;
      compLetter.position.set(cx, 1.566, -2.68);
      compartmentsGroup.add(compLetter);

      // Nhom chua vien thuoc 3D trong ngan
      const pGroup = new THREE.Group();
      pGroup.position.set(cx, 1.16, -0.88);
      compartmentsGroup.add(pGroup);
      pillContainers[id] = pGroup;

      // Truc ban le nap nam phang o canh sau (Z = -2.42, Y = 1.55)
      const pivot = new THREE.Group();
      pivot.position.set(cx, 1.55, -2.42);
      compartmentsGroup.add(pivot);
      lidPivots[id] = pivot;

      const hingeBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 1.2, 12),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.65, roughness: 0.28 })
      );
      hingeBar.rotation.z = Math.PI / 2;
      pivot.add(hingeBar);

      // Tam nap nhua trong suot tron sach (khong dan chu hay man hinh len nap)
      const lidPanel = createExtrudedRoundedMesh(2.82, 3.05, 0.05, 0.42, frostedLidMat, 0.015, 0);
      lidPanel.position.set(0, 0.0, 1.525);
      pivot.add(lidPanel);

      // Go mo nap pastel diu mat o mep truoc cua nap
      const pullTabMat = new THREE.MeshStandardMaterial({
        color: compAccentColors[id],
        roughness: 0.28,
        metalness: 0.08
      });
      const frontTab = createExtrudedRoundedMesh(1.15, 0.22, 0.05, 0.09, pullTabMat, 0.01, 0);
      frontTab.position.set(0, 0.05, 2.90);
      pivot.add(frontTab);
    });

    // =========================================================================
    // 3. TANG DAY AN BEN TRONG (Y = 0.22 .. 0.96): PCB, ESP32, RTC, DHT22, SERVO
    // =========================================================================
    const carrierPcb = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.07, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.55, metalness: 0.2 })
    );
    carrierPcb.position.set(0, 0.25, -0.15);
    carrierPcb.receiveShadow = true;
    electronicsGroup.add(carrierPcb);

    // 3a. ESP32-WROOM-32 DevKitC
    const espGroup = new THREE.Group();
    espGroup.position.set(-2.3, 0.38, -0.35);
    electronicsGroup.add(espGroup);
    focusGroups.esp32 = espGroup;

    espGroup.add(new THREE.Mesh(
      new THREE.BoxGeometry(2.35, 0.07, 1.25),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45 })
    ));

    const rfShield = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.12, 0.82),
      new THREE.MeshStandardMaterial({
        map: createTextTexture('ESP-WROOM-32', { width: 256, height: 160, bg: '#cbd5e1', fg: '#1e293b', font: 'bold 26px "JetBrains Mono", monospace' }),
        metalness: 0.65,
        roughness: 0.3
      })
    );
    rfShield.position.set(0.64, 0.09, 0);
    espGroup.add(rfShield);

    const usbPort = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.09, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 })
    );
    usbPort.position.set(-1.12, 0.07, 0);
    espGroup.add(usbPort);

    const pwrLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.04, 0.07),
      new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xf43f5e, emissiveIntensity: 1.4 })
    );
    pwrLed.position.set(-0.65, 0.06, 0.34);
    espGroup.add(pwrLed);

    // 3b. Module RTC DS3231 + Pin CR2032
    const rtcGroup = new THREE.Group();
    rtcGroup.position.set(0.5, 0.36, -0.55);
    electronicsGroup.add(rtcGroup);
    focusGroups.rtc = rtcGroup;

    rtcGroup.add(new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.06, 0.96),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.45 })
    ));
    const rtcBattery = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.08, 22),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.88, roughness: 0.2 })
    );
    rtcBattery.position.set(0.25, 0.07, 0);
    rtcGroup.add(rtcBattery);

    // 3c. Cam bien DHT22
    const dhtGroup = new THREE.Group();
    dhtGroup.position.set(2.8, 0.56, -0.05);
    electronicsGroup.add(dhtGroup);
    focusGroups.dht22 = dhtGroup;

    dhtGroup.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.48, 0.40),
      new THREE.MeshStandardMaterial({
        map: createTextTexture('DHT22', { width: 128, height: 128, bg: '#f1f5f9', fg: '#0f172a', font: 'bold 28px monospace' }),
        roughness: 0.35
      })
    ));

    // 3d. Coi Active Buzzer
    const buzzerGroup = new THREE.Group();
    buzzerGroup.position.set(2.8, 0.44, -1.25);
    electronicsGroup.add(buzzerGroup);
    focusGroups.buzzer = buzzerGroup;

    buzzerGroup.add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.32, 22),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35 })
    ));

    // 3e. Servo SG90 (dat duoi truc ban le sau) + thanh truyen khoa nap
    const servoGroup = new THREE.Group();
    servoGroup.position.set(0.0, 0.58, -1.85);
    electronicsGroup.add(servoGroup);
    focusGroups.servo = servoGroup;

    const sg90BlueMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      roughness: 0.28,
      transparent: true,
      opacity: 0.88
    });
    servoGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.52, 0.40), sg90BlueMat));
    const servoGearCap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 16), sg90BlueMat);
    servoGearCap.position.set(0.14, 0.32, 0);
    servoGroup.add(servoGearCap);

    servoHornGroup = new THREE.Group();
    servoHornGroup.position.set(0.14, 0.42, 0);
    servoGroup.add(servoHornGroup);

    const hornMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    servoHornGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.06, 14), hornMat));
    const hornArm = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.52), hornMat);
    hornArm.position.set(0, 0.02, -0.22);
    servoHornGroup.add(hornArm);

    linkageRodMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.65, 10),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 })
    );
    electronicsGroup.add(linkageRodMesh);

    lockBarMesh = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 0.06, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.25 })
    );
    lockBarMesh.position.set(0, 0.96, -2.35);
    electronicsGroup.add(lockBarMesh);

    // Day dan 3D di ngam tren PCB tang day
    electronicsGroup.add(createWire([[-1.35, 0.32, -0.05], [-0.4, 0.32, -0.25], [0.15, 0.35, -0.40]], 0x22c55e));
    electronicsGroup.add(createWire([[-1.20, 0.32, -0.05], [-0.3, 0.34, -0.15], [0.30, 0.35, -0.40]], 0x3b82f6));
    electronicsGroup.add(createWire([[-1.40, 0.36, -0.75], [-0.7, 0.45, -1.45], [-0.2, 0.55, -1.80]], 0xf97316));
    electronicsGroup.add(createWire([[-1.30, 0.32, 0.10], [0.8, 0.32, 0.20], [2.5, 0.45, -0.05]], 0xf97316));
    electronicsGroup.add(createWire([[-1.30, 0.32, -0.85], [0.9, 0.32, -1.25], [2.5, 0.38, -1.25]], 0xa855f7));
    electronicsGroup.add(createWire([[-2.8, 0.32, 0.15], [-2.5, 0.32, 1.1], [-1.5, 0.85, 1.35]], 0x22c55e, 0.02));
    electronicsGroup.add(createWire([[-2.6, 0.32, 0.15], [-2.3, 0.32, 1.2], [-1.3, 0.85, 1.35]], 0x3b82f6, 0.02));

    // =========================================================================
    // 4. VUNG DIEU KHIEN PHANG LIEN MACH PHIA TRUOC MAT TREN (Z = +0.85 .. +2.55)
    // =========================================================================
    frontPanelGroup.position.set(0, 1.54, 1.72);

    // Tam mat phang trang kem noi lien khit khu vuc phia truoc
    const frontDeckPlate = createExtrudedRoundedMesh(9.35, 1.75, 0.06, 0.55, warmCreamMat, 0.02, 0);
    frontDeckPlate.position.set(0, -0.04, 0);
    frontPanelGroup.add(frontDeckPlate);

    // Hang tren (z_local = -0.46): Duy nhat 1 man hinh LCD 1602 + 2 bong LED 5mm + 6 lo loa
    const screenBezelMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.15,
      clearcoat: 0.85
    });
    const screenBezel = createExtrudedRoundedMesh(3.9, 0.78, 0.05, 0.16, screenBezelMat, 0.015, 0);
    screenBezel.position.set(0, 0.01, -0.46);
    frontPanelGroup.add(screenBezel);

    const lcdGroup = new THREE.Group();
    lcdGroup.position.set(0, 0.078, -0.46);
    frontPanelGroup.add(lcdGroup);
    focusGroups.lcd = lcdGroup;

    lcdCanvas = document.createElement('canvas');
    lcdCanvas.width = 512;
    lcdCanvas.height = 144;
    lcdCtx = lcdCanvas.getContext('2d');
    lcdTexture = new THREE.CanvasTexture(lcdCanvas);

    const lcdScreenPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 0.64),
      new THREE.MeshBasicMaterial({ map: lcdTexture })
    );
    lcdScreenPlane.rotation.x = -Math.PI / 2;
    lcdGroup.add(lcdScreenPlane);

    // Cum 2 bong LED 5mm vat ly (D2 ben trai, D15 ben phai) voi nhan in lua xam dam
    const ledsGroup = new THREE.Group();
    ledsGroup.position.set(0, 0.04, -0.46);
    frontPanelGroup.add(ledsGroup);
    focusGroups.leds = ledsGroup;

    const ledSocketMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45 });

    // Bong LED Xanh (NHAC)
    const greenSocket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.05, 20), ledSocketMat);
    greenSocket.position.set(-2.75, 0.01, -0.08);
    ledsGroup.add(greenSocket);

    ledGreenMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.15,
      roughness: 0.2
    });
    const greenDome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), ledGreenMat);
    greenDome.position.set(-2.75, 0.05, -0.08);
    ledsGroup.add(greenDome);

    ledGreenLight = new THREE.PointLight(0x10b981, 0, 2.4);
    ledGreenLight.position.set(-2.75, 0.28, -0.08);
    ledsGroup.add(ledGreenLight);

    const lblG = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.22),
      new THREE.MeshBasicMaterial({
        map: createTextTexture('NHẮC', { width: 160, height: 40, bg: '#faf8f5', fg: '#475569', font: 'bold 24px "Plus Jakarta Sans", sans-serif' })
      })
    );
    lblG.rotation.x = -Math.PI / 2;
    lblG.position.set(-2.75, 0.004, 0.18);
    ledsGroup.add(lblG);

    // Bong LED Do (LOI)
    const redSocket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.05, 20), ledSocketMat);
    redSocket.position.set(2.75, 0.01, -0.08);
    ledsGroup.add(redSocket);

    ledRedMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xf43f5e,
      emissiveIntensity: 0.15,
      roughness: 0.2
    });
    const redDome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), ledRedMat);
    redDome.position.set(2.75, 0.05, -0.08);
    ledsGroup.add(redDome);

    ledRedLight = new THREE.PointLight(0xf43f5e, 0, 2.4);
    ledRedLight.position.set(2.75, 0.28, -0.08);
    ledsGroup.add(ledRedLight);

    const lblR = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.22),
      new THREE.MeshBasicMaterial({
        map: createTextTexture('LỖI', { width: 160, height: 40, bg: '#faf8f5', fg: '#475569', font: 'bold 24px "Plus Jakarta Sans", sans-serif' })
      })
    );
    lblR.rotation.x = -Math.PI / 2;
    lblR.position.set(2.75, 0.004, 0.18);
    ledsGroup.add(lblR);

    // Cum 6 lo thoat am vat ly duc tren mat vo nhua cho coi Buzzer (thay vong song ao)
    const speakerHoleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.018, 12), speakerHoleMat);
        hole.position.set(3.75 + col * 0.18, 0.042, -0.52 + row * 0.18);
        frontPanelGroup.add(hole);
      }
    }

    // Hang duoi (z_local = +0.28): Cum 7 nut nhan co hoc + chu in lua (silkscreen) tren vo nhua
    const buttonsGroup = new THREE.Group();
    buttonsGroup.position.set(0, 0.042, 0.28);
    frontPanelGroup.add(buttonsGroup);
    focusGroups.buttons = buttonsGroup;

    const btnSpecs = [
      { id: 'TAKE', label: 'UỐNG', color: 0x10b981, tip: 'Nút cơ học TAKE (D12): Xác nhận uống thuốc & mở nắp ngăn', x: -3.72 },
      { id: 'SNOOZE', label: 'HOÃN', color: 0xf59e0b, tip: 'Nút cơ học SNOOZE (D33): Tạm hoãn nhắc uống 5 phút', x: -2.48 },
      { id: 'REMOVE', label: 'LẤY 1V', color: 0x3b82f6, tip: 'Nút cơ học REMOVE (D35): Báo đã lấy ra 1 viên thuốc', x: -1.24 },
      { id: 'LOAD', label: 'NẠP', color: 0x06b6d4, tip: 'Nút cơ học LOAD (D32): Nạp thêm +10 viên vào ngăn', x: 0.00 },
      { id: 'MENU', label: 'XÓA LỖI', color: 0xf43f5e, tip: 'Nút cơ học MENU (D26): Xóa cảnh báo / Đặt lại', x: 1.24 },
      { id: 'UP', label: '◀', color: 0x8b5cf6, tip: 'Nút cơ học UP (D27): Xem ngăn thuốc trước trên LCD', x: 2.48 },
      { id: 'DOWN', label: '▶', color: 0x6366f1, tip: 'Nút cơ học DOWN (D14): Xem ngăn thuốc sau trên LCD', x: 3.72 }
    ];

    btnSpecs.forEach((b) => {
      // Vien lo gan nut bam tren vo nhua
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.34, 0.03, 24),
        new THREE.MeshStandardMaterial({ color: 0xd6d3cd, roughness: 0.55 })
      );
      collar.position.set(b.x, 0.015, 0);
      buttonsGroup.add(collar);

      // Mu nut nhan co hoc bang nhua cung (khong phat sang, khong in man hinh)
      const capMat = new THREE.MeshStandardMaterial({
        color: b.color,
        roughness: 0.38,
        metalness: 0.04
      });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.13, 24), capMat);
      cap.position.set(b.x, 0.075, 0);
      cap.castShadow = true;
      cap.userData = { btnId: b.id, baseY: 0.075, tip: b.tip };
      buttonsGroup.add(cap);
      buttonMeshes.push(cap);
      buttonAnimState[b.id] = { mesh: cap, pressUntil: 0 };

      // Chu in lua (silkscreen) mau xam dam truc tiep len vo nhua trang kem ben duoi nut
      const silkTex = createTextTexture(b.label, {
        width: 192,
        height: 48,
        bg: '#faf8f5',
        fg: '#334155',
        font: 'bold 28px "Plus Jakarta Sans", sans-serif'
      });
      const silkLabel = new THREE.Mesh(
        new THREE.PlaneGeometry(1.04, 0.24),
        new THREE.MeshBasicMaterial({ map: silkTex })
      );
      silkLabel.rotation.x = -Math.PI / 2;
      silkLabel.position.set(b.x, 0.002, 0.42);
      buttonsGroup.add(silkLabel);
    });

    // Khoi tao vien thuoc 3D & man hinh lan dau
    rebuildCompartmentPills();
    drawLcdCanvas(' SMART PILL BOX ', '  V1.0 - NHOM 13');

    // Vong sang highlight khi chon linh kien tu thanh chu thich
    focusRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.05, 36),
      new THREE.MeshBasicMaterial({
        color: 0x14b8a6,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      })
    );
    focusRingMesh.rotation.x = -Math.PI / 2;
    focusRingMesh.visible = false;
    scene.add(focusRingMesh);
  }

  function drawLcdCanvas(line1, line2) {
    if (!lcdCtx || !lcdTexture) return;
    const grad = lcdCtx.createLinearGradient(0, 0, 0, 144);
    grad.addColorStop(0, '#0f3a4f');
    grad.addColorStop(1, '#0b2b3b');
    lcdCtx.fillStyle = grad;
    lcdCtx.fillRect(0, 0, 512, 144);

    lcdCtx.strokeStyle = '#14b8a6';
    lcdCtx.lineWidth = 4;
    lcdCtx.strokeRect(4, 4, 504, 136);

    lcdCtx.fillStyle = '#e0f2fe';
    lcdCtx.shadowColor = 'rgba(94, 234, 212, 0.75)';
    lcdCtx.shadowBlur = 6;
    lcdCtx.font = 'bold 42px "JetBrains Mono", monospace';
    lcdCtx.textAlign = 'left';
    lcdCtx.textBaseline = 'middle';
    lcdCtx.fillText(formatLcd16(line1), 24, 44);
    lcdCtx.fillText(formatLcd16(line2), 24, 102);
    lcdCtx.shadowBlur = 0;

    lcdTexture.needsUpdate = true;
  }

  function createCapsuleMesh(colorA, colorB) {
    const g = new THREE.Group();
    const matA = new THREE.MeshStandardMaterial({ color: colorA, roughness: 0.22, metalness: 0.06 });
    const matB = new THREE.MeshStandardMaterial({ color: colorB, roughness: 0.22, metalness: 0.06 });

    const bodyA = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.16, 12), matA);
    bodyA.position.y = 0.08;
    const capA = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), matA);
    capA.position.y = 0.16;

    const bodyB = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.16, 12), matB);
    bodyB.position.y = -0.08;
    const capB = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 8), matB);
    capB.position.y = -0.16;

    g.add(bodyA, capA, bodyB, capB);
    g.rotation.z = Math.PI / 2;
    return g;
  }

  function rebuildCompartmentPills() {
    if (!pillContainers.A) return;

    ['A', 'B', 'C'].forEach((id) => {
      const container = pillContainers[id];
      while (container.children.length > 0) {
        container.remove(container.children[0]);
      }

      const comp = simState.compartments[id] || DEFAULT_COMPARTMENTS[id];
      const count = Math.min(24, Math.max(0, Number(comp.currentStock) || 0));

      for (let i = 0; i < count; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4) % 3;
        const layer = Math.floor(i / 12);
        let mesh;

        if (id === 'A') {
          mesh = createCapsuleMesh(0xfb7185, 0xfaf8f5);
        } else if (id === 'B') {
          mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.19, 0.19, 0.11, 16),
            new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.25, metalness: 0.05 })
          );
        } else {
          mesh = createCapsuleMesh(0x38bdf8, 0xfaf8f5);
        }

        mesh.position.set(
          -0.88 + col * 0.58,
          0.08 + layer * 0.21,
          -0.78 + row * 0.72
        );
        mesh.rotation.y = (i * 0.55) % Math.PI;
        mesh.castShadow = true;
        container.add(mesh);
      }
    });
  }

  function spawnDroppingPill(compId) {
    if (!compartmentsGroup) return;
    const xMap = { A: -3.05, B: 0.0, C: 3.05 };
    const colorMap = { A: 0xfb7185, B: 0xfbbf24, C: 0x38bdf8 };
    const sx = xMap[compId] !== undefined ? xMap[compId] : 0;

    const pill = new THREE.Mesh(
      new THREE.SphereGeometry(0.20, 16, 12),
      new THREE.MeshStandardMaterial({
        color: colorMap[compId] || 0x38bdf8,
        emissive: colorMap[compId] || 0x38bdf8,
        emissiveIntensity: 0.4,
        roughness: 0.2
      })
    );
    pill.position.set(sx, 1.45, -0.8);
    pillboxRoot.add(pill);
    droppingPills.push({ mesh: pill, startMs: performance.now(), startX: sx });
  }

  // =========================================================================
  // 6. TUONG TAC CHUOT 3D (RAYCASTER + TOOLTIP) & CAMERA PRESETS
  // =========================================================================
  function setupInteractions() {
    let downX = 0;
    let downY = 0;

    renderer.domElement.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });

    renderer.domElement.addEventListener('pointerup', (e) => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(buttonMeshes, false);
      if (hits.length > 0) {
        const btnId = hits[0].object.userData.btnId;
        if (btnId) {
          triggerVirtualButton(btnId);
        }
      }
    });

    renderer.domElement.addEventListener('pointermove', (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(buttonMeshes, false);

      if (hits.length > 0) {
        const ud = hits[0].object.userData;
        hoveredBtnId = ud.btnId;
        renderer.domElement.style.cursor = 'pointer';
        if (dom.btn3dTooltip && ud.tip) {
          dom.btn3dTooltip.textContent = ud.tip;
          dom.btn3dTooltip.style.left = `${e.clientX - rect.left}px`;
          dom.btn3dTooltip.style.top = `${e.clientY - rect.top}px`;
          dom.btn3dTooltip.style.display = 'block';
        }
      } else {
        hoveredBtnId = null;
        renderer.domElement.style.cursor = 'grab';
        if (dom.btn3dTooltip) {
          dom.btn3dTooltip.style.display = 'none';
        }
      }
    });

    renderer.domElement.addEventListener('pointerleave', () => {
      hoveredBtnId = null;
      if (dom.btn3dTooltip) dom.btn3dTooltip.style.display = 'none';
    });
  }

  function setupResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(200, Math.floor(entry.contentRect.width));
        const h = Math.max(240, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(dom.canvasContainer);
  }

  function flyCamera(pos, target) {
    camAnim.pos.copy(pos);
    camAnim.target.copy(target);
    camAnim.active = true;
  }

  function setPreset(presetKey) {
    document.querySelectorAll('.preset-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.preset === presetKey);
    });

    if (presetKey === 'overview') {
      simState.explodedMode = false;
      simState.xrayMode = false;
      simState.activeFocusKey = null;
      dom.focusBanner.classList.remove('visible');
      document.querySelectorAll('.hw-chip').forEach((c) => c.classList.remove('active'));
      applyXrayState();
      flyCamera(new THREE.Vector3(0.0, 7.6, 8.6), new THREE.Vector3(0, 0.9, 0.1));
    } else if (presetKey === 'front') {
      simState.explodedMode = false;
      simState.xrayMode = false;
      applyXrayState();
      flyCamera(new THREE.Vector3(0, 4.9, 6.2), new THREE.Vector3(0, 1.4, 1.7));
    } else if (presetKey === 'compartments') {
      simState.explodedMode = false;
      simState.xrayMode = false;
      applyXrayState();
      flyCamera(new THREE.Vector3(0, 8.2, 3.2), new THREE.Vector3(0, 1.2, -0.7));
    } else if (presetKey === 'electronics') {
      simState.explodedMode = false;
      simState.xrayMode = true;
      applyXrayState();
      flyCamera(new THREE.Vector3(5.8, 5.4, 5.2), new THREE.Vector3(0, 0.55, -0.4));
    } else if (presetKey === 'exploded') {
      simState.explodedMode = true;
      simState.xrayMode = true;
      applyXrayState();
      flyCamera(new THREE.Vector3(7.8, 7.8, 9.2), new THREE.Vector3(0, 1.6, 0));
    }
  }

  function focusComponent(focusKey) {
    const info = COMPONENT_INFO[focusKey];
    if (!info) return;

    simState.activeFocusKey = focusKey;
    document.querySelectorAll('.hw-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.focus === focusKey);
    });

    dom.focusTitle.textContent = info.title;
    dom.focusDesc.textContent = info.desc;
    dom.focusBanner.classList.add('visible');

    const isInternal = (focusKey === 'esp32' || focusKey === 'rtc' || focusKey === 'dht22' || focusKey === 'buzzer' || focusKey === 'servo');
    if (isInternal && !simState.xrayMode) {
      simState.xrayMode = true;
      applyXrayState();
    }

    flyCamera(info.camPos, info.camTarget);
  }

  // =========================================================================
  // 7. VONG LAP ANIMATION 60FPS (NANG KHAY SOI MACH, SERVO, NAP, LED, BUZZER)
  // =========================================================================
  let lastLcdTextKey = '';

  function animateScene() {
    requestAnimationFrame(animateScene);
    const nowMs = performance.now();

    if (camAnim.active) {
      camera.position.lerp(camAnim.pos, 0.08);
      controls.target.lerp(camAnim.target, 0.08);
      if (camera.position.distanceTo(camAnim.pos) < 0.05) {
        camAnim.active = false;
      }
    }
    controls.update();

    // Nang khay thuoc phia tren khi xem mach dien ben duoi / tach lop
    if (compartmentsGroup && frontPanelGroup) {
      const targetCompY = simState.explodedMode ? 1.85 : (simState.xrayMode ? 1.15 : 0);
      const targetFrontY = simState.explodedMode ? (1.54 + 0.55) : 1.54;
      compartmentsGroup.position.y += (targetCompY - compartmentsGroup.position.y) * 0.12;
      frontPanelGroup.position.y += (targetFrontY - frontPanelGroup.position.y) * 0.12;
    }

    // Dong hoc Servo SG90 & Nap 3 ngan thuoc
    simState.servoCurrentAngle += (simState.servoTargetAngle - simState.servoCurrentAngle) * 0.14;
    const rad = THREE.MathUtils.degToRad(simState.servoCurrentAngle);
    if (servoHornGroup) {
      servoHornGroup.rotation.y = rad;
    }
    if (linkageRodMesh && lockBarMesh) {
      const tipX = 0.14 - Math.sin(rad) * 0.42;
      const tipZ = -1.85 - Math.cos(rad) * 0.42;
      const pinX = -Math.sin(rad) * 0.42;
      const pinZ = -2.35;
      const midX = (tipX + pinX) * 0.5;
      const midZ = (tipZ + pinZ) * 0.5;
      linkageRodMesh.position.set(midX, 0.96, midZ);
      linkageRodMesh.rotation.set(Math.PI / 2, 0, Math.atan2(pinX - tipX, pinZ - tipZ));
      lockBarMesh.position.set(pinX, 0.96 + (simState.servoCurrentAngle / 90) * 0.12, pinZ);
    }

    ['A', 'B', 'C'].forEach((id) => {
      const pivot = lidPivots[id];
      if (!pivot) return;
      const shouldOpen = simState.lidOpen && (!simState.activeComp || simState.activeComp === id);
      const targetRot = shouldOpen ? -Math.PI / 2 : 0;
      pivot.rotation.x += (targetRot - pivot.rotation.x) * 0.12;
    });

    // Hoat canh highlight linh kien dang chon
    if (focusRingMesh) {
      if (simState.activeFocusKey && focusGroups[simState.activeFocusKey]) {
        const targetPos = new THREE.Vector3();
        focusGroups[simState.activeFocusKey].getWorldPosition(targetPos);
        focusRingMesh.position.set(targetPos.x, targetPos.y + 0.05, targetPos.z);
        const pulse = 1 + Math.sin(nowMs * 0.006) * 0.12;
        focusRingMesh.scale.set(pulse, pulse, 1);
        focusRingMesh.visible = true;
      } else {
        focusRingMesh.visible = false;
      }
    }

    // Hoat canh nhan phim co hoc 3D
    Object.keys(buttonAnimState).forEach((k) => {
      const st = buttonAnimState[k];
      if (!st || !st.mesh) return;
      const targetY = (nowMs < st.pressUntil) ? 0.035 : st.mesh.userData.baseY;
      st.mesh.position.y += (targetY - st.mesh.position.y) * 0.35;
    });

    // Hoat canh vien thuoc roi ra ngoai khi lay thuoc
    for (let i = droppingPills.length - 1; i >= 0; i--) {
      const item = droppingPills[i];
      const t = (nowMs - item.startMs) / 700;
      if (t >= 1) {
        pillboxRoot.remove(item.mesh);
        droppingPills.splice(i, 1);
      } else {
        item.mesh.position.y = 1.45 + Math.sin(t * Math.PI) * 1.45;
        item.mesh.position.z = -0.8 + t * 3.6;
        item.mesh.rotation.x += 0.15;
      }
    }

    // Nhip LED & Coi giong hardware.cpp
    const wallMs = Date.now();
    let greenLit = false;
    let redLit = false;
    let beepPhase = false;

    if (simState.fsmState === 'ERROR') {
      const onPhase = (wallMs % 400) < 200;
      redLit = onPhase;
      beepPhase = onPhase;
      if (onPhase && !lastBuzzerBeepPhase) playBeep(880, 0.14);
    } else if (simState.fsmState === 'REMINDER') {
      const cycle = wallMs % 2000;
      const onPhase = (cycle < 150) || (cycle >= 300 && cycle < 450) || (cycle >= 600 && cycle < 750);
      greenLit = onPhase;
      beepPhase = onPhase;
      if (onPhase && !lastBuzzerBeepPhase) playBeep(1480, 0.11);
    } else if (simState.fsmState === 'VERIFIED') {
      greenLit = true;
    }
    lastBuzzerBeepPhase = beepPhase;

    if (ledGreenMat && ledGreenLight) {
      ledGreenMat.emissiveIntensity = greenLit ? 2.2 : 0.16;
      ledGreenLight.intensity = greenLit ? 1.6 : 0;
    }
    if (ledRedMat && ledRedLight) {
      ledRedMat.emissiveIntensity = redLit ? 2.4 : 0.14;
      ledRedLight.intensity = redLit ? 1.8 : 0;
    }
    dom.indLedGreen.classList.toggle('green-on', greenLit);
    dom.indLedRed.classList.toggle('red-on', redLit);
    dom.indBuzzer.classList.toggle('buzzer-on', beepPhase);

    const [l1, l2] = computeLcdLines();
    const key = l1 + '|' + l2;
    if (key !== lastLcdTextKey) {
      lastLcdTextKey = key;
      dom.lcdLine1.textContent = l1;
      dom.lcdLine2.textContent = l2;
      drawLcdCanvas(l1, l2);
    }

    renderer.render(scene, camera);
  }

  // =========================================================================
  // 8. LOGIC FSM TUONG TAC 2 CHIEU & DONG BO FIREBASE
  // =========================================================================
  function clearLocalTimers() {
    if (simState.autoCloseTimer) {
      clearTimeout(simState.autoCloseTimer);
      simState.autoCloseTimer = null;
    }
    if (simState.verifyTimeoutTimer) {
      clearTimeout(simState.verifyTimeoutTimer);
      simState.verifyTimeoutTimer = null;
    }
  }

  function showCustomLcdBanner(line1, line2, durationMs) {
    simState.customBannerText = [formatLcd16(line1), formatLcd16(line2)];
    simState.customBannerUntilMs = Date.now() + (durationMs || 2500);
  }

  function setDemoLog(msg) {
    dom.demoLogBar.textContent = msg;
  }

  function pushFirebaseStatus() {
    if (!db) return;
    const comp = simState.compartments[simState.activeComp] || null;
    const payload = {
      online: true,
      lastSeen: Math.floor(Date.now() / 1000),
      currentTemp: Number(simState.temp.toFixed(1)),
      currentHumid: Number(simState.humid.toFixed(1)),
      currentState: simState.fsmState,
      activeAlarm: (simState.fsmState === 'ERROR' || simState.fsmState === 'REMINDER'),
      activeCompartment: simState.activeComp || '',
      medicineName: comp ? comp.displayName : '',
      lidOpen: simState.lidOpen,
      servoAngle: simState.servoTargetAngle,
      detectedUnits: simState.detectedUnits,
      expectedUnits: simState.expectedUnits,
      ledGreen: (simState.fsmState === 'REMINDER' || simState.fsmState === 'VERIFIED'),
      ledRed: (simState.fsmState === 'ERROR'),
      stockA: simState.compartments.A.currentStock,
      stockB: simState.compartments.B.currentStock,
      stockC: simState.compartments.C.currentStock
    };
    db.ref('deviceStatus').update(payload).catch(() => {});
  }

  function pushFirebaseEvent(statusStr) {
    if (!db) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const compId = simState.activeComp || 'A';
    const comp = simState.compartments[compId] || DEFAULT_COMPARTMENTS[compId];
    const eventId = `EVT-3D-${nowSec}-${compId}`;
    const qtyMatch = (simState.detectedUnits === simState.expectedUnits);
    db.ref(`events/${eventId}`).set({
      eventId: eventId,
      compartmentId: compId,
      medicineCode: comp.medicineCode || 'MED-001',
      expectedUnits: simState.expectedUnits,
      detectedUnits: simState.detectedUnits,
      compartmentMatch: true,
      quantityMatch: qtyMatch,
      userConfirmed: true,
      status: statusStr,
      timestamp: nowSec
    }).catch(() => {});
  }

  function syncCompartmentsStockToFirebase() {
    if (!db) return;
    ['A', 'B', 'C'].forEach((id) => {
      db.ref(`config/compartments/${id}/currentStock`).set(simState.compartments[id].currentStock).catch(() => {});
    });
  }

  function triggerScheduleDemo(compId, timeLabel) {
    clearLocalTimers();
    simState.lastLocalInteractionMs = Date.now();
    const comp = simState.compartments[compId];
    simState.fsmState = 'REMINDER';
    simState.activeComp = compId;
    simState.medicineName = comp.displayName;
    simState.expectedUnits = comp.unitsPerDose;
    simState.detectedUnits = 0;
    simState.lidOpen = false;
    simState.servoTargetAngle = 0;
    simState.customBannerText = null;

    setDemoLog(`[${timeLabel}] Đến giờ uống Ngăn ${compId} (${comp.displayName} - ${comp.unitsPerDose} viên). Bấm UỐNG THUỐC để mở nắp!`);
    updateRightPanelUI();
    pushFirebaseStatus();
  }

  function finalizeVerifiedCycle() {
    const comp = simState.compartments[simState.activeComp];
    if (comp) {
      comp.currentStock = Math.max(0, comp.currentStock - simState.expectedUnits);
      rebuildCompartmentPills();
      syncCompartmentsStockToFirebase();
    }
    simState.lidOpen = false;
    simState.servoTargetAngle = 0;
    simState.fsmState = 'CLOSED';
    pushFirebaseEvent('VERIFIED_BY_SIMULATION');
    pushFirebaseStatus();
    updateRightPanelUI();
    setDemoLog(`Hoàn tất cữ thuốc Ngăn ${simState.activeComp}: đã trừ tồn kho & đóng nắp bảo quản.`);

    setTimeout(() => {
      if (simState.fsmState === 'CLOSED') {
        simState.fsmState = 'IDLE';
        simState.activeComp = '';
        simState.detectedUnits = 0;
        simState.expectedUnits = 0;
        pushFirebaseStatus();
        updateRightPanelUI();
      }
    }, 1200);
  }

  function triggerVirtualButton(btnId) {
    simState.lastLocalInteractionMs = Date.now();
    if (buttonAnimState[btnId]) {
      buttonAnimState[btnId].pressUntil = performance.now() + 200;
    }

    const st = simState.fsmState;
    const comp = simState.compartments[simState.activeComp];

    if (btnId === 'TAKE') {
      if (st === 'REMINDER' || st === 'SNOOZED') {
        clearLocalTimers();
        simState.fsmState = 'OPEN';
        simState.lidOpen = true;
        simState.servoTargetAngle = 90;
        simState.detectedUnits = 0;
        simState.expectedUnits = comp ? comp.unitsPerDose : 1;
        setDemoLog(`Đã bấm UỐNG THUỐC: Nắp Ngăn ${simState.activeComp} mở 90°. Bấm LẤY 1 VIÊN để lấy thuốc!`);
        simState.verifyTimeoutTimer = setTimeout(() => {
          if (simState.fsmState === 'OPEN' || simState.fsmState === 'VERIFYING') {
            simState.fsmState = 'ERROR';
            simState.lidOpen = false;
            simState.servoTargetAngle = 0;
            pushFirebaseEvent(simState.detectedUnits === 0 ? 'NO_DETECTION' : 'MISMATCH_LESS');
            pushFirebaseStatus();
            updateRightPanelUI();
            setDemoLog('Hết 60s chờ: Chưa lấy đủ liều -> Báo động ERROR!');
          }
        }, 60000);
      } else {
        setDemoLog('Bấm chọn giờ uống (08:00 / 12:00 / 20:00) để kích hoạt nhắc nhở trước khi mở nắp.');
        return;
      }
    } else if (btnId === 'REMOVE') {
      if (st === 'OPEN' || st === 'VERIFYING' || st === 'VERIFIED') {
        simState.detectedUnits += 1;
        spawnDroppingPill(simState.activeComp || 'A');
        const exp = simState.expectedUnits || 1;
        if (simState.detectedUnits > exp) {
          clearLocalTimers();
          simState.fsmState = 'ERROR';
          simState.lidOpen = false;
          simState.servoTargetAngle = 0;
          pushFirebaseEvent('MISMATCH_MORE');
          setDemoLog(`CẢNH BÁO QUÁ LIỀU (${simState.detectedUnits}/${exp} viên)! Đã đóng nắp bảo vệ & bật còi báo lỗi!`);
        } else if (simState.detectedUnits === exp) {
          clearLocalTimers();
          simState.fsmState = 'VERIFIED';
          setDemoLog(`Đã lấy đủ ${exp}/${exp} viên! Chờ 5s đóng nắp tự động (có thể bấm LẤY 1 VIÊN để test quá liều).`);
          simState.autoCloseTimer = setTimeout(finalizeVerifiedCycle, 5000);
        } else {
          simState.fsmState = 'VERIFYING';
          setDemoLog(`Đã lấy 1 viên -> Tiến độ ${simState.detectedUnits}/${exp} viên.`);
        }
      } else {
        setDemoLog('Nắp đang đóng! Cần kích hoạt giờ uống và bấm UỐNG THUỐC trước khi lấy.');
        return;
      }
    } else if (btnId === 'SNOOZE') {
      if (st === 'REMINDER') {
        clearLocalTimers();
        simState.fsmState = 'SNOOZED';
        simState.lidOpen = false;
        simState.servoTargetAngle = 0;
        setDemoLog('Đã bấm HOÃN 5P: Tắt chuông nhắc & tạm hoãn 5 phút.');
      } else {
        setDemoLog('Nút HOÃN 5P chỉ dùng khi đang phát chuông nhắc uống.');
        return;
      }
    } else if (btnId === 'MENU') {
      clearLocalTimers();
      simState.fsmState = 'IDLE';
      simState.lidOpen = false;
      simState.servoTargetAngle = 0;
      simState.activeComp = '';
      simState.detectedUnits = 0;
      simState.expectedUnits = 0;
      if (simState.temp > 35.0) simState.temp = 28.0;
      setDemoLog('Đã bấm ĐẶT LẠI: Tắt cảnh báo, đưa hộp thuốc về chế độ chờ.');
    } else if (btnId === 'LOAD') {
      const keys = ['A', 'B', 'C'];
      const targetId = keys[simState.viewCompIndex % 3];
      simState.compartments[targetId].currentStock += 10;
      rebuildCompartmentPills();
      syncCompartmentsStockToFirebase();
      showCustomLcdBanner(`NAP THUOC NGAN ${targetId}`, `+10v -> Con:${simState.compartments[targetId].currentStock}`, 3000);
      setDemoLog(`Đã nạp +10 viên vào Ngăn ${targetId} (Tổng: ${simState.compartments[targetId].currentStock} viên).`);
    } else if (btnId === 'UP') {
      simState.viewCompIndex = (simState.viewCompIndex + 2) % 3;
      simState.viewingUntilMs = Date.now() + 4000;
      const vid = ['A', 'B', 'C'][simState.viewCompIndex];
      setDemoLog(`Đang xem thông tin Ngăn ${vid} trên màn hình hộp thuốc.`);
    } else if (btnId === 'DOWN') {
      simState.viewCompIndex = (simState.viewCompIndex + 1) % 3;
      simState.viewingUntilMs = Date.now() + 4000;
      const vid = ['A', 'B', 'C'][simState.viewCompIndex];
      setDemoLog(`Đang xem thông tin Ngăn ${vid} trên màn hình hộp thuốc.`);
    }

    updateRightPanelUI();
    pushFirebaseStatus();
  }

  function triggerOverdoseScenario() {
    clearLocalTimers();
    simState.lastLocalInteractionMs = Date.now();
    simState.activeComp = 'B';
    simState.expectedUnits = simState.compartments.B.unitsPerDose || 1;
    simState.detectedUnits = simState.expectedUnits + 1;
    simState.fsmState = 'ERROR';
    simState.lidOpen = false;
    simState.servoTargetAngle = 0;
    spawnDroppingPill('B');
    pushFirebaseEvent('MISMATCH_MORE');
    pushFirebaseStatus();
    updateRightPanelUI();
    setDemoLog('TC-06 Quá liều: Ngăn B lấy 2/1 viên -> Khóa nắp khẩn cấp & bật đèn đỏ + còi báo!');
  }

  function triggerOverheatScenario() {
    simState.lastLocalInteractionMs = Date.now();
    simState.temp = simState.temp > 35.0 ? 28.0 : 37.8;
    pushFirebaseStatus();
    updateRightPanelUI();
    setDemoLog(simState.temp > 35.0
      ? 'TC-10 Quá nhiệt: DHT22 đo 37.8°C (>35°C) -> Cảnh báo môi trường trên màn hình!'
      : 'Đã khôi phục nhiệt độ khoang thuốc về mức an toàn (28.0°C).');
  }

  // =========================================================================
  // 9. CAP NHAT GIAO DIEN COT PHAI & LANG NGHE FIREBASE
  // =========================================================================
  function updateRightPanelUI() {
    const meta = getStateMeta(simState.fsmState);
    dom.teleState.textContent = meta.title;
    dom.teleState.style.color = meta.color;
    dom.fsmDescription.textContent = meta.desc;

    dom.teleServoAngle.textContent = `${Math.round(simState.servoTargetAngle)}°`;
    dom.teleLidStatus.textContent = simState.lidOpen
      ? `Đang mở Ngăn ${simState.activeComp || 'A'}`
      : 'Nắp đang khóa an toàn';

    dom.teleActiveComp.textContent = simState.activeComp ? `Ngăn ${simState.activeComp}` : '--';
    dom.teleDetectedUnits.textContent = `Đã lấy: ${simState.detectedUnits}/${simState.expectedUnits} viên`;

    dom.teleTemp.textContent = simState.temp.toFixed(1);
    dom.teleHumid.textContent = simState.humid.toFixed(1);
    if (simState.temp > 35.0) {
      dom.teleEnvHint.textContent = 'CẢNH BÁO: Quá nhiệt > 35°C!';
      dom.teleEnvHint.style.color = '#f43f5e';
    } else {
      dom.teleEnvHint.textContent = 'Bảo quản an toàn (< 35°C)';
      dom.teleEnvHint.style.color = 'var(--text-secondary)';
    }

    renderStockList();
  }

  function renderStockList() {
    if (!dom.compStockList) return;
    let html = '';
    ['A', 'B', 'C'].forEach((id) => {
      const c = simState.compartments[id] || DEFAULT_COMPARTMENTS[id];
      const isActive = (simState.activeComp === id);
      html += `
        <div class="stock-row ${isActive ? 'active-comp' : ''}">
          <div class="stock-row-left">
            <span class="stock-row-title">Ngăn ${id} — ${c.displayName}</span>
            <span class="stock-row-sub">${c.schedule || '--:--'} • ${c.unitsPerDose || 1} viên/lần • ${c.medicineCode || ''}</span>
          </div>
          <span class="stock-pill-count">${c.currentStock} viên</span>
        </div>
      `;
    });
    dom.compStockList.innerHTML = html;
  }

  function bindFirebaseListeners() {
    if (!db) {
      dom.connStatusText.textContent = 'Chế độ Offline Local';
      return;
    }

    db.ref('.info/connected').on('value', (snap) => {
      const isOnline = snap.val() === true;
      dom.connPulse.className = isOnline ? 'pulse-dot online' : 'pulse-dot offline';
      dom.connStatusText.textContent = isOnline ? 'Firebase: Trực tuyến' : 'Firebase: Mất kết nối';
      dom.connStatusPill.style.borderColor = isOnline
        ? 'rgba(16, 185, 129, 0.4)'
        : 'rgba(244, 63, 94, 0.4)';
    }, () => {});

    db.ref('config/compartments').on('value', (snap) => {
      const val = snap.val();
      if (!val) return;
      ['A', 'B', 'C'].forEach((id) => {
        if (val[id]) {
          const preservedStock = simState.compartments[id].currentStock;
          simState.compartments[id] = Object.assign({}, DEFAULT_COMPARTMENTS[id], val[id]);
          if (typeof val[id].currentStock !== 'number') {
            simState.compartments[id].currentStock = preservedStock;
          }
        }
      });
      rebuildCompartmentPills();
      renderStockList();
    }, () => {});

    db.ref('inventory/compartments').on('value', (snap) => {
      const inv = snap.val();
      if (!inv) return;
      let changed = false;
      ['A', 'B', 'C'].forEach((id) => {
        if (inv[id] && typeof inv[id].currentStock === 'number' && simState.compartments[id].currentStock !== inv[id].currentStock) {
          simState.compartments[id].currentStock = inv[id].currentStock;
          changed = true;
        }
      });
      if (changed) {
        rebuildCompartmentPills();
        renderStockList();
      }
    }, () => {});

    db.ref('deviceStatus').on('value', (snap) => {
      const data = snap.val();
      if (!data) return;

      const justClickedLocally = (Date.now() - simState.lastLocalInteractionMs) < 900;
      if (!justClickedLocally) {
        if (typeof data.currentTemp === 'number') simState.temp = data.currentTemp;
        if (typeof data.currentHumid === 'number') simState.humid = data.currentHumid;
        if (data.currentState) simState.fsmState = normalizeState(data.currentState);
        if (data.activeCompartment !== undefined) simState.activeComp = data.activeCompartment;
        if (typeof data.lidOpen === 'boolean') {
          simState.lidOpen = data.lidOpen;
        } else {
          simState.lidOpen = (simState.fsmState === 'OPEN' || simState.fsmState === 'VERIFYING' || simState.fsmState === 'VERIFIED');
        }
        if (typeof data.servoAngle === 'number') {
          simState.servoTargetAngle = data.servoAngle;
        } else {
          simState.servoTargetAngle = simState.lidOpen ? 90 : 0;
        }
        if (typeof data.detectedUnits === 'number') {
          if (data.detectedUnits > simState.detectedUnits) {
            spawnDroppingPill(simState.activeComp || 'A');
          }
          simState.detectedUnits = data.detectedUnits;
        }
        if (typeof data.expectedUnits === 'number') simState.expectedUnits = data.expectedUnits;

        let stockChanged = false;
        ['A', 'B', 'C'].forEach((id) => {
          const field = 'stock' + id;
          if (typeof data[field] === 'number' && simState.compartments[id].currentStock !== data[field]) {
            simState.compartments[id].currentStock = data[field];
            stockChanged = true;
          }
        });
        if (stockChanged) rebuildCompartmentPills();
      }

      if (data.lastSeen) {
        const d = new Date(data.lastSeen * 1000);
        dom.lastSeenDisplay.textContent = `Cập nhật: ${d.toLocaleTimeString('vi-VN')}`;
      }
      updateRightPanelUI();
    }, () => {});
  }

  // =========================================================================
  // 10. GAN SU KIEN UI & KHOI CHAY
  // =========================================================================
  function bindUIEvents() {
    dom.btnToggleXray.addEventListener('click', () => {
      simState.xrayMode = !simState.xrayMode;
      if (!simState.xrayMode) {
        simState.explodedMode = false;
        simState.activeFocusKey = null;
        dom.focusBanner.classList.remove('visible');
        document.querySelectorAll('.hw-chip').forEach((c) => c.classList.remove('active'));
        document.querySelectorAll('.preset-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.preset === 'overview');
        });
      }
      applyXrayState();
    });

    dom.btnToggleAudio.addEventListener('click', () => {
      simState.audioEnabled = !simState.audioEnabled;
      dom.btnToggleAudio.classList.toggle('active', simState.audioEnabled);
      dom.btnToggleAudio.textContent = simState.audioEnabled
        ? 'Âm thanh Buzzer: BẬT'
        : 'Âm thanh Buzzer: TẮT';
      if (simState.audioEnabled) playBeep(1480, 0.08);
    });

    dom.presetButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.preset-btn');
      if (btn && btn.dataset.preset) {
        setPreset(btn.dataset.preset);
      }
    });

    dom.hardwareLegend.addEventListener('click', (e) => {
      const chip = e.target.closest('.hw-chip');
      if (chip && chip.dataset.focus) {
        focusComponent(chip.dataset.focus);
      }
    });

    dom.btnClearFocus.addEventListener('click', () => {
      setPreset('overview');
    });

    document.getElementById('btnSim0800').addEventListener('click', () => triggerScheduleDemo('A', '08:00:00'));
    document.getElementById('btnSim1200').addEventListener('click', () => triggerScheduleDemo('B', '12:00:00'));
    document.getElementById('btnSim2000').addEventListener('click', () => triggerScheduleDemo('C', '20:00:00'));

    document.getElementById('btnPhysTake').addEventListener('click', () => triggerVirtualButton('TAKE'));
    document.getElementById('btnPhysRemove').addEventListener('click', () => triggerVirtualButton('REMOVE'));
    document.getElementById('btnPhysSnooze').addEventListener('click', () => triggerVirtualButton('SNOOZE'));
    document.getElementById('btnPhysMenu').addEventListener('click', () => triggerVirtualButton('MENU'));
    document.getElementById('btnPhysLoad').addEventListener('click', () => triggerVirtualButton('LOAD'));
    document.getElementById('btnPhysUp').addEventListener('click', () => triggerVirtualButton('UP'));
    document.getElementById('btnPhysDown').addEventListener('click', () => triggerVirtualButton('DOWN'));

    document.getElementById('btnTestOverdose').addEventListener('click', triggerOverdoseScenario);
    document.getElementById('btnTestOverheat').addEventListener('click', triggerOverheatScenario);
  }

  function bootstrap() {
    bindUIEvents();
    updateRightPanelUI();
    bindFirebaseListeners();
    if (initThreeScene()) {
      animateScene();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
