'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getCredential } = require('./firebase-credential.cjs');
const { getDatabase } = require('firebase-admin/database');
const { validateConfig } = require('./domain.cjs');
async function main() {
  const migrate = process.argv.includes('--migrate');
  const app = initializeApp({ credential:getCredential(),projectId:process.env.FIREBASE_PROJECT_ID,databaseURL:process.env.FIREBASE_DATABASE_URL });
  try {
    const db = getDatabase(app);
    const oldConfig = (await db.ref('config/compartments').get()).val();
    const oldInventory = (await db.ref('inventory/compartments').get()).val();
    const fallback = Object.fromEntries(['A','B','C'].map(id=>[id,{compartmentId:id,medicineCode:`MED-${id}`,displayName:`Thuoc ${id}`,unitsPerDose:1,schedule:'08:00',isLoaded:false}]));
    const allowed = ['compartmentId','medicineCode','displayName','unitsPerDose','schedule','isLoaded'];
    const clean = input => Object.fromEntries(['A','B','C'].map(id=>[id,Object.fromEntries(allowed.filter(field=>Object.hasOwn(input[id]||{},field)).map(field=>[field,input[id][field]]))]));
    validateConfig(clean(oldConfig || fallback));
    if (!migrate) { console.log(`Firebase đọc được. Cấu hình ${oldConfig?'đã có':'chưa có'}, tồn kho ${oldInventory?'đã có':'chưa có'}. Dùng --migrate để sao lưu và chuyển cấu trúc.`); return; }
    const directory = path.join(__dirname,'data/backups'); fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,`before-migration-${Date.now()}.json`),JSON.stringify({config:oldConfig,inventory:oldInventory},null,2),{mode:0o600});
    // Transaction preserves any concurrent inventory write; only seed missing slots.
    await db.ref('inventory/compartments').transaction(current=> {
      current ||= {};
      for(const id of ['A','B','C']) if(!current[id]) {
        const legacy = oldConfig?.[id]?.currentStock;
        current[id]={currentStock:Number.isInteger(legacy)&&legacy>=0&&legacy<=100?legacy:0,revision:0,updatedAt:Date.now()};
      }
      return current;
    });
    await db.ref('config/compartments').transaction(current=>{
      const result=clean(current||fallback); validateConfig(result); return result;
    });
    console.log('Đã sao lưu cấu hình/tồn kho và chuyển cấu trúc. Ngăn mới mặc định chưa nạp; tồn kho mới mặc định 0.');
  } finally { await deleteApp(app); }
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
