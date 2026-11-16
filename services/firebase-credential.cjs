'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { applicationDefault } = require('firebase-admin/app');

// Workstation mode reuses the account explicitly selected by the owner in Firebase CLI.
// Tokens remain in the CLI's existing private cache and process memory, never project files.
function getCredential(env = process.env) {
  if (env.GOOGLE_APPLICATION_CREDENTIALS) return applicationDefault();
  if (!env.FIREBASE_CLI_ACCOUNT) throw new Error('Cần GOOGLE_APPLICATION_CREDENTIALS hoặc FIREBASE_CLI_ACCOUNT đã đăng nhập.');
  const directory = env.FIREBASE_TOOLS_LIB || path.join(os.homedir(), 'AppData/Roaming/npm/node_modules/firebase-tools/lib');
  if (!fs.existsSync(path.join(directory, 'auth.js'))) throw new Error('Không tìm thấy Firebase CLI. Đặt FIREBASE_TOOLS_LIB hoặc dùng service account.');
  const auth = require(path.join(directory, 'auth.js'));
  if (typeof auth.getAllAccounts !== 'function' || typeof auth.getAccessToken !== 'function') throw new Error('Firebase CLI không tương thích; dùng service account hoặc kiểm tra phiên bản CLI.');
  return {
    async getAccessToken() {
      const account = auth.getAllAccounts().find(item => item.user.email === env.FIREBASE_CLI_ACCOUNT);
      if (!account?.tokens?.refresh_token) throw new Error('Tài khoản đã chọn chưa đăng nhập Firebase CLI.');
      let tokens = account.tokens;
      if (!tokens.access_token || !tokens.expires_at || tokens.expires_at - Date.now() < 60000) {
        const grantedScopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : tokens.scopes;
        tokens = await auth.getAccessToken(tokens.refresh_token,
          grantedScopes?.length ? grantedScopes : ['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/userinfo.email']);
      }
      if (!tokens.access_token) throw new Error('Không lấy được token Firebase CLI.');
      return { access_token: tokens.access_token, expires_in: Math.max(60, Math.floor(((tokens.expires_at || Date.now() + 3600000) - Date.now()) / 1000)) };
    }
  };
}
module.exports = { getCredential };
