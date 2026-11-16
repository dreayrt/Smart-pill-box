const path=require('node:path');
const os=require('node:os');
async function main(){
  const auth=require(path.join(process.env.FIREBASE_TOOLS_LIB||path.join(os.homedir(),'AppData/Roaming/npm/node_modules/firebase-tools/lib'),'auth.js'));
  const account=auth.getAllAccounts().find(value=>value.user.email===process.env.FIREBASE_CLI_ACCOUNT);
  if(!account)throw new Error('ACCOUNT_NOT_FOUND');
  const scopes=account.tokens.scope?.split(/\s+/).filter(Boolean)||account.tokens.scopes||[];
  const token=await auth.getAccessToken(account.tokens.refresh_token,scopes);
  console.log(JSON.stringify({refreshSucceeded:!!token.access_token,expiryInFuture:token.expires_at>Date.now()}));
}
main().catch(()=>{console.error('CLI_REFRESH_FAILED');process.exit(1);});
