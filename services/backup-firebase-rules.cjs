const fs=require('node:fs');
const path=require('node:path');
const {getCredential}=require('./firebase-credential.cjs');
async function main(){
  const {access_token}=await getCredential().getAccessToken();
  const response=await fetch(process.env.FIREBASE_DATABASE_URL.replace(/\/$/,'')+'/.settings/rules.json',{headers:{Authorization:`Bearer ${access_token}`}});
  if(!response.ok)throw new Error('RULES_BACKUP_FAILED');
  const rules=await response.json();
  if(!rules.rules)throw new Error('INVALID_RULES_RESPONSE');
  const directory=path.join(__dirname,'data/backups');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,`rules-before-${Date.now()}.json`),JSON.stringify(rules,null,2),{mode:0o600});
  console.log('Đã sao lưu rules hiện tại trong services/data/backups.');
}
main().catch(()=>{console.error('RULES_BACKUP_FAILED');process.exit(1);});
