const fs=require('node:fs');
const path=require('node:path');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getDatabase}=require('firebase-admin/database');
const {getAuth}=require('firebase-admin/auth');
const {getCredential}=require('./firebase-credential.cjs');
async function main(){
  const app=initializeApp({credential:getCredential(),projectId:process.env.FIREBASE_PROJECT_ID,databaseURL:process.env.FIREBASE_DATABASE_URL});
  try{
    const accounts=JSON.parse(fs.readFileSync(path.join(__dirname,'secrets/dashboard-accounts.json'),'utf8'));
    const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../dashboard/firebase-web-config.local.json'),'utf8'));
    const tokens={};
    for(const account of accounts){
      const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password,returnSecureToken:true})});
      const result=await response.json();
      if(!response.ok||!result.idToken)throw new Error('DASHBOARD_SIGNIN_FAILED');
      const claims=await getAuth(app).verifyIdToken(result.idToken,true);
      if(claims.role!==account.role||claims.pillboxId!=='pillbox-nhom13')throw new Error('ROLE_CLAIMS_MISMATCH');
      tokens[account.role]=result.idToken;
    }
    const status={adminSignedIn:!!tokens.admin,viewerSignedIn:!!tokens.viewer};
    if(process.argv.includes('--rules')){
      const base=process.env.FIREBASE_DATABASE_URL.replace(/\/$/,'');
      const anon=await fetch(`${base}/deviceStatus.json`);
      const viewer=await fetch(`${base}/deviceStatus.json?auth=${encodeURIComponent(tokens.viewer)}`);
      const dose=(await getDatabase(app).ref('config/compartments/A/unitsPerDose').get()).val();
      if(!Number.isInteger(dose))throw new Error('INVALID_EXISTING_CONFIG');
      // Write the existing value, so even a rules failure cannot alter a dose.
      const write=token=>fetch(`${base}/config/compartments/A/unitsPerDose.json?auth=${encodeURIComponent(token)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(dose)});
      const denied=await write(tokens.viewer), allowed=await write(tokens.admin);
      Object.assign(status,{anonymousDenied:[401,403].includes(anon.status),viewerCanRead:viewer.ok,viewerWriteDenied:[401,403].includes(denied.status),adminCanWrite:allowed.ok});
      if(Object.values(status).some(value=>value!==true))throw new Error('LIVE_RULES_CHECK_FAILED');
    }
    console.log(JSON.stringify(status));
  }finally{await deleteApp(app);}
}
main().catch(error=>{console.error(error.code||error.message?.match(/^[A-Z_]+$/)?.[0]||'LIVE_FIREBASE_CHECK_FAILED');process.exit(1);});
