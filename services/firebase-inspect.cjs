'use strict';
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getAuth } = require('firebase-admin/auth');
const { getCredential } = require('./firebase-credential.cjs');
async function main() {
  const app = initializeApp({ credential:getCredential(),projectId:process.env.FIREBASE_PROJECT_ID,databaseURL:process.env.FIREBASE_DATABASE_URL });
  try {
    const config = (await getDatabase(app).ref('config/compartments').get()).val();
    const users = await getAuth(app).listUsers(1000);
    console.log(JSON.stringify({ databaseReadable:true, compartmentIds:Object.keys(config||{}), authReadable:true, authUserCount:users.users.length }));
  } finally { await deleteApp(app); }
}
main().catch(error=>{console.error(error.code || 'FIREBASE_INSPECTION_FAILED');process.exit(1);});
