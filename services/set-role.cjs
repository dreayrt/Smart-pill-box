const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getCredential } = require('./firebase-credential.cjs');
const { getAuth } = require('firebase-admin/auth');
const { DEVICE } = require('./domain.cjs');
async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !['viewer', 'caregiver', 'admin'].includes(role)) throw new Error('Dùng: npm run user:role -- email viewer|caregiver|admin');
  const app = initializeApp({ credential: getCredential(), projectId: process.env.FIREBASE_PROJECT_ID });
  const user = await getAuth(app).getUserByEmail(email);
  await getAuth(app).setCustomUserClaims(user.uid, { ...user.customClaims, role, pillboxId: DEVICE });
  await getAuth(app).revokeRefreshTokens(user.uid);
  console.log(`Đã gán vai trò ${role}. Người dùng cần đăng nhập lại.`);
  await deleteApp(app);
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
