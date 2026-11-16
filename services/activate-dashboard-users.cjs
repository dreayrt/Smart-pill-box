'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getCredential } = require('./firebase-credential.cjs');
const { DEVICE } = require('./domain.cjs');
async function main() {
  const app = initializeApp({credential:getCredential(),projectId:process.env.FIREBASE_PROJECT_ID});
  const file = path.join(__dirname,'secrets/dashboard-accounts.json');
  try {
    const auth = getAuth(app);
    await auth.listUsers(1); // Authentication must have been initialized first.
    const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : [];
    for (const role of ['admin','viewer']) {
      let entry = saved.find(value=>value.role===role);
      if (!entry) {
        let email = `${role}@pillbox.local`;
        try { await auth.getUserByEmail(email); email = `${role}-${randomBytes(4).toString('hex')}@pillbox.local`; }
        catch(error) { if(error.code!=='auth/user-not-found') throw error; }
        entry={role,email,password:'P1!'+randomBytes(20).toString('hex')};
        // Persist before creating the account, so interrupted activation can resume.
        saved.push(entry); fs.writeFileSync(file,JSON.stringify(saved,null,2),{mode:0o600});
      }
      let user;
      try { user=await auth.getUserByEmail(entry.email); }
      catch(error) { if(error.code!=='auth/user-not-found') throw error; user=await auth.createUser({email:entry.email,password:entry.password,displayName:role==='admin'?'Quản lý hộp thuốc':'Chỉ xem hộp thuốc'}); }
      await auth.setCustomUserClaims(user.uid,{...user.customClaims,role,pillboxId:DEVICE});
    }
    console.log('Đã chuẩn bị tài khoản dashboard admin và viewer. Thông tin đăng nhập riêng lưu ở services/secrets/dashboard-accounts.json; không dùng mật khẩu Google.');
  } finally {await deleteApp(app);}
}
main().catch(error=>{console.error(error.code||'AUTH_ACTIVATION_FAILED');process.exit(1);});
