(function (root) {
  'use strict';
  let access = { role: null, canRead: false, canWrite: false };
  let generation = 0;
  function claimsAccess(claims) {
    const canRead = claims?.pillboxId === 'pillbox-nhom13' && ['viewer', 'caregiver', 'admin'].includes(claims.role);
    return { role: canRead ? claims.role : null, canRead, canWrite: canRead && ['caregiver', 'admin'].includes(claims.role) };
  }
  function start(onChange) {
    const form = document.getElementById('loginForm');
    const hint = document.getElementById('authMessage');
    const logout = document.getElementById('btnLogout');
    const roleLabel = document.getElementById('accessRole');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      hint.textContent = 'Đang đăng nhập...';
      try {
        await firebase.auth().signInWithEmailAndPassword(document.getElementById('loginEmail').value.trim(), document.getElementById('loginPassword').value);
        document.getElementById('loginPassword').value = '';
      } catch { hint.textContent = 'Đăng nhập không thành công. Kiểm tra tài khoản và cấu hình Firebase Auth.'; }
    });
    logout.addEventListener('click', () => firebase.auth().signOut());
    if (!root.PILLBOX_FIREBASE_CONFIG?.apiKey) {
      hint.textContent = 'Cần cấu hình Firebase Web API key và bật đăng nhập Email/Password cho dự án.';
      onChange(access); return;
    }
    firebase.auth().onIdTokenChanged(async user => {
      const current = ++generation;
      access = { role: null, canRead: false, canWrite: false };
      onChange(access); // Immediately detach previous user's listeners while claims are checked.
      if (user) {
        try {
          const next = claimsAccess((await user.getIdTokenResult()).claims);
          if (current !== generation) return;
          access = next;
        } catch { /* fail closed */ }
      }
      if (current !== generation) return;
      form.hidden = access.canRead;
      logout.hidden = !user;
      roleLabel.textContent = access.canRead ? `${user.email} • ${access.canWrite ? 'Người quản lý' : 'Chỉ xem'}` : 'Chưa có quyền truy cập';
      hint.textContent = user && !access.canRead ? 'Tài khoản chưa được quản trị viên cấp quyền cho hộp thuốc.' : '';
      onChange(access);
    });
  }
  async function token() {
    if (!firebase.auth().currentUser) throw new Error('AUTH_REQUIRED');
    return firebase.auth().currentUser.getIdToken();
  }
  const api = { claimsAccess, start, token, canWrite: () => access.canWrite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PillboxAccess = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
